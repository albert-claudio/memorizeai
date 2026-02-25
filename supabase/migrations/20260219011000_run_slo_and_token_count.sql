-- ============================================================================
-- SLO View: run_slo
-- Measures daily generation success rate and p95 processing time.
-- Query this view in Supabase to monitor SLOs without a third-party APM.
-- ============================================================================

CREATE OR REPLACE VIEW run_slo AS
SELECT
  date_trunc('day', to_timestamp(created_at / 1000.0)) AS day,
  count(*)                                               AS total_runs,
  count(*) FILTER (WHERE status = 'completed')           AS completed_runs,
  count(*) FILTER (WHERE status = 'failed')              AS failed_runs,
  ROUND(
    count(*) FILTER (WHERE status = 'completed') * 100.0
    / NULLIF(count(*), 0),
    2
  )                                                      AS success_rate_pct,
  ROUND(
    percentile_cont(0.95)
      WITHIN GROUP (ORDER BY processing_time_ms)::numeric,
    0
  )                                                      AS p95_processing_ms,
  ROUND(AVG(token_count)::numeric, 0)                    AS avg_token_count
FROM runs
WHERE created_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW run_slo IS
  'Daily SLO metrics: success rate, p95 processing time, average token usage per run.';

-- ============================================================================
-- Add token_count column to runs if not already present
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'runs' AND column_name = 'token_count'
  ) THEN
    ALTER TABLE runs ADD COLUMN token_count integer DEFAULT 0;
    COMMENT ON COLUMN runs.token_count IS 'Total tokens consumed by the AI call for this run.';
  END IF;
END $$;
