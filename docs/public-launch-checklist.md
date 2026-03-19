# Public Launch Checklist

## 1. Blockers before public launch

- Apply the migration `supabase/migrations/20260311_01_lock_app_events_insert.sql` in the target database.
- Validate that `/api/admin/funnel` is deployed with the same admin guard used by the other admin routes.
- Keep `/api/analytics/track` behind same-origin requests only; do not re-open direct client writes to `app_events`.
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
- `ADMIN_EMAILS`
- `ADMIN_PASSWORD`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## 3. Operational validation

- Run `npm run lint:ci`.
- Run `npm run test`.
- Run `npm run build`.
- Run the new Supabase migration in staging, then production.
- Verify Stripe webhook delivery in staging with a real signed event.
- Create the QStash schedules for `/api/cron/recover-runs`, `/api/cron/health-check`, and `/api/cron/alerts`.
- Verify cron routes with valid QStash signatures.
- Confirm Redis is reachable from the deployed app; rate limiting and circuit breaker are intentionally weaker without it.

## 4. Security checks after deploy

- Confirm admin routes require both authenticated session and `x-admin-password`.
- Confirm `app_events` rejects direct anon inserts through the public Supabase endpoint.
- Confirm the CSP header in production no longer includes `'unsafe-eval'`.
- Confirm Stripe checkout only accepts the allowed origins.
- Confirm `/api/runs/process` rejects requests without `x-internal-secret`.

## 5. Business readiness

- Review `/termos` and `/privacidade` with final legal copy.
- Validate subscription cancel flow in Stripe Billing Portal.
- Validate post-checkout confirmation flow on `/api/stripe/confirm-checkout`.
- Decide support/alerting destination for `WEBHOOK_ALERT_URL`.
- Define refund and incident handling process before charging real users.
