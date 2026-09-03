# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Node.js with browser-native HTML/CSS/JavaScript, chosen to keep the submission runnable without framework or dependency setup.

## Users

Small merchants with informal or inconsistent digital catalogs who want AI buying agents to discover and purchase their products safely.

## Product Purpose

Vowgate is the mandate firewall for agentic commerce. It converts a merchant catalog into an agent-readable buying surface, executes a Razorpay test-mode purchase, and proves that the flow respects customer intent under adversarial changes. Success means a reviewer can watch a valid purchase complete and unsafe purchases stop for an explicit reason.

## Positioning

Vowgate is not another conversational checkout. It is the authorization layer between an AI buyer and payment: a conformance lab that proves the buyer stayed inside a customer-approved mandate despite price changes, forbidden substitutions, malicious catalog text, duplicate events, and stale inventory.

## Operating Context

An individual submission by Adithya S for Razorpay AI Buildathon 2026, Track 1: AI Growth & Agentic Commerce. The judged artifact is a public repository, runnable product, architecture explanation, five-minute demonstration, and honest failure-recovery account.

## Capabilities and Constraints

- Import a merchant catalog and surface unresolved fields instead of inventing them.
- Translate natural-language purchase intent into a structured mandate requiring customer approval.
- Use deterministic policy gates for spend, quantity, substitution, freshness, and payment authorization.
- Create and complete one Razorpay test-mode transaction end to end.
- Run adversarial conformance scenarios and report task completion and policy violations honestly.
- Present a commerce flight recorder showing evidence, decisions, approvals, payment events, and refusals.
- Initial operating budget is ₹500 for model calls, deployment, and optional domain costs.
- No live money movement or fabricated merchant evidence.
- Gemini 2.5 Flash Lite performs structured intent extraction when configured; the exact demo intent has a clearly labelled fixture fallback.
- The zero-dependency Node service ships with a tested production container; public hosting requires provider authentication.
- Nightswitch Supply is a deliberately synthetic merchant; real merchant validation remains future evidence.

## Evidence on Hand

The official buildathon brief and Razorpay API/webhook documentation are summarized in `/home/wk/razorpay-buildathon-research.md`. Adithya's profile is at `/home/wk/Downloads/Profile.pdf`. No customer results, live transaction data, or merchant testimonial exists and none may be fabricated.

## Product Principles

- Every money action must be explainable, bounded, gated, and auditable.
- AI interprets intent; deterministic policy authorizes transactions.
- A safe refusal is a successful outcome.
- Evidence before claims.
- One complete transaction under pressure beats a broad collection of demos.

## Accessibility & Inclusion

The web application must support keyboard use, semantic landmarks, visible focus, reduced motion, and color-independent status communication.
