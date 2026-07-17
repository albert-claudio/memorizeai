# Public Launch Checklist

## 1. Blockers before public launch

- Apply the migrations `supabase/migrations/20260311_01_lock_app_events_insert.sql` and `supabase/migrations/20260613_01_free_trial_access.sql` in the target database.
- Validate that `/api/admin/funnel` is deployed with the same admin guard used by the other admin routes.
- [x] Keep `/api/analytics/track` behind same-origin requests only and only accept client-safe funnel events; do not re-open direct client writes to `app_events`.
- [x] Enforce public launch AI quotas in `checkRunEntitlement`; Free users get flashcards only and simulados stay Pro.
- [x] Harden `/api/process-source` against direct replay/oversized extracted-text payloads.
- [x] Harden simulado reinforcement generation against prompt injection, XSS-like generated output, and per-user cost bursts.
- [x] Replace public beta redemption with an automatic 30-day free trial for authenticated users.
- [x] Resolved missing `NEXT_PUBLIC_APP_URL` by implementing `getBaseUrl()` with automatic Vercel fallbacks (previously it was missing and impacted runs and cron).

## 2. Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `NEXT_PUBLIC_APP_URL`
- `RUNS_PROCESS_INTERNAL_SECRET`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `SECURITY_ALERT_EMAIL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `FREE_TRIAL_DAYS`
- `FREE_FLASHCARD_RUNS_PER_MONTH`
- `FREE_SIMULADO_RUNS_PER_MONTH`
- `PRO_FLASHCARD_RUNS_PER_MONTH`
- `PRO_SIMULADO_RUNS_PER_MONTH`

## 3. Operational validation

- Run `npm run lint:ci`.
- Run `npm run test`.
- Run `npm run build`.
- Run `npm run public-launch:preflight` against deployed staging before the billing evidence run.
- Run the new Supabase migration in staging, then production.
- Run the billing evidence package in `docs/public-launch-billing-evidence.md` against staging. This must produce an archived passing `npm run stripe:staging:validate` JSON artifact and transcript.
- Verify Stripe webhook retry outcomes in the archived staging run: `applied`, `transient_failure`, `permanent_failure`, and duplicate idempotency.
- Create the QStash schedules for `/api/cron/recover-runs`, `/api/cron/health-check`, `/api/cron/alerts`, and `/api/cron/system-report`.
- Verify cron routes with valid QStash signatures.
- Confirm Redis is reachable from the deployed app; rate limiting and circuit breaker are intentionally weaker without it.

## 4. Security checks after deploy

- Confirm admin routes require authenticated session, JWT admin role, DB admin role, and MFA AAL2.
- Confirm `app_events` rejects direct anon inserts through the public Supabase endpoint.
- Confirm the CSP header in production no longer includes `'unsafe-eval'`.
- Confirm Stripe checkout only accepts the allowed origins.
- Confirm `/api/runs/process` rejects requests without `x-internal-secret`.

## 5. Business readiness

- Review `/termos` and `/privacidade` with final legal copy.
- Validate subscription cancel flow in Stripe Billing Portal.
- Validate post-checkout confirmation flow on `/api/stripe/confirm-checkout`.
- Archive the successful billing evidence package from `docs/public-launch-billing-evidence.md` before accepting public paid traffic.
- Decide support/alerting destination for `WEBHOOK_ALERT_URL`.
- Configure the Telegram bot/chat that will receive the daily system report.
- Define refund and incident handling process before charging real users.
