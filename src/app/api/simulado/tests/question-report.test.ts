import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const authResult = {
  user: { id: 'user_1' },
  isPro: false,
};

const requireAuthAndOwnershipMock = vi.fn();
const applyCustomRateLimitMock = vi.fn();
const createClientMock = vi.fn();

vi.mock('@/lib/auth/auth-guard', () => ({
  requireAuthAndOwnership: requireAuthAndOwnershipMock,
  isAuthSuccess: (result: unknown) => !(result instanceof NextResponse),
}));

vi.mock('@/lib/security/rate-limiter', () => ({
  applyCustomRateLimit: applyCustomRateLimitMock,
  getRateLimitError: (reset: number) => ({
    error: 'Muitas requisicoes. Tente novamente mais tarde.',
    retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}));

function request(body: unknown) {
  return new NextRequest('https://vimens.app/api/simulado/question-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string) {
  return new NextRequest('https://vimens.app/api/simulado/question-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

function makeSupabase({ question = 'found' }: { question?: 'found' | 'missing' } = {}) {
  const questionBuilder = {
    select: vi.fn(() => questionBuilder),
    eq: vi.fn(() => questionBuilder),
    single: vi.fn(async () => question === 'found'
      ? {
          data: {
            id: 'questao_1',
            simulado_id: 'simulado_1',
            resposta_correta: 'C',
          },
          error: null,
        }
      : { data: null, error: { code: 'PGRST116' } }),
  };

  const reportBuilder = {
    upsert: vi.fn(() => reportBuilder),
    select: vi.fn(() => reportBuilder),
    single: vi.fn(async () => ({
      data: { id: 'report_1', created_at: 1, updated_at: 2 },
      error: null,
    })),
  };

  return {
    questionBuilder,
    reportBuilder,
    client: {
      from: vi.fn((table: string) => {
        if (table === 'simulado_questoes') return questionBuilder;
        if (table === 'simulado_question_reports') return reportBuilder;
        throw new Error(`Unexpected table ${table}`);
      }),
    },
  };
}

describe('POST /api/simulado/question-report', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid identifiers before auth and database access', async () => {
    const { POST } = await import('@/app/api/simulado/question-report/route');
    const response = await POST(request({
      simuladoId: '../bad',
      questaoId: 'questao_1',
      reason: 'estilo_estranho',
    }));

    expect(response.status).toBe(400);
    expect(requireAuthAndOwnershipMock).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON before auth and database access', async () => {
    const { POST } = await import('@/app/api/simulado/question-report/route');
    const response = await POST(rawRequest('{'));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('JSON invalido');
    expect(requireAuthAndOwnershipMock).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects unknown report reasons', async () => {
    const { POST } = await import('@/app/api/simulado/question-report/route');
    const response = await POST(request({
      simuladoId: 'simulado_1',
      questaoId: 'questao_1',
      reason: 'motivo_novo_sem_migration',
    }));

    expect(response.status).toBe(400);
    expect(requireAuthAndOwnershipMock).not.toHaveBeenCalled();
  });

  it('rejects invalid selected answers and oversized notes before auth', async () => {
    const { POST } = await import('@/app/api/simulado/question-report/route');
    const invalidAnswerResponse = await POST(request({
      simuladoId: 'simulado_1',
      questaoId: 'questao_1',
      reason: 'estilo_estranho',
      selectedAnswer: 'Z',
    }));

    const longNoteResponse = await POST(request({
      simuladoId: 'simulado_1',
      questaoId: 'questao_1',
      reason: 'estilo_estranho',
      note: 'a'.repeat(601),
    }));

    expect(invalidAnswerResponse.status).toBe(400);
    expect(longNoteResponse.status).toBe(400);
    expect(requireAuthAndOwnershipMock).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rate-limits reports per authenticated user before database access', async () => {
    requireAuthAndOwnershipMock.mockResolvedValue(authResult);
    applyCustomRateLimitMock.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 30_000,
      mode: 'memory',
    });

    const { POST } = await import('@/app/api/simulado/question-report/route');
    const response = await POST(request({
      simuladoId: 'simulado_1',
      questaoId: 'questao_1',
      reason: 'estilo_estranho',
    }));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toContain('Muitas requisicoes');
    expect(applyCustomRateLimitMock).toHaveBeenCalledWith(expect.objectContaining({
      prefix: 'simulado:question-report',
      identifier: 'user:user_1',
      maxRequests: 10,
      windowMs: 600_000,
    }));
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects reports for questions that do not belong to the owned simulado', async () => {
    requireAuthAndOwnershipMock.mockResolvedValue(authResult);
    applyCustomRateLimitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      mode: 'memory',
    });
    const supabase = makeSupabase({ question: 'missing' });
    createClientMock.mockResolvedValue(supabase.client);

    const { POST } = await import('@/app/api/simulado/question-report/route');
    const response = await POST(request({
      simuladoId: 'simulado_1',
      questaoId: 'questao_2',
      reason: 'fora_da_fonte',
    }));

    expect(response.status).toBe(404);
    expect(supabase.reportBuilder.upsert).not.toHaveBeenCalled();
  });

  it('upserts a valid report only after ownership and question membership checks', async () => {
    requireAuthAndOwnershipMock.mockResolvedValue(authResult);
    applyCustomRateLimitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      mode: 'memory',
    });
    const supabase = makeSupabase();
    createClientMock.mockResolvedValue(supabase.client);

    const { POST } = await import('@/app/api/simulado/question-report/route');
    const response = await POST(request({
      simuladoId: 'simulado_1',
      questaoId: 'questao_1',
      reason: 'gabarito_errado',
      note: 'A explicacao contradiz a alternativa correta.',
      selectedAnswer: 'B',
      context: 'result_review',
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(requireAuthAndOwnershipMock).toHaveBeenCalledWith('simulado_1', 'simulados', expect.any(NextRequest));
    expect(applyCustomRateLimitMock).toHaveBeenCalledWith(expect.objectContaining({
      prefix: 'simulado:question-report',
      identifier: 'user:user_1',
    }));
    expect(supabase.questionBuilder.eq).toHaveBeenCalledWith('id', 'questao_1');
    expect(supabase.questionBuilder.eq).toHaveBeenCalledWith('simulado_id', 'simulado_1');
    expect(supabase.reportBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user_1',
        simulado_id: 'simulado_1',
        questao_id: 'questao_1',
        reason: 'gabarito_errado',
        note: 'A explicacao contradiz a alternativa correta.',
        context: 'result_review',
        selected_answer: 'B',
        correct_answer: 'C',
      }),
      { onConflict: 'user_id,questao_id,reason' },
    );
  });
});
