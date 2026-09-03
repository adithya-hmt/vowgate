import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  createMandateStateStore,
  MemoryMandateStateStore,
  UpstashMandateStateStore,
} from "../lib/mandate-state.js";
import { createAuthorizedOrder } from "../lib/order.js";
import { activateOpenMandate, createAuthorizationReview, demoIntent } from "../lib/vowgate.js";

const now = Date.now();
const secret = "state-test-secret";

function openMandate(id = "concurrent") {
  const review = createAuthorizationReview(demoIntent, { now, secret, id });
  return activateOpenMandate(review, { now, secret });
}

function testOrder(checkout, id = "order_test") {
  return { id, amount: checkout.total, currency: checkout.currency, status: "created", mode: "razorpay-test" };
}

test("32 concurrent order attempts create exactly one order", async () => {
  const stateStore = new MemoryMandateStateStore();
  let orderCalls = 0;
  const createOrder = async (checkout) => {
    orderCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return testOrder(checkout);
  };

  const results = await Promise.allSettled(Array.from({ length: 32 }, () =>
    createAuthorizedOrder(openMandate(), { secret, stateStore, createOrder, now }),
  ));
  const winners = results.filter((result) => result.status === "fulfilled");
  const losers = results.filter((result) => result.status === "rejected");

  assert.equal(winners.length, 1);
  assert.equal(losers.length, 31);
  assert.equal(orderCalls, 1);
  assert.ok(winners[0].value.authorizationTrace.some(({ stage }) => stage === "MANDATE_ISSUED"));
  assert.deepEqual(
    winners[0].value.authorizationTrace.slice(-3).map(({ stage }) => stage),
    ["MANDATE_RESERVED", "RAZORPAY", "ORDER_CREATED"],
  );
  assert.ok(losers.every((result) => result.reason.code === "MANDATE_ALREADY_CONSUMED"));
  assert.ok(losers.every((result) => result.reason.payload.trace.at(-1).stage === "REPLAY_BLOCKED"));
  const record = await stateStore.getMandateState(winners[0].value.evidence.paymentMandateId);
  assert.equal(record.state, "ORDER_CREATED");
  assert.equal(record.razorpayOrderId, "order_test");
});

test("invalid transitions and payment verification before ORDER_CREATED fail closed", async () => {
  const store = new MemoryMandateStateStore();
  await store.createMandateState({ mandateId: "payment_1", checkoutHash: "a".repeat(64), issuedAt: now, expiresAt: now + 60_000 }, now);
  const invalid = await store.compareAndTransition("payment_1", "RESERVED", "ORDER_CREATED", { now, checkoutHash: "a".repeat(64) });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.state, "ISSUED");
  const earlyPayment = await store.recordPaymentVerified("payment_1", "order_1", "pay_1", "a".repeat(64), now);
  assert.equal(earlyPayment.ok, false);
});

test("payment verification requires the order ID bound to the mandate", async () => {
  const store = new MemoryMandateStateStore();
  await store.createMandateState({ mandateId: "payment_2", checkoutHash: "b".repeat(64), issuedAt: now, expiresAt: now + 60_000 }, now);
  await store.compareAndTransition("payment_2", "ISSUED", "RESERVED", { now, checkoutHash: "b".repeat(64) });
  await store.recordOrder("payment_2", "order_expected", "b".repeat(64), now);
  const mismatch = await store.recordPaymentVerified("payment_2", "order_other", "pay_1", "b".repeat(64), now);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "ORDER_ID_MISMATCH");
  assert.equal((await store.getMandateState("payment_2")).state, "ORDER_CREATED");
});

test("duplicate payment callbacks are idempotent only for the same payment", async () => {
  const store = new MemoryMandateStateStore();
  const hash = "c".repeat(64);
  await store.createMandateState({ mandateId: "payment_3", checkoutHash: hash, issuedAt: now, expiresAt: now + 60_000 }, now);
  await store.compareAndTransition("payment_3", "ISSUED", "RESERVED", { now, checkoutHash: hash });
  await store.recordOrder("payment_3", "order_3", hash, now);
  assert.equal((await store.recordPaymentVerified("payment_3", "order_3", "pay_3", hash, now)).ok, true);
  const duplicate = await store.recordPaymentVerified("payment_3", "order_3", "pay_3", hash, now + 1);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal((await store.recordPaymentVerified("payment_3", "order_3", "pay_other", hash, now + 2)).ok, false);
});

test("definitive order failure atomically recovers RESERVED to ISSUED", async () => {
  const stateStore = new MemoryMandateStateStore();
  const error = Object.assign(new Error("Razorpay rejected the request."), { orderCreationOutcome: "definitive-failure" });
  await assert.rejects(
    () => createAuthorizedOrder(openMandate("definitive"), { secret, stateStore, createOrder: async () => { throw error; }, now }),
    /rejected/,
  );
  const record = await stateStore.getMandateState(`payment_mandate_authorization_definitive`);
  assert.equal(record.state, "ISSUED");
  assert.equal(record.lastEvent, "RESERVATION_RECOVERED");
});

test("ambiguous order failure is never released for retry", async () => {
  const stateStore = new MemoryMandateStateStore();
  const error = Object.assign(new Error("Connection ended without a response."), { orderCreationOutcome: "ambiguous" });
  await assert.rejects(
    () => createAuthorizedOrder(openMandate("ambiguous"), { secret, stateStore, createOrder: async () => { throw error; }, now }),
    /Connection ended/,
  );
  const record = await stateStore.getMandateState(`payment_mandate_authorization_ambiguous`);
  assert.equal(record.state, "ORDER_CREATION_AMBIGUOUS");
  assert.equal(record.lastEvent, "ORDER_CREATION_AMBIGUOUS");
});

test("state TTL is tied to cryptographic expiry", async () => {
  const store = new MemoryMandateStateStore();
  const expired = await store.createMandateState({ mandateId: "expired", checkoutHash: "d".repeat(64), issuedAt: now, expiresAt: now - 1 }, now);
  assert.equal(expired.ok, false);
  assert.equal(expired.state, "EXPIRED");
});

test("production fails closed without persistent state configuration", () => {
  assert.throws(() => createMandateStateStore({ NODE_ENV: "production" }), /Persistent mandate state/);
  assert.ok(createMandateStateStore({ NODE_ENV: "development" }) instanceof MemoryMandateStateStore);
});

const hasUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
test("Upstash atomically grants one cross-client reservation and expires it", { skip: !hasUpstash }, async () => {
  const first = new UpstashMandateStateStore(process.env);
  const second = new UpstashMandateStateStore(process.env);
  const mandateId = `integration_${randomUUID()}`;
  const checkoutHash = "e".repeat(64);
  const timestamp = Date.now();
  const expiresAt = timestamp + 4_000;
  await first.createMandateState({ mandateId, checkoutHash, issuedAt: timestamp, expiresAt }, timestamp);
  const attempts = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    (index % 2 ? first : second).compareAndTransition(mandateId, "ISSUED", "RESERVED", { now: timestamp, checkoutHash }),
  ));
  assert.equal(attempts.filter((attempt) => attempt.ok).length, 1);
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, expiresAt - Date.now() + 300)));
  assert.equal(await first.getMandateState(mandateId), undefined);
});
