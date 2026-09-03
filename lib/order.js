import { createOrderEvidence, runMandate } from "./vowgate.js";

function authorizationError(result) {
  return Object.assign(new Error(result.detail), { status: 409, code: result.code, payload: result });
}

function stateTrace(stage, status, detail) {
  return { stage, status, detail };
}

export async function createAuthorizedOrder(openMandate, {
  secret,
  stateStore,
  createOrder,
  now = Date.now(),
} = {}) {
  const run = await runMandate(openMandate, { secret, ledger: stateStore, now });
  if (run.result.decision !== "authorized") throw authorizationError(run.result);

  let created;
  try {
    created = await createOrder(run.checkout, run.paymentMandate.id);
  } catch (error) {
    const definitive = error.orderCreationOutcome === "definitive-failure";
    const transition = definitive
      ? await stateStore.recoverReservation(run.paymentMandate.id, run.checkout.hash, now)
      : await stateStore.markOrderCreationAmbiguous(run.paymentMandate.id, run.checkout.hash, now);
    error.code ||= definitive ? "ORDER_CREATION_FAILED" : "ORDER_CREATION_AMBIGUOUS";
    error.payload = {
      decision: "blocked",
      code: error.code,
      detail: error.message,
      trace: [
        ...run.result.trace,
        stateTrace(
          definitive ? "RESERVATION_RECOVERED" : "ORDER_CREATION_AMBIGUOUS",
          "blocked",
          transition.ok
            ? definitive ? "RESERVED → ISSUED; Razorpay definitively created no order." : "Reservation retained; order outcome requires reconciliation."
            : "Persistent state transition failed closed.",
        ),
      ],
    };
    throw error;
  }

  if (created.amount !== run.checkout.total || created.currency !== run.checkout.currency || typeof created.id !== "string") {
    await stateStore.markOrderCreationAmbiguous(run.paymentMandate.id, run.checkout.hash, now);
    throw authorizationError({
      decision: "blocked",
      code: "ORDER_CREATION_AMBIGUOUS",
      detail: "Razorpay returned an order that does not match the authorized checkout; reservation retained.",
      trace: [...run.result.trace, stateTrace("ORDER_CREATION_AMBIGUOUS", "blocked", "Order response mismatch requires reconciliation.")],
    });
  }

  const transition = await stateStore.recordOrder(run.paymentMandate.id, created.id, run.checkout.hash, now);
  if (!transition.ok) {
    throw authorizationError({
      decision: "blocked",
      code: "ORDER_STATE_PERSIST_FAILED",
      detail: "Razorpay order exists, but its persistent mandate state could not be recorded. Reservation retained.",
      trace: [...run.result.trace, stateTrace("ORDER_CREATION_AMBIGUOUS", "blocked", "Persistent order binding failed closed.")],
    });
  }

  const authorizationTrace = [
    ...run.result.trace,
    stateTrace("ORDER_CREATED", "verified", `Razorpay test order bound to checkout ${run.checkout.hash.slice(0, 12)}….`),
  ];
  return {
    ...created,
    checkoutFingerprint: run.checkout.hash.slice(0, 12),
    mandateState: "ORDER_CREATED",
    authorizationTrace,
    evidence: createOrderEvidence(created, run.paymentMandate, secret),
  };
}
