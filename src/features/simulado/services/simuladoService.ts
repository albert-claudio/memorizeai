
import { createClient } from '@/lib/supabase/client';

export interface Questao {
  id: string;
  numero: number;
  enunciado: string;
  alternativa_a: string;
  alternativa_b: string;
  alternativa_c: string;
  alternativa_d: string;
  alternativa_e: string;
  resposta_correta: string;
  comentario: string;
}

export interface Resposta {
  id: string;
  questao_id: string;
  resposta_usuario: string | null;
}

export interface Simulado {
  id: string;
  titulo: string;
  total_questoes: number;
  status: string;
  iniciado_em: number | null;
  finalizado_em: number | null;
  acertos: number;
  erros: number;
}

/**
 * DTO for the joined response from simulado_respostas + simulado_questoes.
 * Shared contract between service and hooks — single source of truth.
 *
 * - correta: null = not answered yet (real semantic, not a missing value)
 * - respondido_em: BIGINT ms in DB, so number | null here
 * - questao: Questao | null defensively (Supabase left join edge cases)
 */
export interface RespostaComQuestaoDTO {
  id: string;
  simulado_id: string;
  questao_id: string;
  resposta_usuario: string | null;
  correta: boolean | null;
  respondido_em: number | null;
  questao: Questao | null;
}

/** Post-filter type: questao is guaranteed non-null after service filtering */
export type ValidatedRespostaComQuestao = Omit<RespostaComQuestaoDTO, 'questao'> & { questao: Questao };

export const simuladoService = {
  async getSimulado(simuladoId: string, userId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('simulados')
      .select('*')
      .eq('id', simuladoId)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data as Simulado;
  },

  async getQuestoes(simuladoId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('simulado_questoes')
      .select('*')
      .eq('simulado_id', simuladoId)
      .order('numero', { ascending: true });

    if (error) throw error;
    return data as Questao[];
  },

  async getRespostas(simuladoId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('simulado_respostas')
      .select('*')
      .eq('simulado_id', simuladoId);

    if (error) throw error;
    return data as Resposta[];
  },

  async startSimulado(simuladoId: string) {
    const supabase = createClient();
    await supabase
      .from('simulados')
      .update({ status: 'em_andamento', iniciado_em: Date.now() })
      .eq('id', simuladoId);
  },

  async submitAnswer(simuladoId: string, questionId: string, alternative: string) {
    const supabase = createClient();
    await supabase
      .from('simulado_respostas')
      .update({ 
        resposta_usuario: alternative,
        respondido_em: Date.now()
      })
      .eq('simulado_id', simuladoId)
      .eq('questao_id', questionId);
  },

  async finishSimulado(simuladoId: string, acertos: number, erros: number, respostas: Map<string, string | null>, questoes: Questao[]) {
    const supabase = createClient();

    // Build batch payload for all answered questions — one round-trip instead of N.
    const respostasRows = questoes
      .filter(q => respostas.get(q.id))
      .map(q => ({
        simulado_id: simuladoId,
        questao_id: q.id,
        correta: respostas.get(q.id) === q.resposta_correta,
      }));

    if (respostasRows.length > 0) {
      await supabase
        .from('simulado_respostas')
        .upsert(respostasRows, { onConflict: 'simulado_id,questao_id' });
    }

    // Update simulado status
    await supabase
      .from('simulados')
      .update({
        status: 'concluido',
        acertos,
        erros,
        finalizado_em: Date.now(),
        updated_at: Date.now(),
      })
      .eq('id', simuladoId);
  },

  async getRespostasComQuestoes(simuladoId: string): Promise<ValidatedRespostaComQuestao[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('simulado_respostas')
      .select(`
        *,
        questao:simulado_questoes(*)
      `)
      .eq('simulado_id', simuladoId)
      .order('questao(numero)', { ascending: true });

    if (error) throw error;
    
    // Filter out rows where the join failed (questao is null)
    // After this filter, questao is guaranteed non-null
    return (data as RespostaComQuestaoDTO[]).filter(
      (r): r is ValidatedRespostaComQuestao => r.questao !== null
    );
  }
};
