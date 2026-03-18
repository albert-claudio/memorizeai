-- Add multi-source support per question for alta-fidelidade pipeline
-- Stores additional source references beyond the primary chunk_id/citation_excerpt

ALTER TABLE simulado_questoes ADD COLUMN IF NOT EXISTS extra_sources JSONB DEFAULT NULL;

-- Format: [{"chunkId": "...", "citationExcerpt": "..."}]
COMMENT ON COLUMN simulado_questoes.extra_sources IS 'Additional source chunks beyond the primary chunk_id/citation_excerpt. Array of {chunkId, citationExcerpt} objects.';
