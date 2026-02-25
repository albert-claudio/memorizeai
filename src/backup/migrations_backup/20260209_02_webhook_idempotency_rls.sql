-- Migration: Persistent webhook idempotency + RLS
-- Description: Add unique constraint for idempotency and RLS to webhook_logs

-- 1. Add unique constraint on event_id for idempotency
-- This ensures we can atomically check-and-insert to prevent duplicate processing
ALTER TABLE webhook_logs 
  ADD CONSTRAINT webhook_logs_event_id_unique 
  UNIQUE (event_id);

-- 2. Enable Row Level Security
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- 3. Only service role can access webhook_logs (internal admin table)
-- Regular users should never query this table directly
CREATE POLICY "Service role full access webhook_logs" ON webhook_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Comment explaining the security model
COMMENT ON TABLE webhook_logs IS 'Audit logs for Stripe webhook attempts. Protected by RLS - only service role can access. Event_id is unique for idempotency.';
