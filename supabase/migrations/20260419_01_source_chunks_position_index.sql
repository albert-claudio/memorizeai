-- Improves the hot path used by run processing:
-- source_chunks filtered by source_id and ordered by position.
CREATE INDEX IF NOT EXISTS idx_source_chunks_source_position
ON public.source_chunks USING btree (source_id, position);
