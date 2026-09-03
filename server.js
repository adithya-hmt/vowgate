import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { interpretIntent } from "./lib/intent.js";
import {
  baseCatalog,
  createOpenMandate,
  demoIntent,
  merchant,
  RedemptionLedger,
  runMandate,
  runScenario,
  runSuite,
  scenarios,
} from "./lib/vowgate.js";
import {
  createOrderOnce,
  createRazorpayOrder,
  hasRazorpayApiConfig,
  hasRazorpayCliConfig,
  verifyPaymentSignature,
} from "./lib/razorpay.js";
import { EventLedger, verifyWebhookSignature } from "./lib/webhook.js";

try {
  loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const port = Number(process.env.PORT || 3000);
const root = fileURLToPath(new URL("./public", import.meta.url));
const signingSecret = process.env.MANDATE_SIGNING_SECRET || randomBytes(32).toString("hex");
const allowedAssets = new Set(["/", "/index.html", "/styles.css", "/app.js"]);
const contentTypes = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
const webhookEvents = new EventLedger();
const redemptionLedger = new RedemptionLedger();
const orderRequests = new Map();
const createdOrders = new Map();
const verifiedPayments = new Map();
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
  if (!allowedAssets.has(pathname)) return false;
  const filename = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = await readFile(join(root, filename));
  response.writeHead(200, { "content-type": `${contentTypes[extname(filename)]}; charset=utf-8` });
  response.end(file);
  return true;
}

const server = createServer(async (request, response) => {
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
        openMandate: createOpenMandate(intent, { secret: signingSecret }),
      });
    }

    if (request.method === "POST" && url.pathname === "/api/scenario") {
      const data = JSON.parse((await body(request)).toString("utf8"));
      return send(response, 200, runScenario(data.id, { secret: signingSecret }));
    }

    if (request.method === "POST" && url.pathname === "/api/suite") {
      return send(response, 200, runSuite({ secret: signingSecret }));
    }

    if (request.method === "POST" && url.pathname === "/api/order") {
      const data = JSON.parse((await body(request)).toString("utf8"));
      const mandateId = data.openMandate?.id;
      if (typeof mandateId !== "string") throw new Error("A signed open mandate is required.");

      const order = await createOrderOnce(orderRequests, mandateId, async () => {
        const run = runMandate(data.openMandate, { secret: signingSecret, ledger: redemptionLedger });
        if (run.result.decision !== "authorized") {
          throw Object.assign(new Error(run.result.detail), { status: 409, payload: run.result });
        }
        try {
          const created = await createRazorpayOrder(
            run.checkout,
            run.paymentMandate.id,
            process.env,
            { useCli: razorpayCliConfigured },
          );
          createdOrders.set(created.id, { ...created, paymentMandateId: run.paymentMandate.id });
          return created;
        } catch (error) {
          redemptionLedger.release(run.paymentMandate.id);
          throw error;
        }
      });
      return send(response, 201, order);
    }

    if (request.method === "POST" && url.pathname === "/api/payment/verify") {
      if (!razorpayApiConfigured) return send(response, 503, { error: "Razorpay test checkout is not configured." });
      const data = JSON.parse((await body(request)).toString("utf8"));
      const { orderId, paymentId, signature } = data;
      const order = createdOrders.get(orderId);
      if (!order || order.mode !== "razorpay-test") return send(response, 404, { error: "Authorized order not found." });
      if (!verifyPaymentSignature(orderId, paymentId, signature, process.env.RAZORPAY_KEY_SECRET)) {
        return send(response, 400, { error: "Payment signature verification failed." });
      }

      const previous = verifiedPayments.get(orderId);
      if (previous && previous.paymentId !== paymentId) return send(response, 409, { error: "Order already has a verified payment." });
      const payment = previous || {
        verified: true,
        code: "PAYMENT_VERIFIED",
        orderId,
        paymentId,
        amount: order.amount,
        currency: order.currency,
      };
      verifiedPayments.set(orderId, payment);
      return send(response, 200, { ...payment, duplicate: Boolean(previous) });
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

    send(response, 404, { error: "Not found." });
  } catch (error) {
    send(response, error.status || 400, error.payload || { error: error.message });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Vowgate listening on http://localhost:${port}`));
