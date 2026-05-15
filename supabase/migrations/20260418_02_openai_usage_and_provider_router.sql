-- ============================================================================
-- OpenAI migration foundation:
-- - adds per-run provider and usage/cost telemetry
-- - allows explicit openai preference where needed
-- ============================================================================

ALTER TABLE runs ADD COLUMN IF NOT EXISTS provider text NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS input_tokens bigint NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS output_tokens bigint NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS cached_tokens bigint NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(12,6) NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS source_digest_version text NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS raw_usage jsonb NULL;

COMMENT ON COLUMN runs.provider IS 'Primary AI provider selected for the generation path of this run.';
COMMENT ON COLUMN runs.input_tokens IS 'Aggregated input tokens for this run when the provider exposes the metric.';
COMMENT ON COLUMN runs.output_tokens IS 'Aggregated output tokens for this run when the provider exposes the metric.';
COMMENT ON COLUMN runs.cached_tokens IS 'Aggregated cached input tokens for this run when the provider exposes the metric.';
COMMENT ON COLUMN runs.estimated_cost_usd IS 'Estimated run cost in USD when pricing is known for all AI calls in the run.';
COMMENT ON COLUMN runs.source_digest_version IS 'Digest version used as primary context, when digest-first generation is enabled.';
COMMENT ON COLUMN runs.raw_usage IS 'Optional raw provider usage payloads captured during AI calls.';

ALTER TABLE runs DROP CONSTRAINT IF EXISTS valid_model;
ALTER TABLE runs
  ADD CONSTRAINT valid_model
  CHECK ((model_preference = ANY (ARRAY['groq'::text, 'gemini'::text, 'openai'::text, 'auto'::text])));
