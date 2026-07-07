import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getEffectiveProAccess: vi.fn(),
  buildReviewQueue: vi.fn(),
  attachCardSourceReferences: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@/lib/billing/effective-pro-access', () => ({
  getEffectiveProAccess: mocks.getEffectiveProAccess,
}));

vi.mock('@/lib/review-planner/build-review-queue', () => ({
  buildReviewQueue: mocks.buildReviewQueue,
}));

vi.mock('@/lib/cards/source-references', () => ({
  attachCardSourceReferences: mocks.attachCardSourceReferences,
}));

type Builder = Record<string, ReturnType<typeof vi.fn>>;

function makeSupabase() {
  const from = vi.fn((table: string) => {
    const builder: Builder = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.or = vi.fn(async () => ({
      data: [{ id: 'card_1', deck_id: 'deck_1', front: 'Q', back: 'A' }],
      error: null,
    }));
    builder.single = vi.fn(async () => ({
      data: { id: 'deck_1', user_id: 'user_1', name: 'Deck' },
      error: null,
    }));
    builder.maybeSingle = vi.fn(async () => ({
      data: {
        prioritize_weak: true,
        prioritize_near_exam: true,
      },
      error: null,
    }));

    if (table === 'exam_targets') {
      throw new Error('free users must not query exam_targets for review ordering');
    }

    return builder;
  });

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user_1' } },
        error: null,
      })),
    },
    from,
  };
}

describe('/api/review/queue Pro server gate', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('ignores premium review preferences and exam target ordering for free users', async () => {
    const supabase = makeSupabase();
    mocks.createClient.mockResolvedValue(supabase);
    mocks.getEffectiveProAccess.mockResolvedValue(false);
    mocks.buildReviewQueue.mockReturnValue({
      cards: [{ id: 'card_1', deck_id: 'deck_1', front: 'Q', back: 'A' }],
      strategy: 'default',
      appliedRules: [],
      examTarget: null,
    });
    mocks.attachCardSourceReferences.mockResolvedValue([
      { id: 'card_1', deck_id: 'deck_1', front: 'Q', back: 'A' },
    ]);

    const { GET } = await import('@/app/api/review/queue/route');
    const response = await GET(new Request('https://memorize.ai/api/review/queue?deckId=deck_1'));

    expect(response.status).toBe(200);
    expect(mocks.buildReviewQueue).toHaveBeenCalledWith(expect.objectContaining({
      preferences: {
        prioritizeWeak: false,
        prioritizeNearExam: false,
      },
      examTarget: null,
    }));
    expect(supabase.from).not.toHaveBeenCalledWith('exam_targets');
  });
});
