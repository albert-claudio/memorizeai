-- Add quality metrics tracking per run for alta-fidelidade measurement
-- Stores structured review outcomes from the AI reviewer phase

ALTER TABLE runs ADD COLUMN IF NOT EXISTS quality_metrics JSONB DEFAULT NULL;

-- Format: {
--   "total_geradas": 15,
--   "total_aprovadas": 10,
--   "taxa_reprovacao": 0.33,
--   "motivos_reprovacao": ["correta escancarada", "sem ancoragem"],
--   "review_skipped": false,
--   "base_qualidade": "forte",
--   "dificuldade_efetiva": "dificil"
-- }
COMMENT ON COLUMN runs.quality_metrics IS 'Structured quality metrics from the AI reviewer phase. JSON object with rejection rates, reasons, and base diagnosis.';
