-- ============================================================================
-- Fase 1: Queue columns for runs table
-- Adds fields to support queue-based processing, leasing, and error tracking.
-- ============================================================================

-- Queue / scheduling
ALTER TABLE runs ADD COLUMN IF NOT EXISTS next_attempt_at bigint NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS lease_expires_at bigint NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS processing_node text NULL;

-- Error tracking (classified)
ALTER TABLE runs ADD COLUMN IF NOT EXISTS last_error_code text NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS last_error_provider text NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS last_error_at bigint NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS provider_attempt_count int NOT NULL DEFAULT 0;

-- Token count (may already exist from migration 20260219011000)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'runs' AND column_name = 'token_count'
  ) THEN
    ALTER TABLE runs ADD COLUMN token_count bigint NULL;
    COMMENT ON COLUMN runs.token_count IS 'Total tokens consumed by AI calls for this run.';
  END IF;
END $$;

-- ============================================================================
-- Indices for dispatcher performance
-- ============================================================================

-- Dispatcher query: status IN ('queued','retry_wait') AND next_attempt_at <= now
CREATE INDEX IF NOT EXISTS idx_runs_queue_dispatch
ON runs (status, next_attempt_at, created_at)
WHERE deleted_at IS NULL;

-- Lease expiry recovery: status = 'processando' AND lease_expires_at < now
CREATE INDEX IF NOT EXISTS idx_runs_lease_expiry
ON runs (status, lease_expires_at)
WHERE deleted_at IS NULL;
