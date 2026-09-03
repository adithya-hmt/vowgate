# Vowgate — Buildathon Submission

## Track

Track 1: AI Growth & Agentic Commerce

## One-line pitch

Vowgate is the commerce authorization firewall for AI shopping agents: it turns interpreted intent into customer-approved, checkout-bound authority before Razorpay Standard Checkout may open.

## Problem

A fluent model answer is not permission to spend. Price, quantity, charges, product attributes, delivery, merchant, or catalog state can change between an AI recommendation and checkout. Catalog prose can attack the agent, and valid authorization can be replayed concurrently.

## Solution

1. Gemini extracts explicit constraints but receives no order-creation capability.
2. Vowgate presents a normalized authorization review with distinct item-price and final-total caps, exact quantity, required attributes, substitution rule, merchant allowlist, catalog snapshot, concrete delivery date, and expiration.
3. A separate customer action activates an HMAC-signed Open Checkout Mandate containing exactly that reviewed structure.
4. Typed catalog fields produce a canonical checkout with every represented payable amount and fulfillment promise. Free-form merchant text is non-authoritative.
5. A signed, five-minute, single-use Payment Mandate binds the SHA-256 canonical checkout fingerprint.
6. Central deterministic policy must pass before an atomic `ISSUED → RESERVED` transition permits Razorpay test-order creation.
7. Razorpay Standard Checkout remains human-facing; the server verifies its returned payment signature before recording `PAYMENT_VERIFIED`.
8. The Commerce Flight Recorder shows sanitized constraints, trusted facts, fingerprints, reason codes, and state transitions.

## Demonstrated result

The exact six-scenario pressure suite produces:

- 6/6 expected decisions
- Five adversarial checkouts blocked
- Zero unsafe checkouts reaching order creation
- Prompt-injection prose ignored in favor of typed policy facts
- `SUBSTITUTION_PROHIBITED` for a changed SKU
- `ORDER_TOTAL_EXCEEDED` when shipping pushes the payable amount beyond authority
- `CHECKOUT_HASH_MISMATCH` after fee tampering
- `MANDATE_ALREADY_CONSUMED` on replay

The valid path creates one Razorpay test order, opens Standard Checkout, and accepts success only after backend signature verification. A prior deployed valid path created test order `order_TXeYi5b8pw7tLq`; order IDs are test artifacts, not live transactions.

## AI usage

Gemini 2.5 Flash Lite performs schema-constrained intent extraction only. Its output is visibly inactive until the customer approves the normalized review. Without a Gemini key, only the exact published instruction uses a clearly labelled verified fixture; arbitrary instructions fail closed.

## Razorpay usage

With direct `rzp_test_` credentials, Vowgate creates a Razorpay Order only after policy authorization, opens human-facing Standard Checkout, and verifies the callback signature on the server. Live key IDs are refused. The authenticated Razorpay CLI remains an order-only fallback. The webhook endpoint validates the raw body signature and deduplicates event IDs when configured.

## Trust and limitation

The Vowgate backend, HMAC key, deterministic policy, and configured structured catalog authority form the trusted computing base. LLM output, agent reasoning, browser state, client checkout claims, and all free-form merchant content are untrusted. Typed catalog facts are trusted configuration, not independently proven truth.

The current compare-and-set mandate state and webhook event ledger are process-local. They prove the state-machine design and same-process concurrency behavior; production serverless replay protection requires an atomic Redis or transactional database. The demo proves delegated shopping/checkout authorization plus server-side payment verification—not autonomous unattended fund movement or legal customer identity.

## What broke and how it recovered

The first concept duplicated existing failed-payment recovery capabilities, so the project pivoted to the unresolved authorization boundary. The replacement then exposed duplicate-order risk. Vowgate first deduplicated in-flight creation and now reserves a signed Payment Mandate atomically before calling Razorpay, releases only pre-order failures, and retains established orders after Checkout abandonment.

## Links

- Live demo: https://vowgate.vercel.app
- Repository: https://github.com/adithya-hmt/vowgate
- Run locally: `npm test && npm start`
- Health check: `GET /api/health`

## Honesty boundary

Nightswitch Supply, its catalog, and all evaluation data are synthetic. Vowgate is AP2-inspired, not AP2-certified, moves no live money, and is not affiliated with Razorpay.
