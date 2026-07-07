# Public Launch Billing Evidence Package

## Purpose

The paid public launch remains `NO-GO` until staging has one archived passing run of:

```bash
npm run stripe:staging:validate
```

That run must prove the deployed staging app can complete Stripe billing end to end with test-mode Stripe objects before real paid public traffic is accepted.

## What was missing

- The integration routes were previously disabled whenever `NODE_ENV=production`, which blocks Vercel preview/staging builds because they also run production builds.
- The staging validator did not create a durable machine-readable artifact.
- The live webhook validation covered `applied` and duplicate idempotency, but did not prove staging behavior for `transient_failure` retry and terminal `permanent_failure`.

## Staging environment required

Set these on the deployed staging app, not only in local `.env`:

- `BILLING_E2E_ENABLED=true`
- `BILLING_CHECKOUT_E2E_ENABLED=true`
- `BILLING_APP_ROUTE_E2E_ENABLED=true`
- `BILLING_E2E_SECRET=<strong-random-token>`
- `BILLING_E2E_APP_URL=https://<staging-host>`
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...` for `https://<staging-host>/api/stripe/webhook`
- `STRIPE_PRO_PRICE_ID=price_...` from Stripe test mode
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The integration routes are enabled only when the route flag is true, `BILLING_E2E_SECRET` is set, and the deployment environment is not production. Vercel preview/staging deploys can rely on `VERCEL_ENV=preview`; non-Vercel staging must set `APP_ENV=staging`. Keep all `BILLING_*_E2E_*` route flags false in production.

For the local preflight that now runs before `npm run stripe:staging:validate`, also set `QSTASH_TOKEN` in the local `.env` or shell. If your QStash account is regional, set `QSTASH_URL` to the matching regional endpoint, for example `https://qstash-us-east-1.upstash.io`. These values are used only to verify that the four QStash schedules exist with the expected `GET` method and cron expressions; they are not required by the deployed app runtime.

## Stripe webhook endpoint required

Create the Stripe test-mode webhook endpoint:

- URL: `https://<staging-host>/api/stripe/webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`

## Final command sequence

Run from the repo root in PowerShell after staging is deployed and `.env` points at staging/test-mode services:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dir = "artifacts/billing/$stamp"
New-Item -ItemType Directory -Force $dir | Out-Null

Start-Transcript -Path "$dir/session-transcript.txt" -NoClobber

npm run lint:ci
if ($LASTEXITCODE -ne 0) { Stop-Transcript; exit $LASTEXITCODE }

npm run test -- src/lib/billing/tests/e2e-gate.test.ts src/app/api/stripe/tests/billing-e2e.test.ts
if ($LASTEXITCODE -ne 0) { Stop-Transcript; exit $LASTEXITCODE }

npx playwright install chromium
if ($LASTEXITCODE -ne 0) { Stop-Transcript; exit $LASTEXITCODE }

$env:BILLING_E2E_ARTIFACT_DIR = $dir
npm run stripe:staging:validate
if ($LASTEXITCODE -ne 0) { Stop-Transcript; exit $LASTEXITCODE }

Stop-Transcript
Get-ChildItem $dir
```

Do not archive `.env`, Stripe secrets, Supabase service role keys, or raw webhook payloads.

## Artifact format

Store the whole timestamped directory:

```text
artifacts/billing/<yyyyMMdd-HHmmss>/
  session-transcript.txt
  stripe-staging-validate-<iso-timestamp>.json
```

The JSON artifact is written by `scripts/ci/live-integration-smoke.mjs` and must contain:

```json
{
  "schemaVersion": 1,
  "runType": "stripe-staging-validate",
  "command": "npm run stripe:staging:validate",
  "startedAt": "ISO-8601 timestamp",
  "finishedAt": "ISO-8601 timestamp",
  "status": "passed",
  "appUrl": "https://<staging-host>",
  "nodeVersion": "v...",
  "stages": [
    { "name": "supabase", "status": "passed" },
    { "name": "stripe_catalog", "status": "passed" },
    { "name": "billing_webhook_e2e", "status": "passed" },
    { "name": "billing_checkout_e2e", "status": "passed" },
    { "name": "billing_app_routes_e2e", "status": "passed" }
  ],
  "cleanupWarnings": []
}
```

The `billing_webhook_e2e` stage must include evidence checks for:

- `customer.subscription.updated` applied from a real Stripe event.
- Signed duplicate replay returns `duplicate=true`.
- Signed synthetic `transient_failure` returns `500` and remains retryable.
- Signed synthetic `permanent_failure` returns `200`, is logged as terminal, and duplicate replay returns `duplicate=true`.
- `customer.subscription.deleted` downgrades the user to free.

The `billing_app_routes_e2e` stage must include evidence checks for:

- Hosted Checkout completion.
- `/api/stripe/confirm-checkout`.
- `/api/stripe/subscription-status` returning paid Pro without free-trial masking.
- `/api/stripe/create-portal`.
- `/api/stripe/cancel-subscription`.
- `/api/stripe/refund-subscription`.

## Acceptance rule

Accept paid public traffic only when:

- The command sequence above exits 0.
- The JSON artifact has `"status": "passed"`.
- Every stage has `"status": "passed"`; no billing stage is `"skipped"`.
- Any `cleanupWarnings` are reviewed and resolved or explicitly accepted.
- The timestamped artifact directory is copied to the launch evidence archive.
