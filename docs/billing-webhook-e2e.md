# Billing E2E (Stripe -> Staging -> DB)

## Goal
Validate true end-to-end billing behavior in staging:

- Stripe sends real webhook events to a public HTTPS endpoint.
- Signature verification and event parsing are correct.
- Idempotency blocks duplicate processing for the same `event.id`.
- `profiles` and `subscriptions` are updated in Supabase.
- Real Stripe Checkout UI can be completed in a headless browser.

## Staging requirements

1. Staging deploy with public HTTPS URL.
2. Staging env vars:
   - `STRIPE_SECRET_KEY` (test mode)
   - `STRIPE_WEBHOOK_SECRET` (for staging webhook endpoint)
   - `STRIPE_PRO_PRICE_ID`
   - `STRIPE_ENTERPRISE_PRICE_ID` (optional)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BILLING_E2E_ENABLED=true`
   - `BILLING_CHECKOUT_E2E_ENABLED=true`
   - `BILLING_APP_ROUTE_E2E_ENABLED=true`
   - `BILLING_E2E_SECRET=<strong-random-token>`
   - `APP_ENV=staging` when the staging host does not provide `VERCEL_ENV=preview`
3. Stripe webhook endpoint (test mode):
   - URL: `https://<staging>/api/stripe/webhook`
   - Events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`

## Internal integration endpoints

### 1) Webhook integration bootstrap

- `POST /api/stripe/integration/bootstrap`
- Required header: `x-billing-e2e-key: <BILLING_E2E_SECRET>`

Creates integration user + Stripe customer + Stripe subscription and seeds DB rows used by webhook tests.

### 2) Checkout integration bootstrap

- `POST /api/stripe/integration/create-checkout-session`
- Required header: `x-billing-e2e-key: <BILLING_E2E_SECRET>`

Creates integration user + Stripe customer + real Checkout Session and returns `checkoutUrl`.

## CI setup

`live-integration-smoke` uses `scripts/ci/live-integration-smoke.mjs`.

Configure:

- Existing flag: `ENABLE_LIVE_INTEGRATION_CI=true`
- New optional flags:
  - `ENABLE_BILLING_WEBHOOK_E2E_CI=true`
  - `ENABLE_BILLING_CHECKOUT_E2E_CI=true`
- Required secrets:
  - `BILLING_E2E_APP_URL` (for example `https://staging.example.com`)
  - `BILLING_E2E_SECRET`
  - `STRIPE_WEBHOOK_SECRET`
  - existing Stripe and Supabase secrets already used by live integration

When checkout E2E is enabled, CI also runs:

- `npx playwright install --with-deps chromium`

## Staging launch command

Run the complete staging validation with:

```bash
npm run stripe:staging:validate
```

This uses the same live integration runner as CI. With all billing flags enabled it validates webhooks, hosted Checkout, authenticated confirmation/status/portal routes, cancellation, and refund.

For the public-launch acceptance artifact, run the full command sequence in `docs/public-launch-billing-evidence.md`. The command writes a sanitized JSON summary under `artifacts/billing/<timestamp>/` when `BILLING_E2E_ARTIFACT_DIR` is set.

## What the script validates

## Stage 1: Real webhook integration (no browser checkout)

1. Calls `/api/stripe/integration/bootstrap`.
2. Confirms Stripe customer/subscription exist via Stripe API.
3. Calls Stripe API to update subscription (`cancel_at_period_end=true`).
4. Polls Supabase until webhook changes DB state.
5. Replays the exact same event payload (signed) and expects `duplicate=true`.
6. Replays signed synthetic webhook events and verifies `transient_failure` retry behavior and terminal `permanent_failure` duplicate blocking.
7. Calls Stripe API to cancel subscription.
8. Polls Supabase until downgrade is applied.
9. Cleans up Stripe customer and auth user.

## Stage 2: Real checkout UI integration (Playwright)

1. Calls `/api/stripe/integration/create-checkout-session`.
2. Verifies Checkout Session exists via Stripe API.
3. Opens `checkoutUrl` in headless Chromium and submits test card:
   - card: `4242 4242 4242 4242`
   - expiry: `12/34`
   - cvc: `123`
   - postal code: `12345` (when requested)
4. Polls Stripe until session is `complete` and `paid`.
5. Polls Supabase until webhook upgrades profile/subscription.
6. Verifies `checkout.session.completed` was logged as successful.
7. Cleans up created subscription/customer/user.

## Stage 3: Authenticated app billing routes

1. Creates an integration checkout session and integration user.
2. Signs the user in through `/api/auth/csrf` and `/api/auth/login`.
3. Completes hosted Checkout in Chromium.
4. Calls `/api/stripe/confirm-checkout` with the real `session_id`.
5. Calls `/api/stripe/subscription-status` and expects paid Pro access, not free-trial masking.
6. Calls `/api/stripe/create-portal` and expects a Stripe Billing Portal URL.
7. Creates a second integration subscription and calls `/api/stripe/cancel-subscription`.
8. Verifies Stripe `cancel_at_period_end=true` and the DB subscription row.
9. Creates a third integration subscription and calls `/api/stripe/refund-subscription`.
10. Verifies a real Stripe refund exists and the DB profile is canceled/free.
