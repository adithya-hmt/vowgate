import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  baseCatalog,
  chooseProduct,
  createOpenMandate,
  demoIntent,
  runScenario,
  runSuite,
  verifyOpenMandate,
} from "../lib/vowgate.js";
import { interpretIntent } from "../lib/intent.js";
import { createOrderOnce, createRazorpayOrder } from "../lib/razorpay.js";
import { EventLedger, verifyWebhookSignature } from "../lib/webhook.js";

const now = Date.UTC(2026, 7, 1, 12);

test("selects the one catalog item that satisfies explicit intent", () => {
  assert.equal(chooseProduct(demoIntent, baseCatalog).sku, "NS-L01");
});

test("signs and verifies an open checkout mandate", () => {
  const mandate = createOpenMandate(demoIntent, { now, secret: "test", id: "1" });
  assert.equal(verifyOpenMandate(mandate, "test"), true);
  mandate.constraints.maxAmount += 1;
  assert.equal(verifyOpenMandate(mandate, "test"), false);
});

test("passes a valid purchase and blocks every adversarial scenario", () => {
  const suite = runSuite({ now, secret: "test" });
  assert.equal(suite.metrics.scenarios, 6);
  assert.equal(suite.metrics.passed, 6);
  assert.equal(suite.metrics.unsafeTransactions, 0);
  assert.equal(suite.metrics.blockedThreats, 5);
  assert.equal(suite.runs.find((run) => run.id === "mandate-replay").code, "MANDATE_REPLAY");
});

test("uses an explicit fixture when no model key is configured", async () => {
  const intent = await interpretIntent(demoIntent.text, "");
  assert.equal(intent.mode, "verified-fixture");
  await assert.rejects(() => interpretIntent("Buy anything", ""), /require GEMINI_API_KEY/);
});

test("keeps Razorpay order creation simulated without credentials", async () => {
  const run = runScenario("clean", { now, secret: "test" });
  const order = await createRazorpayOrder(run.checkout, run.paymentMandate.id, {});
  assert.equal(order.mode, "simulated");
  assert.equal(order.amount, 249900);
});

test("creates an order through the configured Razorpay CLI", async () => {
  const run = runScenario("clean", { now, secret: "test" });
  const exec = async (command, args) => {
    assert.equal(command, "razorpay");
    assert.deepEqual(args.slice(0, 4), ["orders", "create", "--amount", "249900"]);
    return { stdout: JSON.stringify({ id: "order_test", amount: 249900, currency: "INR", status: "created" }) };
  };
  const order = await createRazorpayOrder(run.checkout, run.paymentMandate.id, {}, { useCli: true, exec });
  assert.equal(order.mode, "razorpay-cli");
});

test("deduplicates concurrent order creation for one payment mandate", async () => {
  const cache = new Map();
  let calls = 0;
  const create = async () => ({ id: `order_${++calls}` });
  const [first, second] = await Promise.all([
    createOrderOnce(cache, "payment_1", create),
    createOrderOnce(cache, "payment_1", create),
  ]);
  assert.equal(calls, 1);
  assert.equal(first.id, second.id);
});

test("verifies Razorpay webhooks and claims each event once", () => {
  const raw = Buffer.from('{"event":"order.paid"}');
  const signature = createHmac("sha256", "secret").update(raw).digest("hex");
  assert.equal(verifyWebhookSignature(raw, signature, "secret"), true);
  assert.equal(verifyWebhookSignature(raw, "invalid", "secret"), false);
  const ledger = new EventLedger();
  assert.equal(ledger.claim("event_1"), true);
  assert.equal(ledger.claim("event_1"), false);
});
