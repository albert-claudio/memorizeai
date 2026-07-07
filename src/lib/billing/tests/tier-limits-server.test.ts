import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeCardCreation, authorizeDeckCreation } from '../tier-limits';

const mocks = vi.hoisted(() => ({
  getEffectiveProAccess: vi.fn(),
}));

vi.mock('@/lib/billing/effective-pro-access', () => ({
  getEffectiveProAccess: mocks.getEffectiveProAccess,
}));

function countSupabase(count: number) {
  const builder = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
  };

  builder.from.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.is.mockResolvedValue({ count });

  return builder;
}

describe('server-side tier limit authorization', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('blocks free users at the deck limit before creating another deck', async () => {
    mocks.getEffectiveProAccess.mockResolvedValue(false);
    const supabase = countSupabase(3);

    const result = await authorizeDeckCreation(supabase as never, 'user_1');

    expect(result).toMatchObject({
      allowed: false,
      currentCount: 3,
      maxCount: 3,
    });
    expect(result.reason).toContain('Limite de 3 decks');
  });

  it('allows pro users regardless of current deck count', async () => {
    mocks.getEffectiveProAccess.mockResolvedValue(true);
    const supabase = countSupabase(300);

    const result = await authorizeDeckCreation(supabase as never, 'user_1');

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(300);
  });

  it('blocks free users when a card insert would exceed per-deck capacity', async () => {
    mocks.getEffectiveProAccess.mockResolvedValue(false);
    const supabase = countSupabase(49);

    const result = await authorizeCardCreation(supabase as never, 'deck_1', 'user_1', 2);

    expect(result).toMatchObject({
      allowed: false,
      currentCount: 49,
      maxCount: 50,
    });
    expect(result.reason).toContain('Limite de 50 cards');
  });
});
