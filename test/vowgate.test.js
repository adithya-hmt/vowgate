import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  activateOpenMandate,
  authorize,
  baseCatalog,
  canonicalCheckoutBytes,
  chooseProduct,
  createAuthorizationReview,
  createCheckout,
  createOrderEvidence,
  createPaymentMandate,
  demoIntent,
  hashCheckout,
  runMandate,
  runScenario,
  runSuite,
  verifyAuthorizationReview,
  verifyOpenMandate,
  verifyOrderEvidence,
  verifyPaymentMandate,
} from "../lib/vowgate.js";
import { interpretIntent } from "../lib/intent.js";
import {
  createRazorpayOrder,
  hasRazorpayApiConfig,
  verifyPaymentSignature,
} from "../lib/razorpay.js";
import { MemoryMandateStateStore } from "../lib/mandate-state.js";
import { EventLedger, verifyWebhookSignature } from "../lib/webhook.js";

const now = Date.UTC(2026, 7, 1, 12);
const secret = "test-signing-secret";

function policyInput(intent = demoIntent) {
  const catalog = structuredClone(baseCatalog);
  const review = createAuthorizationReview(intent, { now, secret, id: "test-review" });
  const openMandate = activateOpenMandate(review, { now, secret });
  const selectedProduct = structuredClone(chooseProduct(openMandate.constraints, catalog) || catalog.products[0]);
  const checkout = createCheckout(selectedProduct, catalog, openMandate);
  const paymentMandate = createPaymentMandate(checkout, openMandate, { now, secret, id: "test-payment" });
  return { catalog, selectedProduct, checkout, openMandate, paymentMandate, secret, ledger: new MemoryMandateStateStore(), now };
}

function rebind(input) {
  input.checkout.hash = hashCheckout(input.checkout);
  input.paymentMandate = createPaymentMandate(input.checkout, input.openMandate, { now, secret, id: "test-payment" });
  return input;
}

async function decisionAfter(mutator) {
  const input = policyInput();
  mutator(input);
  return authorize(input);
}

test("normalizes intent for explicit approval before issuing a mandate", () => {
  const review = createAuthorizationReview(demoIntent, { now, secret, id: "review-1" });
  assert.equal(review.constraints.maxItemPrice, 300000);
  assert.equal(review.constraints.maxOrderTotal, 300000);
  assert.equal(review.constraints.maxQuantity, 1);
  assert.equal(review.constraints.deliveryDeadline, "2026-08-07");
  assert.deepEqual(review.merchantScope.allowedMerchantIds, ["merchant_nightswitch"]);
  assert.equal(review.catalogVersion, baseCatalog.version);
  assert.equal(verifyAuthorizationReview(review, secret), true);

  const mandate = activateOpenMandate(review, { now: now + 1_000, secret });
  assert.deepEqual(mandate.constraints, review.constraints);
  assert.equal(mandate.authorizationId, review.id);
  assert.equal(mandate.approvedAt, now + 1_000);
});

test("refuses activation when normalized authorization was modified after review", () => {
  const review = createAuthorizationReview(demoIntent, { now, secret, id: "review-2" });
  review.constraints.maxOrderTotal += 1;
  assert.equal(verifyAuthorizationReview(review, secret), false);
  assert.throws(() => activateOpenMandate(review, { now, secret }), /review is invalid/);
});

test("hashes a fixed-order canonical checkout representation", () => {
  const checkout = {
    fees: 0,
    shipping: 0,
    tax: 0,
    total: 249900,
    subtotal: 249900,
    currency: "INR",
    catalogVersion: "catalog_1",
    merchantId: "merchant_1",
    id: "checkout_1",
    type: "vowgate.checkout.v1",
    deliveryBy: "2026-08-03",
    items: [{ unitPrice: 249900, quantity: 1, sku: "SKU-1" }],
  };
  assert.equal(canonicalCheckoutBytes(checkout).toString(), '{"type":"vowgate.checkout.v1","id":"checkout_1","merchantId":"merchant_1","catalogVersion":"catalog_1","items":[{"sku":"SKU-1","quantity":1,"unitPrice":249900}],"currency":"INR","subtotal":249900,"tax":0,"shipping":0,"fees":0,"total":249900,"deliveryBy":"2026-08-03"}');
  assert.equal(hashCheckout(checkout), "b640e37f906c9b4aeb4da26dd64c8c839a81119f9f0f9a46b0475efc95fc11c9");
});

test("selects only a product matching policy-authoritative fields", () => {
  assert.equal(chooseProduct(demoIntent, baseCatalog).sku, "NS-L01");
});

test("signs the approved Open Checkout and exact Payment Mandates", () => {
  const input = policyInput();
  assert.equal(verifyOpenMandate(input.openMandate, secret), true);
  assert.equal(verifyPaymentMandate(input.paymentMandate, secret), true);
  input.paymentMandate.checkoutHash = "0".repeat(64);
  assert.equal(verifyPaymentMandate(input.paymentMandate, secret), false);
});

test("authorizes a valid approved checkout", async () => {
  const result = await authorize(policyInput());
  assert.equal(result.decision, "authorized");
  assert.equal(result.code, "CHECKOUT_AUTHORIZED");
});

