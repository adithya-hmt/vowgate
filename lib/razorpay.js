import { execFile } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function hasRazorpayCliConfig() {
  return existsSync(join(homedir(), ".razorpay", "config.yaml"));
}

export function hasRazorpayApiConfig(env = process.env) {
  return env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") && Boolean(env.RAZORPAY_KEY_SECRET);
}

export function verifyPaymentSignature(orderId, paymentId, signature, secret) {
  if (![orderId, paymentId, signature, secret].every((value) => typeof value === "string" && value)) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex"));
  const received = Buffer.from(signature);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function createRazorpayOrder(checkout, mandateId, env = process.env, { useCli = false, exec = execFileAsync, request = fetch } = {}) {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  const receipt = checkout.id.slice(0, 40);
  const notes = { vowgate_mandate: mandateId.slice(0, 256), merchant: "Nightswitch Supply" };

  if (keyId || keySecret) {
    if (!hasRazorpayApiConfig(env)) throw new Error("Complete Razorpay test-mode credentials are required.");
    try {
      const response = await request("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ amount: checkout.total, currency: checkout.currency, receipt, notes }),
      });
      if (!response.ok) {
        throw Object.assign(new Error(`Razorpay order creation failed with ${response.status}.`), {
          orderCreationOutcome: response.status < 500 ? "definitive-failure" : "ambiguous",
        });
      }
      return { ...(await response.json()), mode: "razorpay-test", checkoutKey: keyId };
    } catch (error) {
      error.orderCreationOutcome ||= "ambiguous";
      throw error;
    }
  }

  if (useCli) {
    try {
      const { stdout } = await exec("razorpay", [
        "orders", "create",
        "--amount", String(checkout.total),
        "--currency", checkout.currency,
        "--receipt", receipt,
        "--note", `vowgate_mandate=${notes.vowgate_mandate}`,
        "--note", `merchant=${notes.merchant}`,
      ], { encoding: "utf8", env: { ...process.env, RAZORPAY_OUTPUT_FORMAT: "json" } });
      return { ...JSON.parse(stdout), mode: "razorpay-cli" };
    } catch (error) {
      error.orderCreationOutcome = "ambiguous";
      throw error;
    }
  }

  return {
    id: `order_sim_${checkout.id.slice(-8)}`,
    amount: checkout.total,
    currency: checkout.currency,
    status: "created",
    mode: "simulated",
  };
}
