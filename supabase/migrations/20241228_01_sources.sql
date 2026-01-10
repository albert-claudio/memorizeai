-- Migration: Create sources table
-- Description: Track PDF uploads and processing status

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'na_fila',
  progress INTEGER DEFAULT 0,
  total_pages INTEGER,
  error_message TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  
  CONSTRAINT valid_status CHECK (status IN ('na_fila', 'processando', 'concluido', 'erro'))
);

-- Index for querying user's sources
CREATE INDEX IF NOT EXISTS idx_sources_user_id ON sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);

-- RLS Policies
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sources
CREATE POLICY "Users can view own sources" ON sources
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own sources
CREATE POLICY "Users can insert own sources" ON sources
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own sources
CREATE POLICY "Users can update own sources" ON sources
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can do anything (for Edge Functions)
CREATE POLICY "Service role full access" ON sources
  FOR ALL USING (auth.role() = 'service_role');
