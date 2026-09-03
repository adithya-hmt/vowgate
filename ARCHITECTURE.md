# Architecture

```text
Customer instruction
      │
      ▼
Gemini structured extraction ── output is not authority
      │
      ▼
Signed normalization review
      │
      ▼
Customer reviews exact constraints and activates them
      │
      ▼
Signed Open Checkout Mandate (15 min)
      │
      ├──────────────┐
      ▼              ▼
Typed catalog    Untrusted prose
      │              └── never proves policy compliance
      ▼
Canonical exact checkout
merchant · SKU · quantity · unit price · currency
subtotal · tax · shipping · fees · final total
delivery date · catalog version · checkout ID
      │
      ▼
SHA-256 checkout fingerprint
      │
      ▼
Signed Payment Mandate (5 min, exact hash, single use)
      │
      ▼
Central deterministic policy
signature · type · expiry · customer scope · merchant allowlist
catalog · stock · category · attributes · substitution · quantity
item price · currency · charges · final total · delivery · hash
      │
      ├── denied → structured reason + sanitized flight recorder
      ▼
Atomic ISSUED → RESERVED transition
      │
      ▼
Idempotent Razorpay test order creation
      │
      ▼
RESERVED → ORDER_CREATED
      │
      ▼
Human-facing Razorpay Standard Checkout
      │
      ▼
Signed order evidence crosses stateless function boundary
      │
      ▼
Server-side Razorpay callback signature verification
      │
      ▼
ORDER_CREATED → PAYMENT_VERIFIED
```

## Authorization semantics

Gemini only translates free-form language into a fixed schema. `/api/intent` returns a signed normalization review, not an active mandate. The browser displays the normalized merchant scope, catalog snapshot, item and total limits, quantity, attributes, substitution policy, concrete delivery date, and expiration. Only a separate `/api/mandate` activation request creates the Open Checkout Mandate.

The review signature prevents the browser from changing a displayed constraint between normalization and activation. The Open Checkout Mandate copies the approved normalized object and cryptographically covers its authorization ID, customer/session scope, timestamps, single-use semantics, merchant allowlist, catalog version, and constraints.

This activation proves an explicit action in the demo session; it is not customer identity proof, non-repudiation, or a legally binding digital signature.

## Exact checkout binding

`canonicalCheckoutBytes()` projects the checkout into one documented fixed field order. It does not hash arbitrary caller object order:

```text
type, checkout ID, merchant ID, catalog version,
items[{SKU, quantity, unit price}], currency,
subtotal, tax, shipping, fees, final total, delivery date
```

The server calculates `SHA256(canonical_checkout_bytes)`. The signed Payment Mandate includes that hash, amount, currency, merchant scope, catalog version, customer scope, timestamps, and `singleUse: true`. Policy recomputes the canonical hash server-side. Any payable-field mutation requires a new mandate.

## Policy-authoritative catalog data

The configured catalog backend is trusted for structured merchant ID, catalog version, SKU, category, inventory, unit price, currency, attributes, charges, and fulfillment lead time. Product name, description, reviews, seller prose, and HTML are display-only untrusted content and cannot prove compliance.

Vowgate does not prove that typed merchant data is truthful. A compromised Vowgate server, signing key, or configured catalog authority is outside this demo's protection boundary.

## Spending and fulfillment

`maxItemPrice` limits one unit. `maxOrderTotal` limits the final payable amount after subtotal, tax, shipping, and fees. Quantity has both an exact approved value and maximum. Policy recomputes totals and compares each represented charge to the current typed catalog facts.

“Deliver by Friday” is normalized to the next concrete Friday in UTC. The checkout delivery date is derived from the catalog's typed fulfillment lead time and the mandate approval time. A promise later than the approved ISO date returns `DELIVERY_DEADLINE_MISSED`.

## Replay and failure behavior

The in-memory compare-and-set state machine is:

```text
ISSUED -> RESERVED -> ORDER_CREATED -> PAYMENT_VERIFIED
```

Reservation occurs synchronously before the Razorpay adapter can run, so concurrent requests inside one process cannot both gain order-creation permission. A failed order-creation call returns `RESERVED` to `ISSUED`; once an order exists, abandonment does not release the mandate and the idempotency record returns the same order.

The current store is invocation-local. Production needs atomic conditional transitions in Redis or a transactional database to guarantee uniqueness across Vercel instances. Signed order evidence allows callback verification on another invocation but does not replace durable replay state.

## Razorpay boundary

Only the public Razorpay test key reaches the browser. Order creation and callback verification retain the test secret server-side. The browser callback is labelled “payment returned”; success is shown only after backend HMAC verification. Live key IDs are refused.

Razorpay Standard Checkout still requires human interaction. Vowgate currently grants delegated shopping/checkout authorization and verifies the resulting test payment; it does not perform autonomous unattended fund movement.
