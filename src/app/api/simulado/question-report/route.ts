import { NextRequest, NextResponse } from 'next/server';
import { isAuthSuccess, requireAuthAndOwnership } from '@/lib/auth/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { isSafeEntityId } from '@/lib/security/input-validation';
import { applyCustomRateLimit, getRateLimitError } from '@/lib/security/rate-limiter';
import { internalServerErrorResponse } from '@/lib/security/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_REASONS = new Set([
  'gabarito_errado',
  'enunciado_confuso',
  'alternativa_problematica',
  'fora_da_fonte',
  'estilo_estranho',
  'outro',
]);

const VALID_CONTEXTS = new Set(['during_simulado', 'result_review']);
const VALID_ANSWERS = new Set(['A', 'B', 'C', 'D', 'E']);
const MAX_NOTE_LENGTH = 600;
const REPORT_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 10 * 60_000,
  windowLabel: '10 m' as const,
};

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (body === 'invalid_json') {
      return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
    }

    const simuladoId = typeof body?.simuladoId === 'string' ? body.simuladoId : '';
    const questaoId = typeof body?.questaoId === 'string' ? body.questaoId : '';
    const reason = typeof body?.reason === 'string' ? body.reason : '';
    const context = typeof body?.context === 'string' ? body.context : 'during_simulado';
    const noteValidation = validateNote(body?.note);
    const selectedAnswer = normalizeAnswer(body?.selectedAnswer);

    if (!isSafeEntityId(simuladoId) || !isSafeEntityId(questaoId)) {
      return NextResponse.json({ error: 'Identificador invalido' }, { status: 400 });
    }

    if (!VALID_REASONS.has(reason)) {
      return NextResponse.json({ error: 'Motivo invalido' }, { status: 400 });
    }

    if (!VALID_CONTEXTS.has(context)) {
      return NextResponse.json({ error: 'Contexto invalido' }, { status: 400 });
    }

    if (noteValidation.error) {
      return NextResponse.json({ error: noteValidation.error }, { status: 400 });
    }

    if (body?.selectedAnswer != null && !selectedAnswer) {
      return NextResponse.json({ error: 'Resposta selecionada invalida' }, { status: 400 });
    }

    const authResult = await requireAuthAndOwnership(simuladoId, 'simulados', request);
    if (!isAuthSuccess(authResult)) return authResult;

    const rateLimitResult = await applyCustomRateLimit({
      prefix: 'simulado:question-report',
      identifier: `user:${authResult.user.id}`,
      ...REPORT_RATE_LIMIT,
    });
    if (!rateLimitResult.success) {
      const { error, retryAfter } = getRateLimitError(rateLimitResult.reset);
      return NextResponse.json(
        { error, retryAfter },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.reset.toString(),
            'X-RateLimit-Mode': rateLimitResult.mode,
            'Retry-After': retryAfter.toString(),
          },
        },
      );
    }

    const supabase = await createClient();
    const { data: question, error: questionError } = await supabase
      .from('simulado_questoes')
      .select('id, simulado_id, resposta_correta')
      .eq('id', questaoId)
      .eq('simulado_id', simuladoId)
      .single();

    if (questionError || !question) {
      return NextResponse.json({ error: 'Questao nao encontrada neste simulado' }, { status: 404 });
    }

    const correctAnswer = normalizeAnswer(question.resposta_correta);

    const { data: report, error: insertError } = await supabase
      .from('simulado_question_reports')
      .upsert(
        {
          user_id: authResult.user.id,
          simulado_id: simuladoId,
          questao_id: questaoId,
          reason,
          note: noteValidation.value,
          context,
          selected_answer: selectedAnswer,
          correct_answer: correctAnswer,
          updated_at: Date.now(),
        },
        { onConflict: 'user_id,questao_id,reason' },
      )
      .select('id, created_at, updated_at')
      .single();

    if (insertError) {
      console.error('[question-report] insert failed:', insertError);
      return internalServerErrorResponse();
    }

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error('[question-report] unexpected error:', error);
    return internalServerErrorResponse();
  }
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown> | null | 'invalid_json'> {
  const raw = await request.text();
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return 'invalid_json';
  }
}

function validateNote(value: unknown): { value: string | null; error?: string } {
  if (value == null) return { value: null };
  if (typeof value !== 'string') return { value: null, error: 'Observacao invalida' };
  if (value.length > MAX_NOTE_LENGTH) {
    return { value: null, error: `Observacao deve ter no maximo ${MAX_NOTE_LENGTH} caracteres` };
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  return { value: normalized || null };
}

function normalizeAnswer(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const answer = value.trim().toUpperCase();
  return VALID_ANSWERS.has(answer) ? answer : null;
}
