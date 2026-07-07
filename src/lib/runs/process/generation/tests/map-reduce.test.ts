import { afterEach, describe, expect, it, vi } from 'vitest';

describe('buildGenerationPayload', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('sets a bounded output token budget for question generation', async () => {
    const { buildGenerationPayload } = await import('../map-reduce');

    const payload = buildGenerationPayload({
      objective: 'questoes_banca',
      targetCount: 10,
      chunks: [],
      promptConfig: {
        system: 'system',
        user: () => 'user',
      },
    });

    expect(payload.maxOutputTokens).toBeGreaterThanOrEqual(2500);
    expect(payload.maxOutputTokens).toBeLessThanOrEqual(8000);
  });

  it('allows an explicit question output budget override', async () => {
    vi.stubEnv('QUESTOES_MAX_OUTPUT_TOKENS', '4200');
    const { buildGenerationPayload } = await import('../map-reduce');

    const payload = buildGenerationPayload({
      objective: 'questoes_banca',
      targetCount: 10,
      chunks: [],
      promptConfig: {
        system: 'system',
        user: () => 'user',
      },
    });

    expect(payload.maxOutputTokens).toBe(4200);
  });
});

describe('capGenerationBatchSize', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('caps questoes_banca batches at 8 by default', async () => {
    const { capGenerationBatchSize } = await import('../map-reduce');
    expect(capGenerationBatchSize(25, 'questoes_banca')).toBe(8);
    expect(capGenerationBatchSize(4, 'questoes_banca')).toBe(4);
  });

  it('does not cap flashcards', async () => {
    const { capGenerationBatchSize } = await import('../map-reduce');
    expect(capGenerationBatchSize(20, 'flashcards')).toBe(20);
  });
});

describe('createGenerationPayloadFactory', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('builds a smaller OpenAI prompt than Gemini on failover', async () => {
    const { createGenerationPayloadFactory } = await import('../map-reduce');

    const chunks = Array.from({ length: 12 }, (_, index) => ({
      id: `chunk-${index}`,
      content: `Artigo ${index + 1}. ${'Conteudo juridico relevante. '.repeat(40)}`,
      sourceName: 'validate-source.txt',
      pageNumber: index + 1,
    }));

    const factory = createGenerationPayloadFactory({
      chunks,
      objective: 'questoes_banca',
      targetCount: 8,
      promptConfig: {
        system: 'system',
        user: (formattedChunks, targetCount) => `Crie ${targetCount} questoes.\n${formattedChunks}`,
      },
      useReducedPromptBudget: false,
    });

    const geminiPayload = factory('gemini');
    const openaiPayload = factory('openai');

    expect(openaiPayload.user.length).toBeLessThan(geminiPayload.user.length);
    expect(openaiPayload.timeoutMs).toBe(120_000);
    expect(geminiPayload.maxOutputTokens).toBe(openaiPayload.maxOutputTokens);
  });
});
