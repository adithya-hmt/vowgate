# Architecture

```text
Customer language
      │
      ▼
Gemini structured extraction ── fixture fallback is explicit
      │
      ▼
Signed Open Checkout Mandate
      │
      ├──────────────┐
      ▼              ▼
Typed catalog    Untrusted descriptions
      │              └── never enter system instructions
      ▼
Checkout + evidence hash
      │
      ▼
Deterministic Policy Gates
  signature · expiry · merchant · catalog version
  stock · attributes · price · budget · hash · single use
      │
      ├── blocked → Safe Refusal + Transaction Trace
      ▼
Consumed Payment Mandate
      │
      ▼
Idempotent Razorpay test order adapter
      │                    └── authenticated CLI fallback ends at order
      ▼
Razorpay Standard Checkout
      │
      ▼
Signed order evidence crosses stateless function boundary
      │
      ▼
Server-side callback signature verification
      │
      ▼
Verified result in Transaction Trace
```

## Trust boundary

The model translates natural language into a schema. It cannot create orders or bypass policy. Money eligibility is decided by deterministic checks over signed intent, typed catalog evidence, checkout hashes, and a single-use redemption ledger. The browser receives only the public Razorpay test key; the secret remains server-side for order creation and callback signature verification.

## Deliberate simplifications

- Mandates are AP2-inspired local objects rather than standards-compliant Verifiable Digital Credentials.
- Order evidence is signed so payment verification survives stateless Vercel invocations. Mandate and webhook deduplication remain in memory for the demo; production needs a Marketplace Redis or database with atomic uniqueness.
- The synthetic catalog uses one merchant and three products because one complete, inspectable flow is the submission target.
