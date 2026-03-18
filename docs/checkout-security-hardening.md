# Checkout Security Hardening

## Context

Date: 2026-02-25

The checkout flow was hardened to ensure the browser only sends purchase intent and never controls monetary fields.

Main security rule:

- Frontend sends only `planKey` (example: `pro_monthly`).
- Backend is the single source of truth for `stripePriceId`.

## Threat model addressed

This change blocks common checkout tampering vectors:

1. Client sending `priceId` or internal Stripe IDs directly.
2. Client sending `amount`, `plan_price`, discount values, trial options, or billing duration.
3. Duplicate checkout session creation from repeated clicks.
4. User buying an incompatible subscription state (already active on same plan tier).

## What changed

## 1) Authoritative server-side plan catalog

New file:

- `src/lib/billing/plans.ts`

Implemented:

- `CheckoutPlanKey` whitelist:
  - `pro_monthly`
  - `enterprise_monthly`
- Mapping from `planKey` to server env-backed Stripe price IDs:
  - `pro_monthly -> STRIPE_PRO_PRICE_ID`
  - `enterprise_monthly -> STRIPE_ENTERPRISE_PRICE_ID`
- `getCheckoutPlan(planKey)` returns `null` if:
  - key is unknown
  - mapped Stripe price ID is missing

Result:

- Client cannot pick arbitrary Stripe price IDs.

## 2) Checkout route contract hardening

Updated file:

- `src/app/api/stripe/create-checkout/route.ts`

### Accepted request contract

Only this payload is accepted:

```json
{ "planKey": "pro_monthly" }
```

### Explicitly rejected client pricing fields

If any of these fields are present, route returns `400`:

- `priceId`
- `price_id`
- `price`
- `amount`
- `discount_value`
- `plan_price`
- `coupon`
- `promotion_code`
- `trial_period_days`
- `duration`
- `billing_cycle`

Any unknown extra field also returns `400`.

### Server-side checkout flow now

1. Parse and validate payload shape.
2. Enforce `planKey` exists and is whitelisted.
3. Authenticate user (`401` if unauthenticated).
4. Resolve current subscription status server-side.
5. Block same-tier active repurchase (`409`).
6. Resolve Stripe customer server-side.
7. Resolve `stripePriceId` from server plan catalog.
8. Create Checkout Session with fixed backend price.
9. Store authoritative metadata:
   - `user_id`
   - `plan_key`
10. Return only:
   - `{ "url": "<stripe-checkout-url>" }`

### Stripe session protections

- `allow_promotion_codes: false`
- Client does not control coupon, trial, or duration.
- `idempotencyKey` added to `stripe.checkout.sessions.create(...)`.

## 3) Idempotency for duplicate-click protection

Implemented in checkout route:

- `buildCheckoutIdempotencyKey(userId, planKey)`
- 20-second bucket strategy:
  - same user + same plan + same small time window => same idempotency key

Result:

- repeated clicks do not create many checkout sessions.

## 4) Active-plan compatibility validation

Implemented in checkout route with `getSubscriptionStatus(user.id)`:

- If user already has effective paid access for the same tier (`active` or `past_due`), route returns `409`.

Result:

- prevents buying the same active tier again through the standard checkout endpoint.

## 5) Frontend updated to intent-only payload

Updated files:

- `src/app/page.tsx`
- `src/app/upgrade/page.tsx`

Both now call checkout route with:

```json
{ "planKey": "pro_monthly" }
```

No frontend price value is sent.

## 6) Billing tests aligned

Updated file:

- `src/app/api/stripe/tests/billing-e2e.test.ts`

Changes:

1. Checkout tests now send `planKey` instead of `priceId`.
2. Added assertions for:
   - metadata includes `plan_key`
   - `allow_promotion_codes` is disabled
   - Stripe call includes `idempotencyKey`
3. Added test for forbidden client pricing field rejection.
4. Added test for "already active same tier" rejection (`409`).
5. Updated Stripe module mock exports to include:
   - `getSubscriptionStatus`
   - `ENTERPRISE_PRICE_ID`

## Behavior and status codes

`POST /api/stripe/create-checkout`

- `200` success:
  - `{ "url": "https://checkout.stripe.com/..." }`
- `400` invalid payload:
  - missing/invalid `planKey`
  - forbidden pricing fields
  - unknown extra fields
  - unavailable plan mapping
- `401` unauthenticated user
- `409` user already has same-tier active plan
- `500` internal errors or checkout URL missing

## Security outcomes

After this hardening:

1. Browser cannot set final checkout price.
2. Browser cannot set discount/trial/duration primitives.
3. Server enforces plan whitelist and authoritative price mapping.
4. Duplicate session creation is reduced via idempotency.
5. Same-plan active repurchase is blocked in route logic.

## Operational notes

1. Required env vars for active plans:
   - `STRIPE_PRO_PRICE_ID`
   - `STRIPE_ENTERPRISE_PRICE_ID` (if enterprise checkout is enabled)
2. If plan key exists but mapped env var is missing, route safely rejects.
3. Existing offer endpoint may still expose display info to UI, but checkout price authority remains server-side route mapping.

## Possible next hardening steps

1. Persist checkout idempotency records in DB/Redis for longer windows and better traceability.
2. Add explicit downgrade/upgrade matrix validation (cross-tier rules).
3. Introduce internal admin-managed `plans` table if dynamic catalog management is needed.
4. Add audit log for rejected checkout payloads with forbidden fields.