test("rejects an invalid HMAC", async () => {
  const result = await decisionAfter((input) => { input.openMandate.signature = "invalid"; });
  assert.equal(result.code, "MANDATE_SIGNATURE_INVALID");
});

test("rejects an expired mandate", async () => {
  const input = policyInput();
  input.now = input.openMandate.expiresAt + 1;
  assert.equal((await authorize(input)).code, "MANDATE_EXPIRED");
});

test("rejects a category mismatch", async () => {
  const result = await decisionAfter((input) => { input.catalog.products[0].category = "timer"; });
  assert.equal(result.code, "CATEGORY_MISMATCH");
});

test("rejects a required attribute mismatch", async () => {
  const result = await decisionAfter((input) => { input.catalog.products[0].attributes.finish = "silver"; });
  assert.equal(result.code, "ATTRIBUTE_MISMATCH");
  assert.match(result.detail, /Expected finish: graphite; observed: silver/);
});

test("rejects a forbidden substitution", async () => {
  const result = await decisionAfter((input) => { input.selectedProduct = structuredClone(input.catalog.products[1]); });
  assert.equal(result.code, "SUBSTITUTION_PROHIBITED");
});

test("rejects quantity above the approved exact quantity", async () => {
  const result = await decisionAfter((input) => {
    input.checkout.items[0].quantity = 2;
    input.checkout.subtotal *= 2;
    input.checkout.total *= 2;
    rebind(input);
  });
  assert.equal(result.code, "QUANTITY_EXCEEDED");
});

test("rejects an item price above the approved item ceiling", async () => {
  const result = await decisionAfter((input) => {
    input.catalog.products[0].price = 310000;
    input.selectedProduct.price = 310000;
    input.checkout.items[0].unitPrice = 310000;
    input.checkout.subtotal = 310000;
    input.checkout.total = 310000;
    rebind(input);
  });
  assert.equal(result.code, "ITEM_PRICE_EXCEEDED");
});

test("rejects a final payable total above the approved order ceiling", async () => {
  const result = await decisionAfter((input) => {
    input.catalog.products[0].charges.shipping = 80000;
    input.checkout.shipping = 80000;
    input.checkout.total += 80000;
    rebind(input);
  });
  assert.equal(result.code, "ORDER_TOTAL_EXCEEDED");
});

test("rejects a currency mismatch", async () => {
  const result = await decisionAfter((input) => {
    input.checkout.currency = "USD";
    rebind(input);
  });
  assert.equal(result.code, "CURRENCY_MISMATCH");
});

test("rejects a merchant outside the explicit allowlist", async () => {
  const result = await decisionAfter((input) => {
    input.catalog.merchantId = "merchant_other";
    input.checkout.merchantId = "merchant_other";
    rebind(input);
  });
  assert.equal(result.code, "MERCHANT_NOT_ALLOWED");
});

test("rejects an unsupported catalog version", async () => {
  const result = await decisionAfter((input) => {
    input.catalog.version = "catalog_other";
    input.checkout.catalogVersion = "catalog_other";
    rebind(input);
  });
  assert.equal(result.code, "CATALOG_VERSION_MISMATCH");
});

test("rejects unavailable inventory", async () => {
  const result = await decisionAfter((input) => { input.catalog.products[0].stock = 0; });
  assert.equal(result.code, "OUT_OF_STOCK");
});

test("rejects a trusted fulfillment promise after the approved deadline", async () => {
  const result = await decisionAfter((input) => {
    input.catalog.products[0].fulfillment.deliveryLeadDays = 8;
    input.checkout.deliveryBy = "2026-08-09";
    rebind(input);
  });
  assert.equal(result.code, "DELIVERY_DEADLINE_MISSED");
});

test("rejects checkout tampering with distinct authorized and observed fingerprints", async () => {
  const result = await decisionAfter((input) => {
    input.checkout.fees += 100;
    input.checkout.total += 100;
  });
  assert.equal(result.code, "CHECKOUT_HASH_MISMATCH");
  assert.match(result.detail, /Authorized checkout fingerprint.*observed/);
});

test("passes exactly six adversarial scenarios without an unsafe checkout", async () => {
  const suite = await runSuite({ now, secret });
  assert.equal(suite.metrics.scenarios, 6);
  assert.equal(suite.metrics.passed, 6);
  assert.equal(suite.metrics.unsafeTransactions, 0);
  assert.equal(suite.metrics.blockedThreats, 5);
  assert.deepEqual(
    Object.fromEntries(suite.runs.map((run) => [run.id, run.code])),
    {
      clean: "CHECKOUT_AUTHORIZED",
      "catalog-injection": "CATEGORY_MISMATCH",
      substitution: "SUBSTITUTION_PROHIBITED",
      "order-total": "ORDER_TOTAL_EXCEEDED",
      "checkout-tampering": "CHECKOUT_HASH_MISMATCH",
      "mandate-replay": "MANDATE_ALREADY_CONSUMED",
    },
  );
});

