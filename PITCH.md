# Vowgate — Three-minute judge demo

## 0:00–0:25 — Problem

“AI can interpret what a customer wants, but interpretation is not permission to spend. A merchant can add charges, substitute an item, change fulfillment, inject instructions into catalog prose, tamper with checkout, or replay authority. Vowgate is the commerce authorization firewall between agent reasoning and checkout execution.”

Show the hero. Clarify that Razorpay Standard Checkout remains human-facing.

## 0:25–0:55 — Explicit customer approval

Click **Normalize for review** once.

“Gemini—or this clearly labelled fixture—only translates language. Notice that the mandate is still inactive. Vowgate converts ‘under ₹3,000’ into separate ₹3,000 unit-price and final-payable-total caps, plus exact quantity, attributes, no substitutions, one merchant, one catalog snapshot, a concrete delivery date, and expiry.”

Click **Approve & activate mandate**.

“This second customer action activates the server-signed Open Checkout Mandate. The signature seals exactly what was displayed; it does not claim to be customer identity or a legal signature.”

## 0:55–1:45 — Six-scenario pressure suite

Click **Run pressure suite**.

“The valid checkout passes. Malicious catalog prose cannot override typed category facts. A changed SKU is denied as `SUBSTITUTION_PROHIBITED`. An ₹800 shipping charge makes the final payable total exceed authority. A post-authorization fee change produces different canonical checkout fingerprints. A second atomic reservation produces `MANDATE_ALREADY_CONSUMED`.”

Pause on **6/6**, **five threats stopped**, and **zero unsafe checkouts**. Select **Checkout hash tampering**, then **Payment Mandate replay**, and point to the concise Flight Recorder evidence.

## 1:45–2:30 — Razorpay test Checkout

Select **Authorized checkout**, then click **Open Razorpay Checkout**.

“Policy recomputes the SHA-256 fingerprint, reserves the signed five-minute Payment Mandate, and only then creates one Razorpay test order. The state advances from `ISSUED` to `RESERVED` to `ORDER_CREATED`. Razorpay still asks the human to complete Standard Checkout.”

Complete the test payment.

“The browser says only that payment returned. Vowgate labels it verified after the backend checks Razorpay's HMAC signature, then records `PAYMENT_VERIFIED`.”

## 2:30–3:00 — Trust boundary and honest close

“The model never authorizes checkout. Product descriptions never prove compliance. Vowgate trusts its backend, signing key, deterministic policy, configured structured catalog facts, and Razorpay's verified signature. Upstash Redis Free makes the single-use transition atomic across Vercel instances, with TTL fixed to the signed mandate expiry.”

End with:

“Agentic commerce scales only when every checkout can prove what the customer approved, that the exact payable transaction still matches it, and that the authority has not already been used.”
