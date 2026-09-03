# Vowgate build plan

## Winning thesis

Vowgate is the mandate firewall for agentic commerce, not another conversational checkout. It makes a synthetic merchant agent-readable, completes a Razorpay test-mode order, and proves that adversarial checkout changes cannot escape a customer-approved mandate.

The highest-signal demonstration is a replay attempt: AP2's public repository documents an issue where a previously accepted closed Payment Mandate can be presented twice. Vowgate consumes its simplified payment mandate before order creation and blocks the second presentation.

## Synthetic merchant

**Nightswitch Supply** sells focused desk tools for late-night builders. Web searches found no obvious merchant using this exact name; this is not trademark clearance. All products, results, and claims remain clearly labelled synthetic.

## Demo sequence

1. Customer says: “Buy one dimmable graphite desk light under ₹3,000. No substitutions. Deliver by Friday.”
2. Gemini extracts only explicit constraints; a signed open checkout mandate captures them.
3. The merchant catalog returns the ₹2,499 Orbit Task Light.
4. Deterministic gates verify merchant, signature, expiry, catalog version, stock, attributes, price, checkout hash, and single use.
5. A valid flow becomes eligible for a Razorpay test-mode order.
6. The pressure suite injects price drift, malicious catalog text, forbidden substitution, stale inventory, and mandate replay. Each must stop with an inspectable reason.

## Measured bar

- 6/6 conformance scenarios behave as expected.
- 5/5 unsafe conditions are blocked.
- 0 unsafe payment attempts reach order creation.
- One valid flow creates a Razorpay test-mode order through the authenticated Razorpay CLI.
- Concurrent requests for the same Payment Mandate deduplicate to one order.

## Boundaries

- AP2-inspired, not falsely advertised as AP2-certified.
- AI interprets customer language but never authorizes money movement.
- Catalog descriptions are untrusted text and never become system instructions.
- No live payments, invented customers, or fabricated merchant outcomes.

## Completion record

The shipped v1.0 scope is frozen to one intent, one authorized purchase, and five adversarial refusals. The local product, responsive interface, Razorpay CLI integration, test order, health endpoint, container image, documentation, and pitch script are complete. Public hosting and video upload remain release operations because they require the owner's provider sessions.

## Sources

- [Razorpay AI Buildathon](https://razorpay.com/buildathon/)
- [Razorpay Create Order API](https://razorpay.com/docs/api/orders/create)
- [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/)
- [AP2 documentation](https://ap2-protocol.org/)
- [AP2 Payment Mandate replay issue](https://github.com/google-agentic-commerce/ap2/issues/346)
- [Agentic Commerce Protocol overview](https://docs.stripe.com/agentic-commerce/acp)
