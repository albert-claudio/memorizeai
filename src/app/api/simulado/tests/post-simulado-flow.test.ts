import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const authResult = {
  user: { id: 'user_1' },
  isPro: false,
};

const requireAuthAndOwnershipMock = vi.fn();
const applyRateLimitMock = vi.fn();
const applyCustomRateLimitMock = vi.fn();
const createClientMock = vi.fn();
const searchStudyResourcesMock = vi.fn();
const groqConstructorMock = vi.fn();

type MockQueryBuilder = Record<string, ReturnType<typeof vi.fn>>;

vi.mock('@/lib/auth/auth-guard', () => ({
  requireAuthAndOwnership: requireAuthAndOwnershipMock,
  isAuthSuccess: (result: unknown) => !(result instanceof NextResponse),
}));

vi.mock('@/lib/security/rate-limiter', () => ({
  applyRateLimit: applyRateLimitMock,
  applyCustomRateLimit: applyCustomRateLimitMock,
  getRateLimitError: (reset: number) => ({
    error: `Muitas requisicoes. Tente novamente em ${Math.ceil((reset - Date.now()) / 1000)} segundos.`,
    retryAfter: 60,
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}));

vi.mock('@/lib/web-search/study-resource-search', () => ({
  buildFallbackResources: vi.fn(() => []),
  searchStudyResources: searchStudyResourcesMock,
}));

vi.mock('groq-sdk', () => ({
  default: groqConstructorMock,
}));

function request(body: unknown) {
  return new NextRequest('https://vimens.app/api/simulado/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeSupabase({
  existingDeck,
  existingCardCount = 0,
  withWrongRows = false,
}: {
  existingDeck?: { id: string; title: string } | null;
  existingCardCount?: number;
  withWrongRows?: boolean;
} = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'simulados') {
        const builder: MockQueryBuilder = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.single = vi.fn(async () => ({
          data: {
            id: 'simulado_1',
            titulo: 'Simulado seguro',
            source_id: 'source_1',
            user_id: 'user_1',
          },
          error: null,
        }));
        return builder;
      }

      if (table === 'decks') {
        const builder: MockQueryBuilder = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.is = vi.fn(() => builder);
        builder.maybeSingle = vi.fn(async () => ({
          data: existingDeck ?? null,
          error: null,
        }));
        builder.insert = vi.fn(async () => ({ error: null }));
        builder.update = vi.fn(() => builder);
        return builder;
      }

      if (table === 'cards') {
        const builder: MockQueryBuilder = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.is = vi.fn(async () => ({ count: existingCardCount, error: null }));
        builder.insert = vi.fn(async () => ({ error: null }));
        return builder;
      }

      if (table === 'simulado_questoes') {
        const builder: MockQueryBuilder = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.order = vi.fn(async () => ({
          data: withWrongRows
            ? [{
                id: 'questao_1',
                numero: 1,
                enunciado: 'Explique competencia no processo civil.',
                alternativa_a: 'A',
                alternativa_b: 'B',
                alternativa_c: 'C',
                alternativa_d: 'D',
                alternativa_e: 'E',
                resposta_correta: 'A',
                comentario: 'Competencia e um requisito processual.',
                chunk_id: 'chunk_1',
                citation_excerpt: 'Trecho sobre competencia.',
              }]
            : [],
          error: null,
        }));
        return builder;
      }

      if (table === 'simulado_respostas') {
        const builder: MockQueryBuilder = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(async () => ({
          data: withWrongRows
            ? [{ questao_id: 'questao_1', resposta_usuario: 'B', correta: false }]
            : [],
          error: null,
        }));
        return builder;
      }

      const builder: MockQueryBuilder = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.order = vi.fn(async () => ({ data: [], error: null }));
      builder.insert = vi.fn(async () => ({ error: null }));
      return builder;
    }),
  };
}

