-- Add banca and dificuldade columns to runs table
-- for high-fidelity question generation per exam board

ALTER TABLE runs ADD COLUMN IF NOT EXISTS banca TEXT DEFAULT NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS dificuldade TEXT DEFAULT NULL;

-- CHECK constraints to prevent dirty data
ALTER TABLE runs ADD CONSTRAINT runs_banca_check
  CHECK (banca IS NULL OR banca IN ('FCC', 'FGV', 'CESPE'));

ALTER TABLE runs ADD CONSTRAINT runs_dificuldade_check
  CHECK (dificuldade IS NULL OR dificuldade IN ('facil', 'medio', 'dificil', 'muito_dificil'));

-- Add base_insuficiente to the runs status CHECK constraint
ALTER TABLE runs DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE runs ADD CONSTRAINT valid_status
  CHECK (status IN ('pendente', 'processando', 'concluido', 'erro', 'base_insuficiente'));
