const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  runSuite: $("#run-suite"),
  runStatus: $("#run-status"),
  score: $("#suite-score"),
  passed: $("#metric-passed"),
  blocked: $("#metric-blocked"),
  unsafe: $("#metric-unsafe"),
  trace: $("#trace-track"),
  traceCode: $("#trace-code"),
  orderButton: $("#create-order"),
  orderState: $("#order-state"),
  orderId: $("#order-id"),
  paymentStage: $("#payment-stage"),
  intentButton: $("#interpret-intent"),
  intentText: $("#intent-text"),
  constraintItem: $("#constraint-item"),
  constraintItemPrice: $("#constraint-item-price"),
  constraintOrderTotal: $("#constraint-order-total"),
  constraintRequired: $("#constraint-required"),
  constraintSubstitution: $("#constraint-substitution"),
  constraintDelivery: $("#constraint-delivery"),
  constraintMerchant: $("#constraint-merchant"),
  constraintCatalog: $("#constraint-catalog"),
  approvalState: $("#approval-state"),
  mandateStatus: $("#mandate-status"),
};

let authorizationReview;
let openMandate;
let authorizedOrder;
let scenarioAuthorized = false;
let checkoutScript;

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(payload.error || payload.detail || `Request failed with ${response.status}`), { payload });
  }
  return payload;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  if (label) button.querySelector("span") ? button.querySelector("span").textContent = label : button.textContent = label;
}

function setSelected(id) {
  $$(".scenario-row").forEach((row) => row.classList.toggle("selected", row.dataset.scenario === id));
}

function traceStep(item, index = 0) {
  const status = ["verified", "ready", "blocked"].includes(item.status) ? item.status : "blocked";
  const step = document.createElement("div");
  const stage = document.createElement("span");
  const detail = document.createElement("span");
  const verdict = document.createElement("b");

  step.className = `trace-step ${status}`;
  step.style.animationDelay = `${index * 45}ms`;
  stage.className = "trace-stage";
  stage.textContent = item.stage;
  detail.className = "trace-detail";
  verdict.className = status;
  verdict.textContent = status;
  detail.append(verdict, document.createTextNode(item.detail));
  step.append(stage, detail);
  return step;
}

function syncOrderEligibility() {
  const eligible = scenarioAuthorized && openMandate;
  elements.orderButton.disabled = !eligible;
  if (eligible) {
    elements.paymentStage.textContent = "CHECKOUT AUTHORIZATION APPROVED";
    elements.orderState.textContent = "POLICY PASS — HUMAN CHECKOUT READY";
    elements.orderId.textContent = "The approved mandate will be bound to one exact Razorpay test order.";
    elements.orderButton.textContent = "OPEN RAZORPAY CHECKOUT";
  } else if (scenarioAuthorized) {
    elements.paymentStage.textContent = "CUSTOMER APPROVAL REQUIRED";
    elements.orderState.textContent = authorizationReview ? "APPROVE THE NORMALIZED LIMITS" : "NORMALIZE THE INSTRUCTION FIRST";
    elements.orderId.textContent = "Model output cannot authorize checkout until the reviewed constraints are explicitly activated.";
    elements.orderButton.textContent = "WAITING FOR APPROVAL";
  }
}

function renderTrace(result) {
  elements.trace.replaceChildren(...result.trace.map(traceStep));
  elements.traceCode.textContent = result.code;
  elements.traceCode.style.color = result.decision === "authorized" ? "var(--green)" : "var(--red)";
  scenarioAuthorized = result.decision === "authorized";
  elements.orderState.textContent = scenarioAuthorized ? "POLICY PASS — CHECKOUT READY" : `STOPPED — ${result.code}`;
  elements.orderId.textContent = result.detail;
  syncOrderEligibility();
}

function renderSuite(suite) {
  elements.passed.textContent = `${suite.metrics.passed}/${suite.metrics.scenarios}`;
  elements.blocked.textContent = String(suite.metrics.blockedThreats).padStart(2, "0");
  elements.unsafe.textContent = String(suite.metrics.unsafeTransactions).padStart(2, "0");
  elements.score.textContent = `${suite.metrics.passed}/${suite.metrics.scenarios} CONFORMANT`;

  for (const run of suite.runs) {
    const badge = $(`[data-scenario="${run.id}"] .result-badge`);
    badge.textContent = run.decision === "authorized" ? "PASS" : "BLOCKED";
    badge.className = `result-badge ${run.decision === "authorized" ? "pass" : "block"}`;
  }

  setSelected("mandate-replay");
  renderTrace(suite.runs.find((run) => run.id === "mandate-replay"));
}

