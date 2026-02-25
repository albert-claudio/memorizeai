-- Migration: Create chunks table
-- Description: Store unique text chunks with hash-based deduplication

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  content_hash TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  char_start INTEGER,
  char_end INTEGER,
  created_at BIGINT NOT NULL
);

-- Index for fast hash lookups (deduplication)
CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(content_hash);

-- RLS Policies
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read chunks (they are shared across sources)
CREATE POLICY "Authenticated users can view chunks" ON chunks
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role can insert/update chunks (via Edge Functions)
CREATE POLICY "Service role can insert chunks" ON chunks
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update chunks" ON chunks
  FOR UPDATE USING (auth.role() = 'service_role');
