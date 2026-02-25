-- ============================================================================
-- Status normalization + run_slo alignment
-- ============================================================================
-- Keep app/database status labels consistent:
-- sources: na_fila, processando, concluido, erro
-- runs:    pendente, processando, concluido, erro

-- Normalize legacy English status labels if any historical rows still exist.
UPDATE public.sources SET status = 'processando' WHERE status = 'processing';
UPDATE public.sources SET status = 'concluido'  WHERE status = 'ready';
UPDATE public.sources SET status = 'erro'       WHERE status = 'failed';

UPDATE public.runs SET status = 'concluido' WHERE status = 'completed';
UPDATE public.runs SET status = 'erro'      WHERE status = 'failed';

-- Recreate SLO view using current status labels.
CREATE OR REPLACE VIEW public.run_slo AS
SELECT
  date_trunc('day', to_timestamp(created_at / 1000.0))         AS day,
  count(*)                                                      AS total_runs,
  count(*) FILTER (WHERE status = 'concluido')                 AS completed_runs,
  count(*) FILTER (WHERE status = 'erro')                      AS failed_runs,
  ROUND(
    count(*) FILTER (WHERE status = 'concluido') * 100.0
    / NULLIF(count(*), 0),
    2
  )                                                             AS success_rate_pct,
  ROUND(
    percentile_cont(0.95) WITHIN GROUP (
      ORDER BY COALESCE(
        processing_time_ms,
        CASE
          WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
            THEN GREATEST(completed_at - started_at, 0)
          ELSE NULL
        END
      )
    )::numeric,
    0
  )                                                             AS p95_processing_ms,
  ROUND(AVG(token_count)::numeric, 0)                           AS avg_token_count
FROM public.runs
WHERE created_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.run_slo IS
  'Daily SLO metrics: success rate (concluido), p95 processing time, average token usage per run.';
