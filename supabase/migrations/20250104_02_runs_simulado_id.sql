-- ============================================================================
-- Add simulado_id column to runs table
-- ============================================================================

-- Add simulado_id column to runs table (nullable reference to simulados)
ALTER TABLE runs ADD COLUMN IF NOT EXISTS simulado_id TEXT;

-- Add foreign key constraint (optional, can be null)
-- Note: Not adding FK because simulados table might be on same or different schema
-- and we want flexibility

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_runs_simulado_id ON runs(simulado_id);
