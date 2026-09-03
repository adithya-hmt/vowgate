# Vowgate Commerce Context

Vowgate describes how a merchant becomes safely transactable by an AI buyer and how that safety is demonstrated.

## Language

**Merchant**:
The business whose catalog and Razorpay account participate in a purchase.
_Avoid_: Seller, vendor, account

**Buyer Agent**:
An AI system acting from a customer's expressed purchase intent.
_Avoid_: Bot, shopper, autonomous customer

**Purchase Intent**:
The customer's requested outcome and constraints before products or payment are selected.
_Avoid_: Prompt, query

**Open Checkout Mandate**:
The signed, time-bounded purchase constraints a Buyer Agent may use to assemble a checkout.
_Avoid_: Prompt, permission, AI decision

**Payment Mandate**:
A single-use authorization bound to the exact hashed checkout eligible for payment.
_Avoid_: Payment request, reusable token

**Catalog Evidence**:
The versioned product, price, inventory, and policy facts used to evaluate a purchase.
_Avoid_: Context, product data

**Policy Gate**:
A deterministic decision that either permits the next commerce action or returns a specific refusal.
_Avoid_: AI guardrail, validation

**Conformance Scenario**:
A controlled change or adversarial condition used to test whether a Buyer Agent remains inside its Purchase Mandate.
_Avoid_: Edge case, demo failure

**Transaction Trace**:
The ordered evidence of intent, catalog facts, policy decisions, approval, and payment events for one attempted purchase.
_Avoid_: Logs, chain of thought

**Safe Refusal**:
A stopped purchase caused by a Policy Gate correctly detecting that the requested action is no longer authorized.
_Avoid_: Error, failed checkout
