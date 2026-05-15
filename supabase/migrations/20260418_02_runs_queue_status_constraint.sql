-- ============================================================================
-- Fase 1: Update runs.status constraint for queue-based processing
-- Allows queued / retry_wait states introduced by the dispatcher architecture.
-- ============================================================================

ALTER TABLE runs DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE runs
  ADD CONSTRAINT valid_status
  CHECK (
    status IN (
      'pendente',
      'queued',
      'retry_wait',
      'processando',
      'concluido',
      'erro',
      'base_insuficiente'
    )
  ) NOT VALID;

ALTER TABLE runs VALIDATE CONSTRAINT valid_status;
