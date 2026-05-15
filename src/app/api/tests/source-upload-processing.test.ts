import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  requireAuth: vi.fn(),
  requireAuthAndOwnership: vi.fn(),
  isAuthSuccess: vi.fn((value: unknown) => !(value instanceof Response)),
  canUploadDocument: vi.fn(),
  emitContentReadyNotification: vi.fn(),
  generateAIText: vi.fn(),
  getDefaultModelForProvider: vi.fn(),
  captureApiError: vi.fn(),
  setSentryUser: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createSupabaseClient,
}));

vi.mock('@/lib/auth/auth-guard', () => ({
  requireAuth: mocks.requireAuth,
  requireAuthAndOwnership: mocks.requireAuthAndOwnership,
  isAuthSuccess: mocks.isAuthSuccess,
}));

vi.mock('@/lib/billing/tier-limits', () => ({
  canUploadDocument: mocks.canUploadDocument,
}));

vi.mock('@/lib/notifications/emitters', () => ({
  emitContentReadyNotification: mocks.emitContentReadyNotification,
}));

vi.mock('@/lib/ai/provider-router', () => ({
  generateAIText: mocks.generateAIText,
  getDefaultModelForProvider: mocks.getDefaultModelForProvider,
}));

vi.mock('@/lib/sentry', () => ({
  captureApiError: mocks.captureApiError,
  setSentryUser: mocks.setSentryUser,
}));

type SourceUpdate = {
  value: unknown;
  payload: Record<string, unknown>;
};

function createProcessSourceSupabaseMock(options?: {
  sourceFilename?: string;
  existingChunkIdsByHash?: Record<string, string>;
}) {
  const sourceUpdates: SourceUpdate[] = [];
  const chunkInserts: Record<string, unknown>[] = [];
  const sourceChunkUpserts: Record<string, unknown>[] = [];
  const sourceDigestUpserts: Record<string, unknown>[] = [];
  const chunkLookupHashes: string[] = [];

  const sourceFilename = options?.sourceFilename ?? 'apostila.pdf';
  const existingChunkIdsByHash = options?.existingChunkIdsByHash ?? {};

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'sources') {
        return {
          select: vi.fn(() => {
            let sourceId: string | null = null;

            const query = {
              eq(column: string, value: unknown) {
                if (column === 'id') {
                  sourceId = String(value);
                }
                return query;
              },
              async single() {
                return {
                  data: sourceId ? { filename: sourceFilename } : null,
                  error: null,
                };
              },
            };

            return query;
          }),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(async (_column: string, value: unknown) => {
              sourceUpdates.push({ payload, value });
              return { error: null };
            }),
          })),
        };
      }

      if (table === 'chunks') {
        return {
          select: vi.fn(() => {
            let contentHash: string | null = null;

            const query = {
              eq(column: string, value: unknown) {
                if (column === 'content_hash') {
                  contentHash = String(value);
                  chunkLookupHashes.push(contentHash);
                }
                return query;
              },
              async single() {
                const existingId = contentHash ? existingChunkIdsByHash[contentHash] : null;
                return {
                  data: existingId ? { id: existingId } : null,
                  error: null,
                };
              },
            };

            return query;
          }),
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            chunkInserts.push(payload);
            return { error: null };
          }),
        };
      }

      if (table === 'source_chunks') {
        return {
          upsert: vi.fn(async (payload: Record<string, unknown>) => {
            sourceChunkUpserts.push(payload);
            return { error: null };
          }),
        };
      }

      if (table === 'source_digests') {
        return {
          upsert: vi.fn(async (payload: Record<string, unknown>) => {
            sourceDigestUpserts.push(payload);
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return {
    client,
    sourceUpdates,
    chunkInserts,
    sourceChunkUpserts,
    sourceDigestUpserts,
    chunkLookupHashes,
  };
}

function buildLargeDocument(pageCount: number, sentencesPerPage: number = 12): string {
  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const sentences = Array.from({ length: sentencesPerPage }, (_, sentenceIndex) =>
      `Página ${pageIndex + 1}, item ${sentenceIndex + 1}. A administração pública deve observar legalidade, impessoalidade, moralidade, publicidade e eficiência em cada procedimento.`
    );
    return sentences.join(' ');
  }).join('\n\n');
}

function buildSlideDeck(slideCount: number, groupSize: number = 5) {
  return Array.from({ length: slideCount }, (_, index) => {
    const topic = Math.floor(index / groupSize) + 1;
    return {
      slideNumber: index + 1,
      title: `Tema ${topic}: aspectos centrais`,
      body: [
        `Slide ${index + 1}. Conceitos aplicados do tema ${topic}.`,
        'Requisitos cumulativos, exceções relevantes e impactos práticos.',
        'Exemplos, distinções e consequências do instituto estudado.',
      ].join(' '),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_test_key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_test_key';

  mocks.requireAuth.mockResolvedValue({
    user: { id: 'user_123', email: 'user@example.com' },
    isPro: false,
  });
  mocks.requireAuthAndOwnership.mockResolvedValue({
    user: { id: 'user_123', email: 'user@example.com' },
    isPro: false,
  });
  mocks.canUploadDocument.mockResolvedValue({
    allowed: true,
  });
  mocks.emitContentReadyNotification.mockResolvedValue(undefined);
  mocks.generateAIText.mockResolvedValue({
    text: JSON.stringify({
      summary: 'Resumo digest',
      topics: ['Tema 1'],
      flashcard_context: [
        { id: 'chunk-1', fact: 'Fato', detail: 'Detalhe', quote: 'Trecho' },
      ],
      pitfalls: [],
    }),
    totalTokens: 123,
    estimatedCostUsd: 0.001,
    durationMs: 10,
  });
  mocks.getDefaultModelForProvider.mockReturnValue('gpt-test');
});

describe('source upload route: /api/extract-document', () => {
  it('blocks upload when weekly quota is exhausted', async () => {
    mocks.canUploadDocument.mockResolvedValue({
      allowed: false,
      reason: 'Limite semanal atingido',
    });

    const { POST } = await import('@/app/api/extract-document/route');

    const request = {} as NextRequest;

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({
      error: 'Limite semanal atingido',
      code: 'UPLOAD_LIMIT_REACHED',
      upgradeUrl: '/upgrade',
    });
  }, 30000);

  it('rejects unsupported file types before extraction', async () => {
    const formData = new FormData();
    formData.append('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));

    const { POST } = await import('@/app/api/extract-document/route');

    const request = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as NextRequest;

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: 'Tipo de arquivo não suportado. Use PDF, DOCX ou PPTX.',
    });
  }, 15000);

  it('rejects oversized files before spending CPU on extraction', async () => {
    const formData = new FormData();
    formData.append(
      'file',
      new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'abuse.pdf', {
        type: 'application/pdf',
      })
    );

    const { POST } = await import('@/app/api/extract-document/route');

    const request = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as NextRequest;

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: 'Arquivo muito grande. Máximo: 50MB',
    });
  }, 15000);
});