async function loadState() {
  try {
    const state = await api("/api/state");
    $("#merchant-name").textContent = state.merchant.name.toUpperCase();
    $("#intent-mode").textContent = state.modes.intent.toUpperCase();
    $("#payment-mode").textContent = state.modes.payment.toUpperCase();
  } catch (error) {
    elements.runStatus.textContent = error.message;
  }
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutScript) return checkoutScript;

  checkoutScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => window.Razorpay
      ? resolve(window.Razorpay)
      : reject(new Error("Razorpay Checkout loaded without its payment client. Retry the page."));
    script.onerror = () => reject(new Error("Razorpay Checkout could not load. Check your connection and retry."));
    document.head.append(script);
  }).catch((error) => {
    checkoutScript = undefined;
    throw error;
  });
  return checkoutScript;
}

function openCheckout(order) {
  let settled = false;
  const checkout = new window.Razorpay({
    key: order.checkoutKey,
    amount: order.amount,
    currency: order.currency,
    order_id: order.id,
    name: "Nightswitch Supply",
    description: "Vowgate-authorized test purchase",
    theme: { color: "#315bff" },
    handler: async (response) => {
      settled = true;
      elements.paymentStage.textContent = "PAYMENT RETURNED";
      elements.orderState.textContent = "VERIFYING RAZORPAY SIGNATURE";
      elements.orderId.textContent = response.razorpay_payment_id;
      elements.orderButton.textContent = "VERIFYING…";
      try {
        if (response.razorpay_order_id !== order.id) throw new Error("Checkout returned an unexpected order ID.");
        const payment = await api("/api/payment/verify", {
          method: "POST",
          body: {
            orderId: order.id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            evidence: order.evidence,
          },
        });
        elements.trace.append(traceStep({ stage: "PAYMENT_VERIFIED", status: "verified", detail: "Razorpay signature matched server-side. ORDER_CREATED → PAYMENT_VERIFIED." }));
        elements.traceCode.textContent = payment.code;
        elements.traceCode.style.color = "var(--green)";
        elements.paymentStage.textContent = "VERIFIED PAYMENT";
        elements.orderState.textContent = "RAZORPAY TEST PAYMENT VERIFIED";
        elements.orderId.textContent = `${payment.paymentId} · ₹${(payment.amount / 100).toLocaleString("en-IN")}`;
        elements.orderButton.textContent = "PAYMENT VERIFIED";
      } catch (error) {
        elements.trace.append(traceStep({ stage: "RAZORPAY", status: "blocked", detail: error.message }));
        elements.traceCode.textContent = "PAYMENT_REJECTED";
        elements.traceCode.style.color = "var(--red)";
        elements.paymentStage.textContent = "PAYMENT REFUSED";
        elements.orderState.textContent = "SIGNATURE VERIFICATION FAILED";
        elements.orderId.textContent = error.message;
        elements.orderButton.textContent = "RETRY CHECKOUT";
        elements.orderButton.disabled = false;
      }
    },
    modal: {
      confirm_close: true,
      ondismiss: () => {
        if (settled) return;
        elements.paymentStage.textContent = "CHECKOUT CLOSED";
        elements.orderState.textContent = "NO PAYMENT WAS SUBMITTED";
        elements.orderId.textContent = "The authorized order remains available for another test attempt.";
        elements.orderButton.textContent = "REOPEN CHECKOUT";
        elements.orderButton.disabled = false;
      },
    },
  });

  checkout.on("payment.failed", (event) => {
    settled = true;
    const message = event.error?.description || "Razorpay rejected the test payment.";
    elements.trace.append(traceStep({ stage: "RAZORPAY", status: "blocked", detail: message }));
    elements.traceCode.textContent = "PAYMENT_FAILED";
    elements.traceCode.style.color = "var(--red)";
    elements.paymentStage.textContent = "PAYMENT FAILED";
    elements.orderState.textContent = "RAZORPAY REFUSED THE ATTEMPT";
    elements.orderId.textContent = message;
    elements.orderButton.textContent = "RETRY CHECKOUT";
    elements.orderButton.disabled = false;
  });

  checkout.open();
}

