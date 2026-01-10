-- Migration: Create source_chunks pivot table
-- Description: Many-to-many relationship between sources and chunks

CREATE TABLE IF NOT EXISTS source_chunks (
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  
  PRIMARY KEY (source_id, chunk_id)
);

-- Index for querying chunks by source
CREATE INDEX IF NOT EXISTS idx_source_chunks_source ON source_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_source_chunks_chunk ON source_chunks(chunk_id);

-- RLS Policies
ALTER TABLE source_chunks ENABLE ROW LEVEL SECURITY;

-- Users can view source_chunks for their own sources
CREATE POLICY "Users can view own source_chunks" ON source_chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sources 
      WHERE sources.id = source_chunks.source_id 
      AND sources.user_id = auth.uid()
    )
  );

-- Service role can do anything
CREATE POLICY "Service role full access source_chunks" ON source_chunks
  FOR ALL USING (auth.role() = 'service_role');
