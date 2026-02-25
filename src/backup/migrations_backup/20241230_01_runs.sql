-- Migration: Create runs table for AI generation orchestration
-- Description: Track each content generation run with status, model used, and results

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  deck_id TEXT REFERENCES decks(id) ON DELETE SET NULL,
  
  -- Configuração
  objective TEXT NOT NULL,
  model_preference TEXT NOT NULL DEFAULT 'auto',
  target_count INTEGER DEFAULT 10,
  
  -- Execução
  status TEXT NOT NULL DEFAULT 'pendente',
  model_used TEXT,
  attempt_count INTEGER DEFAULT 0,
  
  -- Resultado
  items_generated INTEGER DEFAULT 0,
  error_message TEXT,
  
  -- Timestamps
  started_at BIGINT,
  completed_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  
  CONSTRAINT valid_objective CHECK (objective IN ('flashcards', 'questoes_banca', 'logica_juridica')),
  CONSTRAINT valid_status CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
  CONSTRAINT valid_model CHECK (model_preference IN ('groq', 'gemini', 'auto'))
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_runs_user_id ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_source_id ON runs(source_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);

-- RLS Policies
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

-- Users can view their own runs
CREATE POLICY "Users can view own runs" ON runs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own runs
CREATE POLICY "Users can insert own runs" ON runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own runs (for cancellation)
CREATE POLICY "Users can update own runs" ON runs
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can do anything (for Edge Functions)
CREATE POLICY "Service role full access runs" ON runs
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- REALTIME TRIGGER
-- Notify when run status changes
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_run_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM pg_notify(
      'run_status_changed',
      json_build_object(
        'run_id', NEW.id,
        'user_id', NEW.user_id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'items_generated', NEW.items_generated
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_run_status_change ON runs;
CREATE TRIGGER on_run_status_change
  AFTER UPDATE ON runs
  FOR EACH ROW
  EXECUTE FUNCTION notify_run_status_change();
