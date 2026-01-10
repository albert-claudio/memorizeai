-- ============================================================================
-- SIMULADO SYSTEM - Exam Simulator
-- ============================================================================

-- Simulados (one per run with objective='questoes_banca')
CREATE TABLE IF NOT EXISTS simulados (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES runs(id),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  source_id TEXT REFERENCES sources(id),
  titulo TEXT NOT NULL,
  total_questoes INT NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pendente', -- pendente, em_andamento, concluido
  acertos INT,
  erros INT,
  tempo_total_segundos INT,
  iniciado_em BIGINT,
  finalizado_em BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT,
  deleted_at BIGINT
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_simulados_user_id ON simulados(user_id);
CREATE INDEX IF NOT EXISTS idx_simulados_status ON simulados(status);

-- Questões do simulado
CREATE TABLE IF NOT EXISTS simulado_questoes (
  id TEXT PRIMARY KEY,
  simulado_id TEXT REFERENCES simulados(id) ON DELETE CASCADE,
  numero INT NOT NULL, -- 1, 2, 3...
  enunciado TEXT NOT NULL,
  alternativa_a TEXT NOT NULL,
  alternativa_b TEXT NOT NULL,
  alternativa_c TEXT NOT NULL,
  alternativa_d TEXT NOT NULL,
  alternativa_e TEXT NOT NULL,
  resposta_correta TEXT NOT NULL, -- 'A', 'B', 'C', 'D', 'E'
  comentario TEXT,
  chunk_id TEXT,
  citation_excerpt TEXT,
  created_at BIGINT NOT NULL
);

-- Index for simulado queries
CREATE INDEX IF NOT EXISTS idx_simulado_questoes_simulado_id ON simulado_questoes(simulado_id);

-- Respostas do usuário
CREATE TABLE IF NOT EXISTS simulado_respostas (
  id TEXT PRIMARY KEY,
  simulado_id TEXT REFERENCES simulados(id) ON DELETE CASCADE,
  questao_id TEXT REFERENCES simulado_questoes(id) ON DELETE CASCADE,
  resposta_usuario TEXT, -- 'A', 'B', 'C', 'D', 'E' or NULL if not answered
  correta BOOLEAN,
  tempo_segundos INT,
  respondido_em BIGINT,
  created_at BIGINT NOT NULL
);

-- Index for response queries
CREATE INDEX IF NOT EXISTS idx_simulado_respostas_simulado_id ON simulado_respostas(simulado_id);
CREATE INDEX IF NOT EXISTS idx_simulado_respostas_questao_id ON simulado_respostas(questao_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE simulados ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulado_questoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulado_respostas ENABLE ROW LEVEL SECURITY;

-- Simulados: user can only see their own
CREATE POLICY "Users can view own simulados"
  ON simulados FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own simulados"
  ON simulados FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own simulados"
  ON simulados FOR UPDATE
  USING (auth.uid() = user_id);

-- Questoes: user can see questions of their simulados
CREATE POLICY "Users can view questions of own simulados"
  ON simulado_questoes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM simulados s 
      WHERE s.id = simulado_questoes.simulado_id 
      AND s.user_id = auth.uid()
    )
  );

-- Respostas: user can manage their own responses
CREATE POLICY "Users can view own responses"
  ON simulado_respostas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM simulados s 
      WHERE s.id = simulado_respostas.simulado_id 
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own responses"
  ON simulado_respostas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM simulados s 
      WHERE s.id = simulado_respostas.simulado_id 
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own responses"
  ON simulado_respostas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM simulados s 
      WHERE s.id = simulado_respostas.simulado_id 
      AND s.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Service role policies for backend operations
-- ============================================================================

CREATE POLICY "Service role can manage all simulados"
  ON simulados FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can manage all questoes"
  ON simulado_questoes FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can manage all respostas"
  ON simulado_respostas FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');