describe('post-simulado hardening routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GROQ_API_KEY;
  });

  it('rate-limits study recommendations per authenticated user before external search', async () => {
    requireAuthAndOwnershipMock.mockResolvedValue(authResult);
    applyRateLimitMock.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60_000,
      mode: 'memory',
    });

    const { POST } = await import('@/app/api/simulado/study-recommendations/route');
    const response = await POST(request({ simuladoId: 'simulado_1' }));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toContain('Muitas requisicoes');
    expect(applyRateLimitMock).toHaveBeenCalledWith(
      '/api/simulado/study-recommendations',
      'user:user_1',
    );
    expect(searchStudyResourcesMock).not.toHaveBeenCalled();
  });

  it('reuses an existing reinforcement deck without spending daily budget or calling Groq', async () => {
    requireAuthAndOwnershipMock.mockResolvedValue(authResult);
    applyRateLimitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      mode: 'memory',
    });
    createClientMock.mockResolvedValue(makeSupabase({
      existingDeck: { id: 'simref_existing', title: 'Reforco IA: Processo civil' },
      existingCardCount: 4,
    }));

    const { POST } = await import('@/app/api/simulado/reinforcement-flashcards/route');
    const response = await POST(request({
      simuladoId: 'simulado_1',
      topic: 'Processo civil',
      questionNumbers: [1, 2],
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      reusedDeck: true,
      cardsCreated: 4,
      reviewUrl: expect.stringMatching(/^\/estudar\//),
    });
    expect(applyCustomRateLimitMock).not.toHaveBeenCalled();
    expect(groqConstructorMock).not.toHaveBeenCalled();
  });

  it('blocks reinforcement generation on daily user budget before Groq', async () => {
    requireAuthAndOwnershipMock.mockResolvedValue(authResult);
    applyRateLimitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      mode: 'memory',
    });
    applyCustomRateLimitMock.mockResolvedValue({
      success: false,
      limit: 3,
      remaining: 0,
      reset: Date.now() + 60_000,
      mode: 'memory',
    });
    createClientMock.mockResolvedValue(makeSupabase({ existingDeck: null, withWrongRows: true }));
    process.env.GROQ_API_KEY = 'groq_test_key';

    const { POST } = await import('@/app/api/simulado/reinforcement-flashcards/route');
    const response = await POST(request({
      simuladoId: 'simulado_1',
      topic: 'Processo civil',
      questionNumbers: [1, 2],
    }));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toContain('Limite diario');
    expect(applyCustomRateLimitMock).toHaveBeenCalledWith(expect.objectContaining({
      prefix: 'simulado:reinforcement-flashcards:daily',
      identifier: 'user:user_1',
      maxRequests: 3,
    }));
    expect(groqConstructorMock).not.toHaveBeenCalled();
  });

  it('fills an incomplete reinforcement deck instead of leaving the user stuck', async () => {
    requireAuthAndOwnershipMock.mockResolvedValue(authResult);
    applyRateLimitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      mode: 'memory',
    });
    applyCustomRateLimitMock.mockResolvedValue({
      success: true,
      limit: 3,
      remaining: 2,
      reset: Date.now() + 60_000,
      mode: 'memory',
    });
    groqConstructorMock.mockImplementation(function MockGroq() {
      return {
        chat: {
          completions: {
            create: vi.fn(async () => ({
              choices: [{
                message: {
                  content: JSON.stringify([
                    { front: 'Como revisar competencia no processo civil?', back: 'Competencia define o juizo adequado para julgar a causa. Revise os criterios legais antes de analisar a alternativa.' },
                    { front: 'Qual cuidado evita erro de competencia?', back: 'Identifique o orgao competente antes de aplicar a regra ao caso concreto. Depois confira as excecoes previstas em lei.' },
                    { front: 'Quando a competencia importa na prova?', back: 'Ela orienta validade, distribuicao e processamento do feito. Questoes costumam misturar regra geral e excecoes.' },
                    { front: 'Como transformar erro de competencia em revisao?', back: 'Anote o criterio usado pela questao e contraste com a resposta correta. Refaca exemplos curtos ate reconhecer o padrao.' },
                  ]),
                },
              }],
            })),
          },
        },
      };
    });
    createClientMock.mockResolvedValue(makeSupabase({
      existingDeck: { id: 'simref_existing', title: 'Reforco IA: Processo civil' },
      existingCardCount: 0,
      withWrongRows: true,
    }));
    process.env.GROQ_API_KEY = 'groq_test_key';

    const { POST } = await import('@/app/api/simulado/reinforcement-flashcards/route');
    const response = await POST(request({
      simuladoId: 'simulado_1',
      topic: 'Processo civil',
      questionNumbers: [1],
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      cardsCreated: 4,
      deckTitle: 'Reforco IA: Processo civil',
      reviewUrl: expect.stringMatching(/^\/estudar\//),
    });
    expect(groqConstructorMock).toHaveBeenCalled();
  });
});
