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
  API credentials or authenticated CLI
```

## Trust boundary

The model translates natural language into a schema. It cannot create orders or bypass policy. Money eligibility is decided by deterministic checks over signed intent, typed catalog evidence, checkout hashes, and a single-use redemption ledger.

## Deliberate simplifications

- Mandates are AP2-inspired local objects rather than standards-compliant Verifiable Digital Credentials.
- Mandate and webhook deduplication state is in memory for the demo. A production version needs durable atomic consumption with a unique database constraint.
- The synthetic catalog uses one merchant and three products because one complete, inspectable flow is the submission target.
