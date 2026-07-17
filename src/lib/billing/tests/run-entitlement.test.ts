import { describe, expect, it, vi } from 'vitest';

import {
  authorizeRunCreation,
  buildMonthlyUsage,
  checkRunEntitlement,
} from '@/lib/billing/run-entitlement';

function makeSupabaseCounts(flashcards: number, simulados: number) {
  const from = vi.fn(() => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      gte: vi.fn(() => query),
      in: vi.fn(() => query),
      then: (resolve: (value: { count: number }) => unknown) => {
        const callIndex = from.mock.calls.length;
        return Promise.resolve(resolve({ count: callIndex === 1 ? flashcards : simulados }));
      },
    };

    return query;
  });

  return { from };
}

describe('run entitlement public launch', () => {
  it('allows generation and clamps target count by tier', () => {
    expect(authorizeRunCreation(false, 999)).toEqual({
      allowed: true,
      validatedTargetCount: 10,
    });
    expect(authorizeRunCreation(true, 999)).toEqual({
      allowed: true,
      validatedTargetCount: 50,
    });
    expect(authorizeRunCreation(false, 0)).toEqual({
      allowed: true,
      validatedTargetCount: 1,
    });
    expect(authorizeRunCreation(false, Number.NaN)).toEqual({
      allowed: true,
      validatedTargetCount: 1,
    });
    expect(authorizeRunCreation(true, 12.9)).toEqual({
      allowed: true,
      validatedTargetCount: 12,
    });
  });

  it('enforces monthly flashcard quota for free users', async () => {
    const supabase = makeSupabaseCounts(5, 0);

    const result = await checkRunEntitlement(
      supabase as never,
      'user-1',
      false,
      'flashcards',
      20,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Limite mensal de 5 geracoes de flashcards atingido');
    expect(result.validatedTargetCount).toBe(10);
    expect(result.usage).toEqual({ flashcards: 5, simulados: 0 });
  });

  it('blocks free users from simulado objectives', async () => {
    const supabase = makeSupabaseCounts(0, 0);

    const result = await checkRunEntitlement(
      supabase as never,
      'user-1',
      false,
      'questoes_banca',
      10,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('simulados nao estao disponiveis no plano gratuito');
  });

  it('allows processing when monthly usage is exactly at the limit', async () => {
    const supabase = makeSupabaseCounts(5, 0);

    const result = await checkRunEntitlement(
      supabase as never,
      'user-1',
      false,
      'flashcards',
      10,
      { atProcessTime: true },
    );

    expect(result.allowed).toBe(true);
  });

  it('blocks processing when monthly quota is exceeded', async () => {
    const supabase = makeSupabaseCounts(6, 0);

    const result = await checkRunEntitlement(
      supabase as never,
      'user-1',
      false,
      'flashcards',
      10,
      { atProcessTime: true },
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Limite mensal de 5 geracoes de flashcards atingido');
  });

  it('reports public launch usage limits', () => {
    expect(buildMonthlyUsage(false, { flashcards: 100, simulados: 50 })).toEqual({
      flashcardsUsed: 100,
      flashcardsLimit: 5,
      simuladosUsed: 50,
      simuladosLimit: 0,
      isPro: false,
    });

    expect(buildMonthlyUsage(true, { flashcards: 100, simulados: 50 })).toEqual({
      flashcardsUsed: 100,
      flashcardsLimit: 999999,
      simuladosUsed: 50,
      simuladosLimit: 999999,
      isPro: true,
    });
  });
});
