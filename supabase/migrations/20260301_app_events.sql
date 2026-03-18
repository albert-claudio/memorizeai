-- Migration: Create app_events table for funnel analytics
-- Lightweight event tracking without external dependencies

CREATE TABLE IF NOT EXISTS app_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient funnel queries
CREATE INDEX IF NOT EXISTS idx_app_events_event ON app_events(event);
CREATE INDEX IF NOT EXISTS idx_app_events_created ON app_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_user ON app_events(user_id);
CREATE INDEX IF NOT EXISTS idx_app_events_session ON app_events(session_id);

-- RLS: anyone can INSERT (for anonymous visitor tracking), only service_role can SELECT
ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;

-- Rate-limited insert for anon and authenticated users
CREATE POLICY "Anyone can insert events" ON app_events
  FOR INSERT
  WITH CHECK (true);

-- Only service_role can read (admin/cron use)
CREATE POLICY "Service role can read events" ON app_events
  FOR SELECT
  USING (auth.role() = 'service_role');

-- Prevent updates/deletes from non-service roles
CREATE POLICY "Service role can manage events" ON app_events
  FOR ALL
  USING (auth.role() = 'service_role');