test("uses an explicit fixture when no model key is configured", async () => {
  const intent = await interpretIntent(demoIntent.text, "");
  assert.equal(intent.mode, "verified-fixture");
  assert.equal(intent.maxOrderTotal, 300000);
  await assert.rejects(() => interpretIntent("", ""), /Enter a purchase instruction/);
  await assert.rejects(() => interpretIntent("Buy anything", ""), /require GEMINI_API_KEY/);
});

test("authorizes an approved custom quantity and includes all charges in total", async () => {
  const intent = { ...structuredClone(demoIntent), quantity: 2, maxItemPrice: 300000, maxOrderTotal: 600000 };
  const review = createAuthorizationReview(intent, { now, secret, id: "custom" });
  const openMandate = activateOpenMandate(review, { now, secret });
  const run = await runMandate(openMandate, { now, secret });
  assert.equal(run.result.decision, "authorized");
  assert.equal(run.checkout.items[0].quantity, 2);
  assert.equal(run.checkout.subtotal, 499800);
  assert.equal(run.checkout.total, 499800);
});

test("blocks an approved mandate with no matching catalog product", async () => {
  const intent = { ...structuredClone(demoIntent), requiredAttributes: { finish: "brass", dimmable: true } };
  const review = createAuthorizationReview(intent, { now, secret, id: "no-match" });
  const openMandate = activateOpenMandate(review, { now, secret });
  assert.equal((await runMandate(openMandate, { now, secret })).result.code, "NO_CATALOG_MATCH");
});

test("signs stateless order evidence for serverless payment verification", () => {
  const input = policyInput();
  const order = { id: "order_test", amount: input.checkout.total, currency: "INR", mode: "razorpay-test" };
  const evidence = createOrderEvidence(order, input.paymentMandate, secret);
  assert.equal(verifyOrderEvidence(evidence, secret), true);
  evidence.amount += 1;
  assert.equal(verifyOrderEvidence(evidence, secret), false);
});

test("keeps Razorpay order creation simulated without credentials", async () => {
  const run = await runScenario("clean", { now, secret });
  const order = await createRazorpayOrder(run.checkout, run.paymentMandate.id, {});
  assert.equal(order.mode, "simulated");
  assert.equal(order.amount, 249900);
});

test("creates a test API order that can open Razorpay Checkout", async () => {
  const run = await runScenario("clean", { now, secret });
  const env = { RAZORPAY_KEY_ID: "rzp_test_example", RAZORPAY_KEY_SECRET: "secret" };
  const request = async () => ({
    ok: true,
    json: async () => ({ id: "order_test", amount: 249900, currency: "INR", status: "created" }),
  });
  const order = await createRazorpayOrder(run.checkout, run.paymentMandate.id, env, { request });
  assert.equal(order.mode, "razorpay-test");
  assert.equal(order.checkoutKey, "rzp_test_example");
});

test("refuses live Razorpay credentials", async () => {
  const run = await runScenario("clean", { now, secret });
  const env = { RAZORPAY_KEY_ID: "rzp_live_example", RAZORPAY_KEY_SECRET: "secret" };
  assert.equal(hasRazorpayApiConfig(env), false);
  await assert.rejects(() => createRazorpayOrder(run.checkout, run.paymentMandate.id, env), /test-mode credentials/);
});

test("classifies definitive and ambiguous Razorpay order failures", async () => {
  const run = await runScenario("clean", { now, secret });
  const env = { RAZORPAY_KEY_ID: "rzp_test_example", RAZORPAY_KEY_SECRET: "secret" };
  await assert.rejects(
    () => createRazorpayOrder(run.checkout, run.paymentMandate.id, env, { request: async () => ({ ok: false, status: 400 }) }),
    (error) => error.orderCreationOutcome === "definitive-failure",
  );
  await assert.rejects(
    () => createRazorpayOrder(run.checkout, run.paymentMandate.id, env, { request: async () => ({ ok: false, status: 503 }) }),
    (error) => error.orderCreationOutcome === "ambiguous",
  );
  await assert.rejects(
    () => createRazorpayOrder(run.checkout, run.paymentMandate.id, env, { request: async () => { throw new Error("network ended"); } }),
    (error) => error.orderCreationOutcome === "ambiguous",
  );
});

test("verifies a Razorpay Checkout payment signature", () => {
  const signature = createHmac("sha256", "secret").update("order_1|pay_1").digest("hex");
  assert.equal(verifyPaymentSignature("order_1", "pay_1", signature, "secret"), true);
  assert.equal(verifyPaymentSignature("order_1", "pay_2", signature, "secret"), false);
});

test("creates an order through the configured Razorpay CLI", async () => {
  const run = await runScenario("clean", { now, secret });
  const exec = async (command, args) => {
    assert.equal(command, "razorpay");
    assert.deepEqual(args.slice(0, 4), ["orders", "create", "--amount", "249900"]);
    return { stdout: JSON.stringify({ id: "order_test", amount: 249900, currency: "INR", status: "created" }) };
  };
  const order = await createRazorpayOrder(run.checkout, run.paymentMandate.id, {}, { useCli: true, exec });
  assert.equal(order.mode, "razorpay-cli");
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
