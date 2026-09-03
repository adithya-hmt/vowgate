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
  intentButton: $("#interpret-intent"),
  intentText: $("#intent-text"),
  constraints: $("#constraints"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed with ${response.status}`);
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

function renderTrace(result) {
  elements.trace.innerHTML = result.trace.map((item, index) => `
    <div class="trace-step ${item.status}" style="animation-delay:${index * 45}ms">
      <span class="trace-stage">${item.stage}</span>
      <span class="trace-detail"><b class="${item.status}">${item.status}</b>${item.detail}</span>
    </div>
  `).join("");
  elements.traceCode.textContent = result.code;
  elements.traceCode.style.color = result.decision === "authorized" ? "#73dfa8" : "#ff8b7f";
  elements.orderButton.disabled = result.decision !== "authorized";
  elements.orderState.textContent = result.decision === "authorized" ? "POLICY PASS — ORDER READY" : `STOPPED — ${result.code}`;
  elements.orderId.textContent = result.detail;
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
    elements.traceCode.textContent = "ERROR";
    elements.orderState.textContent = "SCENARIO COULD NOT RUN";
    elements.orderId.textContent = error.message;
  }
}));

elements.intentButton.addEventListener("click", async () => {
  const original = elements.intentButton.textContent;
  elements.intentButton.disabled = true;
  elements.intentButton.textContent = "INTERPRETING…";
  try {
    const intent = await api("/api/intent", { method: "POST", body: { text: elements.intentText.value } });
    elements.constraints.innerHTML = `
      <div><span>SPEND CEILING</span><strong>₹${(intent.maxAmount / 100).toLocaleString("en-IN")}</strong></div>
      <div><span>ITEM</span><strong>${intent.quantity} × ${intent.category.replaceAll("-", " ").toUpperCase()}</strong></div>
      <div><span>REQUIRED</span><strong>${intent.requiredAttributes.finish.toUpperCase()} · ${intent.requiredAttributes.dimmable ? "DIMMABLE" : "FIXED"}</strong></div>
      <div><span>SUBSTITUTION</span><strong>${intent.allowSubstitutions ? "ALLOWED" : "PROHIBITED"}</strong></div>
    `;
    elements.intentButton.textContent = `INTERPRETED / ${intent.mode.toUpperCase()}`;
  } catch (error) {
    elements.intentButton.textContent = error.message;
    elements.intentButton.focus();
  } finally {
    elements.intentButton.disabled = false;
    setTimeout(() => { elements.intentButton.textContent = original; }, 3000);
  }
});

elements.orderButton.addEventListener("click", async () => {
  elements.orderButton.disabled = true;
  elements.orderButton.textContent = "CREATING…";
  try {
    const order = await api("/api/order", { method: "POST" });
    elements.orderState.textContent = order.mode.startsWith("razorpay") ? "RAZORPAY TEST ORDER CREATED" : "SIMULATED ORDER CREATED";
    elements.orderId.textContent = `${order.id} · ₹${(order.amount / 100).toLocaleString("en-IN")} · ${order.status}`;
    elements.orderButton.textContent = "ORDER CREATED";
  } catch (error) {
    elements.orderState.textContent = "ORDER CREATION FAILED";
    elements.orderId.textContent = error.message;
    elements.orderButton.textContent = "RETRY ORDER";
    elements.orderButton.disabled = false;
  }
});

loadState();
