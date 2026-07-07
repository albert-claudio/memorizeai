import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('resolveRunProviderModel', () => {
  it('keeps flashcards on groq when openai rollout is disabled', async () => {
    vi.stubEnv('FLASHCARDS_PROVIDER', 'groq');
    vi.stubEnv('FLASHCARDS_OPENAI_PERCENT', '100');

    const { resolveRunProviderModel } = await import('../provider-router');
    const resolved = resolveRunProviderModel({
      runId: 'run-1',
      objective: 'flashcards',
      preference: 'auto',
    });

    expect(resolved.provider).toBe('groq');
    expect(resolved.model).toBe('llama-3.3-70b-versatile');
  });

  it('routes flashcards to openai when rollout is 100%', async () => {
    vi.stubEnv('FLASHCARDS_PROVIDER', 'openai');
    vi.stubEnv('FLASHCARDS_OPENAI_PERCENT', '100');
    vi.stubEnv('FLASHCARDS_OPENAI_MODEL', 'gpt-4o-mini');

    const { resolveRunProviderModel } = await import('../provider-router');
    const resolved = resolveRunProviderModel({
      runId: 'run-2',
      objective: 'flashcards',
      preference: 'auto',
    });

    expect(resolved.provider).toBe('openai');
    expect(resolved.model).toBe('gpt-4o-mini');
  });

  it('treats an OpenAI model value in FLASHCARDS_PROVIDER as explicit OpenAI routing', async () => {
    vi.stubEnv('FLASHCARDS_PROVIDER', 'gpt-5-mini');
    vi.stubEnv('FLASHCARDS_OPENAI_PERCENT', '0');
    vi.stubEnv('FLASHCARDS_OPENAI_MODEL', 'gpt-4o-mini');

    const { resolveRunProviderModel } = await import('../provider-router');
    const resolved = resolveRunProviderModel({
      runId: 'run-model-alias',
      objective: 'flashcards',
      preference: 'auto',
    });

    expect(resolved.provider).toBe('openai');
    expect(resolved.model).toBe('gpt-5-mini');
  });

  it('uses a stable digest bucket for partial OpenAI rollout', async () => {
    vi.stubEnv('FLASHCARDS_PROVIDER', 'openai');
    vi.stubEnv('FLASHCARDS_OPENAI_PERCENT', '50');

    const { resolveRunProviderModel } = await import('../provider-router');
    const first = resolveRunProviderModel({
      runId: 'run-stable-bucket',
      objective: 'flashcards',
      preference: 'auto',
    });
    const second = resolveRunProviderModel({
      runId: 'run-stable-bucket',
      objective: 'flashcards',
      preference: 'auto',
    });

    expect(second).toEqual(first);
  });

  it('preserves explicit provider preference', async () => {
    vi.stubEnv('FLASHCARDS_PROVIDER', 'groq');
    vi.stubEnv('FLASHCARDS_OPENAI_PERCENT', '0');

    const { resolveRunProviderModel } = await import('../provider-router');
    const resolved = resolveRunProviderModel({
      runId: 'run-3',
      objective: 'flashcards',
      preference: 'openai',
    });

    expect(resolved.provider).toBe('openai');
    expect(resolved.model).toBe('gpt-4o-mini');
  });

  it('keeps questoes_banca on gemini in auto mode', async () => {
    const { resolveRunProviderModel } = await import('../provider-router');
    const resolved = resolveRunProviderModel({
      runId: 'run-4',
      objective: 'questoes_banca',
      preference: 'auto',
    });

    expect(resolved.provider).toBe('gemini');
    expect(resolved.model).toBe('gemini-2.5-flash-lite');
  });

  it('uses a dedicated OpenAI model for question generation fallback', async () => {
    vi.stubEnv('OPENAI_FLASHCARDS_FALLBACK_MODEL', 'gpt-5-mini');
    vi.stubEnv('OPENAI_QUESTOES_MODEL', 'gpt-4.1-mini');

    const { getDefaultModelForProvider } = await import('../provider-router');

    expect(getDefaultModelForProvider('openai', 'questoes_banca')).toBe('gpt-4.1-mini');
    expect(getDefaultModelForProvider('openai', 'exercicios_aplicados')).toBe('gpt-4.1-mini');
    expect(getDefaultModelForProvider('openai', 'unknown')).toBe('gpt-5-mini');
  });
});