describe('source processing route: /api/process-source', () => {
  it('persists a new chunk, links it to the source, and emits notification', async () => {
    const supabase = createProcessSourceSupabaseMock({
      sourceFilename: 'direito-constitucional.pdf',
    });
    mocks.createSupabaseClient.mockReturnValue(supabase.client);

    const { POST } = await import('@/app/api/process-source/route');

    const request = new NextRequest('https://vimens.app/api/process-source', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'source_1',
        extractedText: 'Art. 5. Todos são iguais perante a lei.',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      chunks: 1,
      reused: 0,
    });

    expect(supabase.chunkInserts).toHaveLength(1);
    expect(supabase.sourceChunkUpserts).toHaveLength(1);
    expect(supabase.sourceDigestUpserts).toHaveLength(1);
    expect(supabase.sourceChunkUpserts[0]).toMatchObject({
      source_id: 'source_1',
      position: 0,
    });

    expect(supabase.sourceUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'source_1',
          payload: expect.objectContaining({ status: 'processando' }),
        }),
        expect.objectContaining({
          value: 'source_1',
          payload: expect.objectContaining({ progress: 100 }),
        }),
        expect.objectContaining({
          value: 'source_1',
          payload: expect.objectContaining({ status: 'concluido', progress: 100 }),
        }),
      ])
    );

    expect(mocks.emitContentReadyNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_123',
        dedupeKey: 'content-ready:source_1',
        metadata: expect.objectContaining({
          sourceId: 'source_1',
          filename: 'direito-constitucional.pdf',
          chunks: 1,
          reusedChunks: 0,
        }),
      })
    );
  });

  it('reuses an existing chunk hash instead of inserting a duplicate chunk', async () => {
    const extractedText = 'Mesmo conteúdo técnico já indexado.';
    const chunkHash = createHash('sha256').update(extractedText).digest('hex');
    const supabase = createProcessSourceSupabaseMock({
      existingChunkIdsByHash: {
        [chunkHash]: 'chunk_existing',
      },
    });
    mocks.createSupabaseClient.mockReturnValue(supabase.client);

    const { POST } = await import('@/app/api/process-source/route');

    const request = new NextRequest('https://vimens.app/api/process-source', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'source_2',
        extractedText,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      chunks: 1,
      reused: 1,
    });

    expect(supabase.chunkLookupHashes).toEqual([chunkHash]);
    expect(supabase.chunkInserts).toHaveLength(0);
    expect(supabase.sourceChunkUpserts).toEqual([
      expect.objectContaining({
        source_id: 'source_2',
        chunk_id: 'chunk_existing',
        position: 0,
      }),
    ]);
  });

  it('processes a synthetic 250-page document without breaking the chunk persistence path', async () => {
    const supabase = createProcessSourceSupabaseMock({
      sourceFilename: 'manual-250-paginas.pdf',
    });
    mocks.createSupabaseClient.mockReturnValue(supabase.client);

    const { POST } = await import('@/app/api/process-source/route');

    const request = new NextRequest('https://vimens.app/api/process-source', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'source_250_pages',
        extractedText: buildLargeDocument(250),
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.chunks).toBeGreaterThan(200);
    expect(supabase.chunkInserts).toHaveLength(json.chunks);
    expect(supabase.sourceChunkUpserts).toHaveLength(json.chunks);
  }, 15000);

  it('processes a synthetic 250-slide deck with semantic chunking to reduce downstream token volume', async () => {
    const slides = buildSlideDeck(250, 5);
    const supabase = createProcessSourceSupabaseMock({
      sourceFilename: 'aula-250-slides.pptx',
    });
    mocks.createSupabaseClient.mockReturnValue(supabase.client);

    const { POST } = await import('@/app/api/process-source/route');

    const request = new NextRequest('https://vimens.app/api/process-source', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'source_250_slides',
        extractedText: slides.map(slide => `${slide.title}\n${slide.body}`).join('\n\n'),
        slides,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.chunks).toBeGreaterThan(0);
    expect(json.chunks).toBeLessThan(100);
    expect(supabase.sourceChunkUpserts).toHaveLength(json.chunks);
    expect(mocks.emitContentReadyNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          chunks: json.chunks,
        }),
      })
    );
  }, 15000);

  it('returns 403 when ownership validation rejects the source', async () => {
    mocks.requireAuthAndOwnership.mockResolvedValue(
      NextResponse.json(
        { error: 'Acesso negado. VocÃª nÃ£o tem permissÃ£o para acessar este recurso.' },
        { status: 403 }
      )
    );

    const { POST } = await import('@/app/api/process-source/route');

    const request = new NextRequest('https://vimens.app/api/process-source', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'source_victim',
        extractedText: 'conteudo qualquer',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({
      error: 'Acesso negado. VocÃª nÃ£o tem permissÃ£o para acessar este recurso.',
    });
  });

  it('rejects malformed sourceId before ownership validation or chunk writes', async () => {
    const { POST } = await import('@/app/api/process-source/route');

    const request = new NextRequest('https://memoriza.app/api/process-source', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'source_1,or(id.is.not.null)',
        extractedText: 'conteudo qualquer',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: 'Invalid sourceId format',
    });
    expect(mocks.requireAuthAndOwnership).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only extracted payloads to avoid useless chunk writes', async () => {
    const supabase = createProcessSourceSupabaseMock({
      sourceFilename: 'lixo.pdf',
    });
    mocks.createSupabaseClient.mockReturnValue(supabase.client);

    const { POST } = await import('@/app/api/process-source/route');

    const request = new NextRequest('https://memoriza.app/api/process-source', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'source_empty',
        extractedText: '   \n\n   ',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json).toEqual({
      error: 'Documento sem conteúdo textual útil para processamento.',
      code: 'EMPTY_EXTRACTED_TEXT',
    });
    expect(supabase.chunkInserts).toHaveLength(0);
    expect(supabase.sourceChunkUpserts).toHaveLength(0);
    expect(supabase.sourceUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'source_empty',
          payload: expect.objectContaining({ status: 'processando' }),
        }),
        expect.objectContaining({
          value: 'source_empty',
          payload: expect.objectContaining({
            status: 'erro',
            error_message: 'Documento sem conteúdo textual útil para processamento.',
          }),
        }),
      ])
    );
  });
});
