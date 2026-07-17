import type { SupabaseClient } from '@supabase/supabase-js';
import type { GeneratedQuestion, ProcessLogger } from '../contracts';
import { sanitizeAlternatives, sanitizeText } from '../validation/sanitization';

interface SaveSimuladoInput {
  supabase: SupabaseClient;
  runId: string;
  userId: string;
  sourceId: string;
  sourceFilename: string;
  items: unknown[];
  log: ProcessLogger;
}

export async function saveSimulado(input: SaveSimuladoInput): Promise<number> {
  const { supabase, runId, userId, sourceId, sourceFilename, items, log } = input;
  const now = Date.now();
  const simuladoId = crypto.randomUUID();
  const { error: simuladoError } = await supabase.from('simulados').insert({
    id: simuladoId,
    run_id: runId,
    user_id: userId,
    source_id: sourceId,
    titulo: `Simulado - ${sourceFilename}`,
    total_questoes: items.length,
    status: 'pendente',
    created_at: now,
    updated_at: now,
  });
  if (simuladoError) throw new Error('Failed to create simulado');

  const questions: Record<string, unknown>[] = [];
  const answers: Record<string, unknown>[] = [];
  for (const item of items) {
    const question = item as GeneratedQuestion;
    if (!question.chunkId) continue;

    let enunciado = '';
    let alternatives = ['', '', '', '', ''];
    let correctAnswer = 'A';
    let comment = '';
    if (question.assertiva && question.gabarito) {
      enunciado = sanitizeText(question.assertiva);
      alternatives = ['Certo', 'Errado', '', '', ''];
      correctAnswer = question.gabarito === 'C' ? 'A' : 'B';
      comment = sanitizeText(question.comentario || '');
    } else if (question.enunciado && question.alternativas) {
      enunciado = sanitizeText(question.enunciado);
      alternatives = sanitizeAlternatives(question.alternativas);
      correctAnswer = question.respostaCorreta || 'A';
      comment = sanitizeText(question.comentario || '');
    } else if (question.statement && question.options) {
      enunciado = sanitizeText(question.statement);
      alternatives = sanitizeAlternatives(question.options);
      correctAnswer = question.correctAnswer || 'A';
      comment = sanitizeText(question.explanation || '');
    }
    if (enunciado.length < 20) continue;

    const questionId = crypto.randomUUID();
    const additionalSources = question.sources?.filter(source => source.chunkId !== question.chunkId) ?? [];
    questions.push({
      id: questionId,
      simulado_id: simuladoId,
      numero: questions.length + 1,
      enunciado,
      alternativa_a: alternatives[0] || '',
      alternativa_b: alternatives[1] || '',
      alternativa_c: alternatives[2] || '',
      alternativa_d: alternatives[3] || '',
      alternativa_e: alternatives[4] || '',
      resposta_correta: correctAnswer,
      comentario: comment,
      chunk_id: question.chunkId,
      citation_excerpt: question.citationExcerpt || '',
      extra_sources: additionalSources.length > 0 ? additionalSources : null,
      created_at: now,
    });
    answers.push({
      id: crypto.randomUUID(),
      simulado_id: simuladoId,
      questao_id: questionId,
      resposta_usuario: null,
      correta: null,
      created_at: now,
    });
  }

  let savedCount = 0;
  if (questions.length > 0) {
    const { error: questionError } = await supabase.from('simulado_questoes').insert(questions);
    if (!questionError) {
      const { error: answerError } = await supabase.from('simulado_respostas').insert(answers);
      if (!answerError) savedCount = questions.length;
    }
  }
  await supabase.from('simulados').update({ total_questoes: savedCount, updated_at: Date.now() }).eq('id', simuladoId);
  await supabase.from('runs').update({ simulado_id: simuladoId, updated_at: Date.now() }).eq('id', runId);
  log('Simulado', `Saved ${savedCount}/${items.length} questions to simulado`);
  return savedCount;
}
