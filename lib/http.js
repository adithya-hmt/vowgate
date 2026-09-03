import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { interpretIntent } from "./intent.js";
import { createMandateStateStore } from "./mandate-state.js";
import { createAuthorizedOrder } from "./order.js";
import {
  activateOpenMandate,
  baseCatalog,
  createAuthorizationReview,
  demoIntent,
  merchant,
  runScenario,
  runSuite,
  scenarios,
  verifyOrderEvidence,
} from "./vowgate.js";
import {
  createRazorpayOrder,
  hasRazorpayApiConfig,
  hasRazorpayCliConfig,
  verifyPaymentSignature,
} from "./razorpay.js";
import { EventLedger, verifyWebhookSignature } from "./webhook.js";

try {
  loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const root = fileURLToPath(new URL("../public", import.meta.url));
const signingSecret = process.env.MANDATE_SIGNING_SECRET || randomBytes(32).toString("hex");
const allowedAssets = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/privacy", "privacy.html"],
  ["/privacy.html", "privacy.html"],
  ["/terms", "terms.html"],
  ["/terms.html", "terms.html"],
  ["/404.html", "404.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/favicon.svg", "favicon.svg"],
  ["/vowgate-product.png", "vowgate-product.png"],
]);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const webhookEvents = new EventLedger();
const mandateStates = createMandateStateStore();
const razorpayApiConfigured = hasRazorpayApiConfig();
const razorpayCliConfigured = hasRazorpayCliConfig();

function send(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100_000) throw new Error("Request too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function serveAsset(pathname, response) {
  const filename = allowedAssets.get(pathname);
  if (!filename) return false;
  const file = await readFile(join(root, filename));
  response.writeHead(200, { "content-type": contentTypes[extname(filename)] });
  response.end(file);
  return true;
}

export async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    if (request.method === "GET" && await serveAsset(url.pathname, response)) return;

    if (request.method === "GET" && url.pathname === "/api/health") {
      return send(response, 200, { status: "ok", product: "Vowgate", version: "1.0.0" });
    }

    if (request.method === "GET" && url.pathname === "/api/state") {
      return send(response, 200, {
        merchant,
        catalog: baseCatalog,
        demoIntent,
        scenarios,
        modes: {
          intent: process.env.GEMINI_API_KEY ? "Gemini 2.5 Flash Lite" : "Verified fixture",
          mandateState: mandateStates.kind === "upstash" ? "Persistent atomic Redis" : "Local in-memory",
          payment: razorpayApiConfigured
            ? "Razorpay test checkout"
            : process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_SECRET
              ? "Non-test credentials blocked"
              : razorpayCliConfigured ? "Razorpay test CLI" : "Simulated",
        },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/intent") {
      const data = JSON.parse((await body(request)).toString("utf8"));
      const intent = await interpretIntent(data.text);
      return send(response, 200, {
        intent,
        authorizationReview: createAuthorizationReview(intent, { secret: signingSecret }),
      });
    }

    if (request.method === "POST" && url.pathname === "/api/mandate") {
      const data = JSON.parse((await body(request)).toString("utf8"));
      return send(response, 201, {
        openMandate: activateOpenMandate(data.authorizationReview, { secret: signingSecret }),
      });
    }

    if (request.method === "POST" && url.pathname === "/api/scenario") {
      const data = JSON.parse((await body(request)).toString("utf8"));
      return send(response, 200, await runScenario(data.id, { secret: signingSecret }));
    }

    if (request.method === "POST" && url.pathname === "/api/suite") {
      return send(response, 200, await runSuite({ secret: signingSecret }));
    }

    if (request.method === "POST" && url.pathname === "/api/order") {
      const data = JSON.parse((await body(request)).toString("utf8"));
      const mandateId = data.openMandate?.id;
      if (typeof mandateId !== "string") throw new Error("A signed open mandate is required.");

      const order = await createAuthorizedOrder(data.openMandate, {
        secret: signingSecret,
        stateStore: mandateStates,
        createOrder: (checkout, paymentMandateId) => createRazorpayOrder(
          checkout,
          paymentMandateId,
          process.env,
          { useCli: razorpayCliConfigured },
        ),
      });
      return send(response, 201, order);
    }

    if (request.method === "POST" && url.pathname === "/api/payment/verify") {
      if (!razorpayApiConfigured) return send(response, 503, { error: "Razorpay test checkout is not configured." });
      const data = JSON.parse((await body(request)).toString("utf8"));
      const { orderId, paymentId, signature, evidence } = data;
      if (
        !verifyOrderEvidence(evidence, signingSecret) ||
        evidence.orderId !== orderId ||
        evidence.mode !== "razorpay-test"
      ) return send(response, 400, { error: "Authorized order evidence is invalid." });
      if (Date.now() > evidence.expiresAt) return send(response, 410, { error: "Payment verification window expired." });
      if (!verifyPaymentSignature(orderId, paymentId, signature, process.env.RAZORPAY_KEY_SECRET)) {
        return send(response, 400, { error: "Payment signature verification failed." });
      }
      const transition = await mandateStates.recordPaymentVerified(
        evidence.paymentMandateId,
        orderId,
        paymentId,
        evidence.checkoutHash,
      );
      if (!transition.ok) {
        return send(response, 409, { error: "Payment Mandate state transition failed.", code: transition.reason });
      }

      return send(response, 200, {
        verified: true,
        code: "PAYMENT_VERIFIED",
        mandateState: "PAYMENT_VERIFIED",
        orderId,
        paymentId,
        amount: evidence.amount,
        currency: evidence.currency,
      });
    }

    if (request.method === "POST" && url.pathname === "/api/webhooks/razorpay") {
      const raw = await body(request);
      const eventId = request.headers["x-razorpay-event-id"];
      const signature = request.headers["x-razorpay-signature"];
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!secret) return send(response, 503, { error: "Webhook secret is not configured." });
      if (!verifyWebhookSignature(raw, signature, secret)) return send(response, 400, { error: "Invalid signature." });
      if (!eventId) return send(response, 400, { error: "Missing event id." });
      JSON.parse(raw.toString("utf8"));
      if (!webhookEvents.claim(eventId)) return send(response, 200, { duplicate: true });
      return send(response, 202, { accepted: true, eventId });
    }

    if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
      const file = await readFile(join(root, "404.html"));
      response.writeHead(404, { "content-type": contentTypes[".html"] });
      return response.end(file);
    }
    send(response, 404, { error: "Not found." });
  } catch (error) {
    send(response, error.status || 400, error.payload || { error: error.message });
  }
}
