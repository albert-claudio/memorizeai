-- ============================================================================
-- WEBHOOK LOGS TABLE
-- ============================================================================
-- Stores audit logs for all webhook attempts (security monitoring)

CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Request info
  ip_address TEXT NOT NULL,
  event_id TEXT,
  event_type TEXT,
  
  -- Result
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  
  -- Security checks
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  timestamp_valid BOOLEAN NOT NULL DEFAULT false,
  
  -- Performance
  processing_time_ms INTEGER,
  
  -- Timestamps (using bigint for JS Date.now() compatibility)
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Index for querying by IP (for security analysis)
CREATE INDEX IF NOT EXISTS idx_webhook_logs_ip_address ON webhook_logs(ip_address);

-- Index for querying recent logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- Index for failed attempts analysis
CREATE INDEX IF NOT EXISTS idx_webhook_logs_success ON webhook_logs(success) WHERE success = false;

-- ============================================================================
-- CLEANUP POLICY
-- ============================================================================
-- Keep logs for 90 days, then auto-delete

-- Create function to clean old logs
CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM webhook_logs
  WHERE created_at < (EXTRACT(EPOCH FROM NOW()) * 1000 - 90 * 24 * 60 * 60 * 1000)::BIGINT;
END;
$$ LANGUAGE plpgsql;

-- Comment explaining the table purpose
COMMENT ON TABLE webhook_logs IS 'Audit logs for Stripe webhook attempts. Used for security monitoring and brute force detection.';