elements.runSuite.addEventListener("click", async () => {
  setBusy(elements.runSuite, true, "Running 6 scenarios…");
  elements.runStatus.textContent = "Applying malicious prose, substitution, final-total drift, hash tampering, and replay pressure.";
  try {
    const suite = await api("/api/suite", { method: "POST" });
    renderSuite(suite);
    elements.runStatus.textContent = `${suite.metrics.blockedThreats} threats stopped. ${suite.metrics.unsafeTransactions} unsafe checkouts escaped.`;
  } catch (error) {
    elements.runStatus.textContent = `Suite failed: ${error.message}`;
  } finally {
    setBusy(elements.runSuite, false, "Run pressure suite");
  }
});

$$(".scenario-row").forEach((row) => row.addEventListener("click", async () => {
  setSelected(row.dataset.scenario);
  elements.traceCode.textContent = "RUNNING";
  try {
    const run = await api("/api/scenario", { method: "POST", body: { id: row.dataset.scenario } });
    renderTrace(run.result);
  } catch (error) {
    scenarioAuthorized = false;
    elements.traceCode.textContent = "ERROR";
    elements.orderState.textContent = "SCENARIO COULD NOT RUN";
    elements.orderId.textContent = error.message;
    elements.orderButton.disabled = true;
  }
}));

elements.intentText.addEventListener("input", () => {
  authorizationReview = undefined;
  openMandate = undefined;
  authorizedOrder = undefined;
  elements.intentButton.disabled = false;
  elements.intentButton.textContent = "NORMALIZE FOR REVIEW";
  elements.mandateStatus.textContent = "NOT ACTIVE";
  elements.approvalState.innerHTML = "Review normalized limits<br><b>MANDATE NOT ACTIVE</b>";
  syncOrderEligibility();
});

function showAuthorizationReview(review) {
  const constraints = review.constraints;
  elements.constraintItem.textContent = `${constraints.quantity} × ${constraints.category.replaceAll("-", " ").toUpperCase()}`;
  elements.constraintItemPrice.textContent = `₹${(constraints.maxItemPrice / 100).toLocaleString("en-IN")}`;
  elements.constraintOrderTotal.textContent = `₹${(constraints.maxOrderTotal / 100).toLocaleString("en-IN")} · ALL CHARGES`;
  elements.constraintRequired.textContent = Object.entries(constraints.requiredAttributes)
    .map(([key, value]) => `${key}=${value}`).join(" · ").toUpperCase();
  elements.constraintSubstitution.textContent = constraints.substitutionPolicy.toUpperCase();
  elements.constraintDelivery.textContent = constraints.deliveryDeadline;
  elements.constraintMerchant.textContent = review.merchantScope.allowedMerchantIds.join(", ").replace("merchant_", "").toUpperCase();
  elements.constraintCatalog.textContent = review.catalogVersion.toUpperCase();
  elements.mandateStatus.textContent = "AWAITING APPROVAL";
  elements.approvalState.innerHTML = `Expires ${new Date(review.mandateExpiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}<br><b>REVIEW, THEN ACTIVATE</b>`;
  elements.trace.replaceChildren(
    traceStep({ stage: "NORMALIZED AUTHORIZATION", status: "ready", detail: `${constraints.quantity} × ${constraints.category}; item ≤ ₹${constraints.maxItemPrice / 100}; final total ≤ ₹${constraints.maxOrderTotal / 100}.` }),
    traceStep({ stage: "MERCHANT + CATALOG", status: "verified", detail: `${review.merchantScope.allowedMerchantIds.join(", ")} · ${review.catalogVersion}.` }, 1),
    traceStep({ stage: "CUSTOMER APPROVAL", status: "ready", detail: "Model output is not active authority. Review these exact limits and activate them explicitly." }, 2),
  );
  elements.traceCode.textContent = "AWAITING_APPROVAL";
  elements.traceCode.style.color = "var(--brand-deep)";
}

