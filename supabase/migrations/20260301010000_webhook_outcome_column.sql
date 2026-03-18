-- Migration: Add outcome tracking to webhook_logs
-- Replaces the binary success/fail model with a 4-state outcome:
--   applied | ignored | transient_failure | permanent_failure

ALTER TABLE webhook_logs
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS outcome_reason TEXT;

-- Backfill existing rows
UPDATE webhook_logs SET outcome = 'applied' WHERE success = true AND outcome IS NULL;
UPDATE webhook_logs SET outcome = 'transient_failure' WHERE success = false AND outcome IS NULL;

-- Index for monitoring permanent failures that need manual review
CREATE INDEX IF NOT EXISTS idx_webhook_logs_permanent_failure
  ON webhook_logs(outcome, created_at DESC)
  WHERE outcome = 'permanent_failure';

COMMENT ON COLUMN webhook_logs.outcome IS 'Event processing result: applied, ignored, transient_failure, permanent_failure';
COMMENT ON COLUMN webhook_logs.outcome_reason IS 'Human-readable reason for the outcome, especially for failures';
