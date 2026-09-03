# Vowgate — Five-minute pitch

## 0:00–0:35 — Hook

“AI agents are getting good at choosing what to buy. But fluent intent is not payment authority. A price can drift, a product can be substituted, catalog text can attack the agent, and a payment mandate can be replayed. Vowgate is the mandate firewall for agentic commerce.”

Show the hero and point to **Intent → Mandate → Razorpay**.

## 0:35–1:15 — Product model

“This customer authorized one dimmable graphite task light under ₹3,000, with no substitutions. Gemini may translate that sentence into structure, but the model never decides whether money moves. Vowgate signs the boundary, hashes the checkout evidence, and applies deterministic policy gates.”

Click **Sign purchase mandate**. Point out the spend ceiling, required attributes, and substitution rule.

## 1:15–2:20 — Pressure suite

Click **Run pressure suite**.

“The valid purchase passes. Then Vowgate attacks the same flow with price drift, catalog prompt injection, a forbidden substitution, stale inventory, and Payment Mandate replay. Five threats stop. Zero unsafe payments escape.”

Pause on the three metrics. Emphasize that a safe refusal counts as success.

## 2:20–3:10 — Signature scenario

Select **Payment mandate replay**.

“The first redemption consumes the mandate before order creation. The second presentation is refused as `MANDATE_REPLAY`. The flight recorder does not just say no; it shows which evidence passed, where authorization stopped, and why.”

## 3:10–3:50 — Razorpay test Checkout

Select **Authorized purchase**, click **Pay with Razorpay**, and complete the test Checkout.

“This is not a mocked success screen. Vowgate creates the Razorpay test order only after authorization, opens Standard Checkout, and verifies the returned payment signature on the server. Concurrent requests for the same mandate still resolve to one order.”

Show the `RAZORPAY TEST CHECKOUT` mode, the Checkout handoff, and the `PAYMENT_VERIFIED` result in the flight recorder.

## 3:50–4:30 — Architecture

Show `ARCHITECTURE.md`.

“The trust boundary is deliberate: AI interprets, policy authorizes. Catalog descriptions never enter system instructions. The signed mandate expires, the checkout is hash-bound, and redemption is single use. The public test key can reach the browser, but order creation and signature verification keep the secret server-side. Webhooks are verified against the raw body and event IDs are deduplicated.”

## 4:30–5:00 — Honest close

“The merchant and evaluation data are synthetic, and Vowgate is AP2-inspired rather than AP2-certified. The current in-memory ledger is right for an inspectable buildathon demo; production would move consumption into a durable atomic store. Vowgate’s bet is simple: agentic commerce will scale only when every payment can prove why it was allowed.”

End on the hero: **The mandate firewall for agentic commerce.**
