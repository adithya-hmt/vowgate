# Vowgate

**The mandate firewall for agentic commerce.**

An individual Razorpay AI Buildathon 2026 submission by **Adithya S** for Track 1: AI Growth & Agentic Commerce.

Vowgate turns customer intent into signed purchase authority, pressure-tests every checkout mutation, and creates a Razorpay test order only after deterministic policy gates pass.

![Vowgate product](docs/vowgate-product.png)

## Screenshots

![Desktop pressure suite](docs/screenshots/vowgate-desktop.png)

![Mobile layout](docs/screenshots/vowgate-mobile.png)

## Why it matters

AI can interpret what a customer wants, but it should not decide whether money moves. Vowgate keeps the model outside authorization and produces an inspectable reason for every approval or refusal.

- Signed, expiring Open Checkout Mandate
- Typed merchant catalog with untrusted product descriptions
- Checkout evidence hash and single-use Payment Mandate
- Deterministic spend, quantity, substitution, freshness, stock, and replay gates
- Six-scenario adversarial pressure suite
- Commerce flight recorder for every decision
- Real Razorpay test-order creation through API keys or the authenticated Razorpay CLI
- Signed webhook validation and event deduplication

## Run

Requires Node.js 20+.

```bash
cp .env.example .env
npm test
npm start
```

Open `http://localhost:3000`. Vowgate automatically uses an authenticated Razorpay CLI configuration when direct test keys are absent. Without either, it stays fully runnable in clearly labelled simulation mode.

Optional live intent extraction:

```bash
GEMINI_API_KEY=your_key npm start
```

## Demo

1. Interpret the customer instruction.
2. Run the six-scenario pressure suite.
3. Inspect the Payment Mandate replay refusal.
4. Select **Authorized purchase**.
5. Create the Razorpay test order.

Expected result: **6/6 conformant, five threats stopped, zero unsafe payments**.

## Deploy

The server has no runtime dependencies and includes a production container:

```bash
docker build -t vowgate .
docker run --rm -p 3000:3000 --env-file .env vowgate
```

Health check: `GET /api/health`.

## Architecture and evidence

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — trust boundary and request flow
- [`CONTEXT.md`](CONTEXT.md) — domain language and invariants
- [`PLAN.md`](PLAN.md) — build thesis and measured bar
- [`DESIGN.md`](DESIGN.md) — interface system and brand boundary
- [`SUBMISSION.md`](SUBMISSION.md) — ready-to-paste buildathon submission
- [`PITCH.md`](PITCH.md) — five-minute demo script

![Vowgate brand kit](docs/vowgate-brandkit.png)

## Honesty boundary

Nightswitch Supply, its catalog, and all conformance results are synthetic. Vowgate is AP2-inspired, not AP2-certified. It uses Razorpay test mode only and is not an official Razorpay product. Product-name searches found no material software collision for “Vowgate”; this is not legal trademark clearance.

Released under the [MIT License](LICENSE).
