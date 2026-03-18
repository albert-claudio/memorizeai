-- Lock down app_events writes to backend-only ingestion.
-- Client tracking now goes through /api/analytics/track, which validates
-- origin, event names and payload shape before inserting with service_role.

DROP POLICY IF EXISTS "Anyone can insert events" ON public.app_events;

REVOKE INSERT ON TABLE public.app_events FROM anon;
REVOKE INSERT ON TABLE public.app_events FROM authenticated;

GRANT INSERT ON TABLE public.app_events TO service_role;

DROP POLICY IF EXISTS "Service role can insert events" ON public.app_events;
CREATE POLICY "Service role can insert events"
  ON public.app_events
  FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');
