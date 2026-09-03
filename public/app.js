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
  constraintSpend: $("#constraint-spend"),
  constraintItem: $("#constraint-item"),
  constraintRequired: $("#constraint-required"),
  constraintSubstitution: $("#constraint-substitution"),
};

let openMandate;
let scenarioAuthorized = false;
let checkoutScript;

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || payload.detail || `Request failed with ${response.status}`);
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
    elements.paymentStage.textContent = "AUTHORIZED CHECKOUT";
    elements.orderState.textContent = "POLICY PASS — CHECKOUT READY";
    elements.orderId.textContent = "The signed mandate will be bound to one Razorpay test order.";
    elements.orderButton.textContent = "PAY WITH RAZORPAY";
  } else if (scenarioAuthorized) {
    elements.paymentStage.textContent = "SIGNED MANDATE REQUIRED";
    elements.orderState.textContent = "INTERPRET THE PURCHASE FIRST";
    elements.orderId.textContent = "Checkout stays locked until the customer instruction becomes a signed mandate.";
    elements.orderButton.textContent = "WAITING FOR MANDATE";
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
        elements.trace.append(traceStep({ stage: "RAZORPAY", status: "verified", detail: "Checkout signature matched the authorized test order." }));
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
  elements.runStatus.textContent = "Applying catalog drift, malicious text, substitutions, stale stock, and replay pressure.";
  try {
    const suite = await api("/api/suite", { method: "POST" });
    renderSuite(suite);
    elements.runStatus.textContent = `${suite.metrics.blockedThreats} threats stopped. ${suite.metrics.unsafeTransactions} unsafe payments escaped.`;
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
  openMandate = undefined;
  syncOrderEligibility();
});

elements.intentButton.addEventListener("click", async () => {
  const original = elements.intentButton.textContent;
  setBusy(elements.intentButton, true, "SIGNING MANDATE…");
  try {
    const response = await api("/api/intent", { method: "POST", body: { text: elements.intentText.value } });
    const intent = response.intent;
    openMandate = response.openMandate;
    elements.constraintSpend.textContent = `₹${(intent.maxAmount / 100).toLocaleString("en-IN")}`;
    elements.constraintItem.textContent = `${intent.quantity} × ${intent.category.replaceAll("-", " ").toUpperCase()}`;
    elements.constraintRequired.textContent = `${intent.requiredAttributes.finish.toUpperCase()} · ${intent.requiredAttributes.dimmable ? "DIMMABLE" : "FIXED"}`;
    elements.constraintSubstitution.textContent = intent.allowSubstitutions ? "ALLOWED" : "PROHIBITED";
    elements.intentButton.textContent = `SIGNED / ${intent.mode.toUpperCase()}`;
    syncOrderEligibility();
  } catch (error) {
    openMandate = undefined;
    elements.intentButton.textContent = error.message;
    elements.intentButton.focus();
    syncOrderEligibility();
  } finally {
    elements.intentButton.disabled = false;
    elements.intentButton.setAttribute("aria-busy", "false");
    setTimeout(() => { elements.intentButton.textContent = original; }, 3000);
  }
});

elements.orderButton.addEventListener("click", async () => {
  setBusy(elements.orderButton, true, "AUTHORIZING…");
  try {
    const order = await api("/api/order", { method: "POST", body: { openMandate } });
    elements.orderId.textContent = `${order.id} · ₹${(order.amount / 100).toLocaleString("en-IN")} · ${order.status}`;

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
    elements.paymentStage.textContent = "CHECKOUT REFUSED";
    elements.orderState.textContent = "ORDER CREATION FAILED";
    elements.orderId.textContent = error.message;
    elements.orderButton.textContent = "RETRY CHECKOUT";
    elements.orderButton.disabled = false;
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
