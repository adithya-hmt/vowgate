# Vowgate — Buildathon Submission

## Track

Track 1: AI Growth & Agentic Commerce

## One-line pitch

Vowgate is the mandate firewall for agentic commerce: it lets AI choose, but requires signed customer intent and deterministic policy proof before Razorpay can create an order.

## Problem

An AI shopping agent can understand natural language while still making an unsafe purchase after a price change, substitution, stale inventory read, malicious catalog instruction, or replayed payment authorization. A fluent answer is not payment authority.

## Solution

Vowgate separates interpretation from authorization:

1. Gemini extracts explicit constraints from customer language when configured.
2. Vowgate signs an expiring Open Checkout Mandate.
3. A typed catalog produces checkout evidence and a bound Payment Mandate.
4. Deterministic gates verify signature, expiry, merchant, catalog version, stock, attributes, price, budget, checkout hash, and single use.
5. Only a policy pass can create a Razorpay test order.
6. Every pass or refusal appears in a commerce flight recorder.

## Demonstrated result

- 6/6 conformance scenarios behave as expected.
- Five adversarial purchase attempts are blocked.
- Zero unsafe attempts reach order creation.
- The valid path created Razorpay test order `order_TXdEqoqMlLdTyq` through the authenticated Razorpay CLI.
- Two requests for the same Payment Mandate both resolved to that one order.

## AI usage

Gemini 2.5 Flash Lite performs structured intent extraction only. It never authorizes payment. Without a Gemini key, the exact published demo instruction uses a clearly labelled verified fixture; arbitrary instructions fail closed.

## Razorpay usage

Vowgate creates Razorpay Orders in test mode through either direct test credentials or the locally authenticated Razorpay CLI. It also validates webhook signatures against the raw request body and deduplicates event IDs.

## Distinctive technical moment

The Payment Mandate replay scenario consumes a single-use mandate, presents it again, and visibly refuses the second redemption with `MANDATE_REPLAY`. This turns a subtle protocol risk into an inspectable demo.

## Links

- Repository: https://github.com/adithya-hmt/vowgate
- Run locally: `npm test && npm start`
- Health check: `GET /api/health`

## Honesty boundary

Nightswitch Supply, its catalog, and all benchmark results are synthetic. Vowgate is AP2-inspired, not AP2-certified. It moves no live money and is not affiliated with Razorpay.
