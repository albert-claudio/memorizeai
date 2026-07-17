-- Continuous user feedback for generated simulado questions.
-- Turns real usage into a lightweight quality signal for banca/OAB calibration.

CREATE TABLE IF NOT EXISTS simulado_question_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  simulado_id TEXT NOT NULL REFERENCES simulados(id) ON DELETE CASCADE,
  questao_id TEXT NOT NULL REFERENCES simulado_questoes(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN (
    'gabarito_errado',
    'enunciado_confuso',
    'alternativa_problematica',
    'fora_da_fonte',
    'estilo_estranho',
    'outro'
  )),
  note TEXT,
  context TEXT NOT NULL DEFAULT 'during_simulado' CHECK (context IN ('during_simulado', 'result_review')),
  selected_answer TEXT CHECK (selected_answer IS NULL OR selected_answer IN ('A', 'B', 'C', 'D', 'E')),
  correct_answer TEXT CHECK (correct_answer IS NULL OR correct_answer IN ('A', 'B', 'C', 'D', 'E')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'ignored', 'fixed')),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  UNIQUE (user_id, questao_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_simulado_question_reports_question
  ON simulado_question_reports (questao_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_simulado_question_reports_simulado
  ON simulado_question_reports (simulado_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_simulado_question_reports_status
  ON simulado_question_reports (status, created_at DESC);

ALTER TABLE simulado_question_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own simulado question reports" ON simulado_question_reports;
CREATE POLICY "Users can insert their own simulado question reports"
  ON simulado_question_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own simulado question reports" ON simulado_question_reports;
CREATE POLICY "Users can view their own simulado question reports"
  ON simulado_question_reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own simulado question reports" ON simulado_question_reports;
CREATE POLICY "Users can update their own simulado question reports"
  ON simulado_question_reports
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all simulado question reports" ON simulado_question_reports;
CREATE POLICY "Service role can manage all simulado question reports"
  ON simulado_question_reports
  FOR ALL
  TO service_role
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

GRANT SELECT, INSERT, UPDATE ON TABLE simulado_question_reports TO authenticated;
GRANT ALL ON TABLE simulado_question_reports TO service_role;

COMMENT ON TABLE simulado_question_reports IS 'User-submitted reports for wrong, confusing, ungrounded, or strange simulado questions.';
