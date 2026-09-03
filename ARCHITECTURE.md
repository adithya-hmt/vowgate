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

Production uses Upstash Redis Free; local development uses an in-memory adapter with the same interface:

```text
ISSUED -> RESERVED -> ORDER_CREATED -> PAYMENT_VERIFIED
             |
             +-> ISSUED                    definitive rejection, no order
             +-> ORDER_CREATION_AMBIGUOUS  network/parse outcome uncertain
```

Creation and every compare-and-transition run as one Redis Lua script. The script verifies current state, checkout hash, and—when relevant—the bound Razorpay order ID before writing. The critical `ISSUED → RESERVED` transition occurs before the Razorpay adapter, so requests on separate Vercel instances cannot both gain order-creation permission.

State contains mandate ID, checkout hash, state, Razorpay order ID, and audit timestamps only. Each Lua write reapplies `PEXPIREAT` using the original signed Payment Mandate expiry stored in the record; transitions cannot extend TTL. Cryptographic expiry is still independently checked before state access.

An HTTP rejection from Razorpay is treated as definitive and atomically recovers `RESERVED → ISSUED`. A network, CLI, response-parse, response-mismatch, or post-order persistence failure is ambiguous: authority remains unavailable and requires reconciliation. Checkout abandonment keeps `ORDER_CREATED`, allowing the same established order to reopen without authorizing another.

## Razorpay boundary

Only the public Razorpay test key reaches the browser. Order creation and callback verification retain the test secret server-side. The browser callback is labelled “payment returned”; success is shown only after backend HMAC verification. Live key IDs are refused.

Razorpay Standard Checkout still requires human interaction. Vowgate currently grants delegated shopping/checkout authorization and verifies the resulting test payment; it does not perform autonomous unattended fund movement.