elements.intentButton.addEventListener("click", async () => {
  setBusy(elements.intentButton, true, authorizationReview ? "ACTIVATING MANDATE…" : "NORMALIZING…");
  try {
    if (!authorizationReview) {
      authorizedOrder = undefined;
      const response = await api("/api/intent", { method: "POST", body: { text: elements.intentText.value } });
      authorizationReview = response.authorizationReview;
      showAuthorizationReview(authorizationReview);
      elements.intentButton.textContent = "APPROVE & ACTIVATE MANDATE";
      elements.intentButton.disabled = false;
      syncOrderEligibility();
      return;
    }

    const response = await api("/api/mandate", { method: "POST", body: { authorizationReview } });
    openMandate = response.openMandate;
    elements.mandateStatus.textContent = "APPROVED / ACTIVE";
    elements.approvalState.innerHTML = `Approved until ${new Date(openMandate.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}<br><b>15 MIN · SINGLE USE</b>`;
    elements.intentButton.textContent = "MANDATE ACTIVE / APPROVED";
    elements.trace.append(traceStep({ stage: "MANDATE STATE", status: "verified", detail: "Customer activation recorded. Server-signed Open Checkout Mandate is now active." }, 3));
    elements.traceCode.textContent = "MANDATE_ACTIVE";
    elements.traceCode.style.color = "var(--green)";
    syncOrderEligibility();
  } catch (error) {
    authorizationReview = undefined;
    openMandate = undefined;
    elements.intentButton.textContent = error.message;
    elements.intentButton.focus();
    setTimeout(() => { elements.intentButton.textContent = "NORMALIZE FOR REVIEW"; }, 3000);
    syncOrderEligibility();
  } finally {
    elements.intentButton.disabled = Boolean(openMandate);
    elements.intentButton.setAttribute("aria-busy", "false");
  }
});

elements.orderButton.addEventListener("click", async () => {
  setBusy(elements.orderButton, true, "AUTHORIZING…");
  try {
    const order = authorizedOrder || await api("/api/order", { method: "POST", body: { openMandate } });
    if (!authorizedOrder) {
      authorizedOrder = order;
      elements.trace.replaceChildren(...order.authorizationTrace.map(traceStep));
      elements.traceCode.textContent = order.mandateState;
      elements.traceCode.style.color = "var(--green)";
      elements.orderId.textContent = `${order.id} · ₹${(order.amount / 100).toLocaleString("en-IN")} · ${order.status}`;
    }

    if (!order.checkoutKey) {
      elements.paymentStage.textContent = "ORDER CREATED";
      elements.orderState.textContent = order.mode === "simulated" ? "SIMULATED ORDER CREATED" : "RAZORPAY TEST ORDER CREATED";
      elements.orderId.textContent += order.mode === "simulated"
        ? " · Add Razorpay test credentials to open Checkout."
        : " · Direct test keys are required to open Checkout.";
      elements.orderButton.textContent = "ORDER CREATED";
      return;
    }

    await loadRazorpayCheckout();
    elements.paymentStage.textContent = "RAZORPAY TEST CHECKOUT";
    elements.orderState.textContent = "CHECKOUT OPEN";
    elements.orderButton.textContent = "CHECKOUT OPEN";
    openCheckout(order);
  } catch (error) {
    const code = error.payload?.code || (authorizedOrder ? "CHECKOUT_CLIENT_UNAVAILABLE" : "ORDER_CREATION_FAILED");
    if (error.payload?.trace) elements.trace.replaceChildren(...error.payload.trace.map(traceStep));
    elements.traceCode.textContent = code;
    elements.traceCode.style.color = "var(--red)";
    elements.paymentStage.textContent = "CHECKOUT REFUSED";
    elements.orderState.textContent = code;
    elements.orderId.textContent = error.message;
    const retryable = code === "ORDER_CREATION_FAILED" || code === "CHECKOUT_CLIENT_UNAVAILABLE";
    elements.orderButton.textContent = retryable ? "RETRY CHECKOUT" : "RAZORPAY ORDER NOT CREATED";
    elements.orderButton.disabled = !retryable;
  } finally {
    elements.orderButton.setAttribute("aria-busy", "false");
  }
});

if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
      entry.target.classList.add("revealed");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  $$('[data-reveal]').forEach((element) => revealObserver.observe(element));
}

loadState();
