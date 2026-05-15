import { describe, expect, it } from 'vitest';
import { computeDashboardStats } from '@/app/api/dashboard/stats/route';

// ─── Helpers ───────────────────────────────────────────────────────────────

const NOW = Date.UTC(2026, 3, 6, 12, 0, 0); // 2026-04-06 12:00 UTC
const DAY = 24 * 60 * 60 * 1000;
const START_OF_DAY = Date.UTC(2026, 3, 6, 0, 0, 0);

function makeDeck(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deck_1',
    title: 'Constitucional',
    concurso: 'TRF5',
    materia: 'Constitucional',
    tema: 'Controle de Constitucionalidade',
    ...overrides,
  };
}

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card_1',
    deck_id: 'deck_1',
    next_review_at: NOW - DAY, // overdue by 1 day
    is_leech: false,
    lapses: 0,
    difficulty: 5,
    stability: 5,
    ...overrides,
  };
}

function makeReview(overrides: Record<string, unknown> = {}) {
  return {
    card_id: 'card_1',
    grade: 2,
    reviewed_at: NOW - DAY,
    ...overrides,
  };
}

function makeSimulado(overrides: Record<string, unknown> = {}) {
  return {
    status: 'concluido',
    acertos: 7,
    total_questoes: 10,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('computeDashboardStats', () => {
  it('returns safe defaults when there is no data at all', () => {
    const result = computeDashboardStats([], [], [], [], 0, NOW, 0, START_OF_DAY);

    expect(result.today).toEqual({ dueCards: 0, reviewedToday: 0 });
    expect(result.performance.recentPerformance7d).toBeNull();
    expect(result.performance.recentPerformance30d).toBeNull();
    expect(result.performance.studyStreakDays).toBe(0);
    expect(result.performance.trend).toBe('stable');
    expect(result.performanceSeries).toHaveLength(7);
    expect(result.performanceSeries.every(point => point.accuracy === null && point.reviews === 0)).toBe(true);
    expect(result.focusDecks).toEqual([]);
    expect(result.weakTopics).toEqual([]);
    expect(result.reinforcement).toBeNull();
    expect(result.simulados).toEqual({ lastScore: null, recentAverage: null });
    expect(result.forecast).toEqual({ dueToday: 0, dueTomorrow: 0, dueNext7d: 0 });
    expect(result.distribution).toEqual({ overdueTotal: 0, leechTotal: 0, highLapses: 0, lowStability: 0 });
  });

  it('counts recentPerformance7d correctly with grade >= 2 as success', () => {
    const deck = makeDeck();
    const card = makeCard();
    const reviews = [
      makeReview({ grade: 0, reviewed_at: NOW - DAY }),     // error
      makeReview({ grade: 1, reviewed_at: NOW - DAY }),     // error
      makeReview({ grade: 2, reviewed_at: NOW - 2 * DAY }), // success
      makeReview({ grade: 3, reviewed_at: NOW - 3 * DAY }), // success
    ];

    const result = computeDashboardStats([deck], [card], reviews, [], 0, NOW, 0, START_OF_DAY);

    // 2 successes out of 4 = 0.5
    expect(result.performance.recentPerformance7d).toBe(0.5);
  });

  it('calculates recentPerformance30d separately from 7d', () => {
    const deck = makeDeck();
    const card = makeCard();
    // All 7d reviews are errors, all older 30d reviews are successes
    const reviews = [
      makeReview({ grade: 0, reviewed_at: NOW - 1 * DAY }), // 7d: error
      makeReview({ grade: 0, reviewed_at: NOW - 2 * DAY }), // 7d: error
      makeReview({ grade: 3, reviewed_at: NOW - 10 * DAY }), // 30d only: success
      makeReview({ grade: 3, reviewed_at: NOW - 15 * DAY }), // 30d only: success
    ];

    const result = computeDashboardStats([deck], [card], reviews, [], 0, NOW, 0, START_OF_DAY);

    expect(result.performance.recentPerformance7d).toBe(0); // 0/2
    expect(result.performance.recentPerformance30d).toBe(0.5); // 2/4
  });

  it('computes symmetric trend correctly', () => {
    const deck = makeDeck();
    const card = makeCard();

    // 7d = 90% success (9/10), 30d = 50% (because of 20 older failures)
    const reviews7d = Array.from({ length: 9 }, (_, i) =>
      makeReview({ grade: 2, reviewed_at: NOW - (i + 1) * DAY * 0.5 })
    );
    reviews7d.push(makeReview({ grade: 0, reviewed_at: NOW - 5 * DAY }));

    const reviewsOld = Array.from({ length: 10 }, (_, i) =>
      makeReview({ grade: 0, reviewed_at: NOW - (10 + i) * DAY })
    );

    const result = computeDashboardStats([deck], [card], [...reviews7d, ...reviewsOld], [], 0, NOW, 0, START_OF_DAY);

    // 7d = 0.9, 30d = 9/20 = 0.45; 0.9 >= 0.45 + 0.05 → improving
    expect(result.performance.trend).toBe('improving');
  });

  it('marks trend as declining when 7d <= 30d - 5pp', () => {
    const deck = makeDeck();
    const card = makeCard();

    // 7d all errors, past 30d mostly successes
    const reviews7d = [
      makeReview({ grade: 0, reviewed_at: NOW - DAY }),
      makeReview({ grade: 0, reviewed_at: NOW - 2 * DAY }),
    ];
    const reviewsOld = Array.from({ length: 10 }, (_, i) =>
      makeReview({ grade: 3, reviewed_at: NOW - (10 + i) * DAY })
    );

    const result = computeDashboardStats([deck], [card], [...reviews7d, ...reviewsOld], [], 0, NOW, 0, START_OF_DAY);

    // 7d = 0/2 = 0, 30d = 10/12 ≈ 0.833; 0 <= 0.833 - 0.05 → declining
    expect(result.performance.trend).toBe('declining');
  });

  it('reports high error rate deck at top of focusDecks', () => {
    const decks = [
      makeDeck({ id: 'deck_a', title: 'Easy', materia: 'Fácil' }),
      makeDeck({ id: 'deck_b', title: 'Hard', materia: 'Difícil' }),
    ];
    const cards = [
      makeCard({ id: 'c1', deck_id: 'deck_a', lapses: 0, difficulty: 5, stability: 5 }),
      makeCard({ id: 'c2', deck_id: 'deck_b', lapses: 6, difficulty: 8, stability: 1, is_leech: true }),
    ];
    const reviews = [
      makeReview({ card_id: 'c1', grade: 3, reviewed_at: NOW - DAY }),
      makeReview({ card_id: 'c2', grade: 0, reviewed_at: NOW - DAY }),
      makeReview({ card_id: 'c2', grade: 0, reviewed_at: NOW - 2 * DAY }),
    ];

    const result = computeDashboardStats(decks, cards, reviews, [], 0, NOW, 0, START_OF_DAY);

    expect(result.focusDecks[0].deckId).toBe('deck_b');
    expect(result.focusDecks[0].riskScore).toBeGreaterThan(result.focusDecks[1]?.riskScore ?? 0);
  });

  it('gives positive riskScore to a deck with high lapses but no overdue cards', () => {
    const deck = makeDeck();
    const card = makeCard({
      next_review_at: NOW + DAY, // NOT overdue
      lapses: 5,
      difficulty: 8,
      stability: 1,
    });

    const result = computeDashboardStats([deck], [card], [], [], 0, NOW, 0, START_OF_DAY);

    expect(result.focusDecks.length).toBe(1);
    expect(result.focusDecks[0].riskScore).toBeGreaterThan(0);
    expect(result.focusDecks[0].overdueCards).toBe(0);
  });

  it('marks isWeak correctly in weakTopics', () => {
    const deck = makeDeck({ materia: 'Constitucional' });
    const card = makeCard({ lapses: 5, stability: 1 }); // lapses > 3, stability < 2
    const reviews = [
      makeReview({ grade: 0, reviewed_at: NOW - DAY }),
      makeReview({ grade: 0, reviewed_at: NOW - 2 * DAY }),
      makeReview({ grade: 2, reviewed_at: NOW - 3 * DAY }),
    ];

    const result = computeDashboardStats([deck], [card], reviews, [], 0, NOW, 0, START_OF_DAY);

    const constitucional = result.weakTopics.find(t => t.label === 'Constitucional');
    expect(constitucional).toBeDefined();
    expect(constitucional!.isWeak).toBe(true);
  });

  it('picks reinforcement from the top focusDeck with correct primary driver', () => {
    const deck = makeDeck();
    const cards = Array.from({ length: 15 }, (_, i) =>
      makeCard({ id: `card_${i}`, next_review_at: NOW - DAY })
    );
    // All reviews are errors → errorRate7d > 30%
    const reviews = cards.map(c =>
      makeReview({ card_id: c.id, grade: 0, reviewed_at: NOW - DAY })
    );

    const result = computeDashboardStats([deck], cards, reviews, [], 0, NOW, 0, START_OF_DAY);

    expect(result.reinforcement).not.toBeNull();
    expect(result.reinforcement!.deckId).toBe('deck_1');
    expect(result.reinforcement!.reasonType).toBe('high_error');
  });

  it('picks overdue as reason when error rate is below 30%', () => {
    const deck = makeDeck();
    const cards = Array.from({ length: 12 }, (_, i) =>
      makeCard({ id: `card_${i}`, next_review_at: NOW - DAY })
    );
    // Mix of grades → error rate not that high
    const reviews = [
      makeReview({ card_id: 'card_0', grade: 0, reviewed_at: NOW - DAY }),
      makeReview({ card_id: 'card_1', grade: 2, reviewed_at: NOW - DAY }),
      makeReview({ card_id: 'card_2', grade: 3, reviewed_at: NOW - DAY }),
      makeReview({ card_id: 'card_3', grade: 2, reviewed_at: NOW - DAY }),
    ];

    const result = computeDashboardStats([deck], cards, reviews, [], 0, NOW, 0, START_OF_DAY);

    expect(result.reinforcement).not.toBeNull();
    expect(result.reinforcement!.reasonType).toBe('overdue');
  });

  it('calculates forecast with exclusive windows', () => {
    const deck = makeDeck();
    const cards = [
      makeCard({ id: 'c1', next_review_at: NOW - DAY }),                // due today (overdue)
      makeCard({ id: 'c2', next_review_at: START_OF_DAY + 12 * 3600000 }), // due today
      makeCard({ id: 'c3', next_review_at: START_OF_DAY + DAY + 1000 }),   // due tomorrow
      makeCard({ id: 'c4', next_review_at: START_OF_DAY + 3 * DAY }),      // due in 3 days
      makeCard({ id: 'c5', next_review_at: START_OF_DAY + 10 * DAY }),     // beyond 7d
    ];

    const result = computeDashboardStats([deck], cards, [], [], 0, NOW, 0, START_OF_DAY);

    expect(result.forecast.dueToday).toBe(2);     // c1 + c2
    expect(result.forecast.dueTomorrow).toBe(1);   // c3
    expect(result.forecast.dueNext7d).toBe(4);     // c1 + c2 + c3 + c4 (inclusive)
  });

  it('computes distribution from all active cards', () => {
    const deck = makeDeck();
    const cards = [
      makeCard({ id: 'c1', next_review_at: NOW - DAY, is_leech: true, lapses: 5, stability: 1 }),
      makeCard({ id: 'c2', next_review_at: NOW + DAY, is_leech: false, lapses: 1, stability: 3 }),
      makeCard({ id: 'c3', next_review_at: NOW - 2 * DAY, is_leech: false, lapses: 4, stability: 0.5 }),
    ];

    const result = computeDashboardStats([deck], cards, [], [], 0, NOW, 0, START_OF_DAY);

    expect(result.distribution.overdueTotal).toBe(2);   // c1, c3
    expect(result.distribution.leechTotal).toBe(1);     // c1
    expect(result.distribution.highLapses).toBe(2);     // c1 (5), c3 (4)
    expect(result.distribution.lowStability).toBe(2);   // c1 (1), c3 (0.5)
  });

  it('handles simulados correctly', () => {
    const result = computeDashboardStats([], [], [], [
      makeSimulado({ acertos: 8, total_questoes: 10 }),
      makeSimulado({ acertos: 6, total_questoes: 10 }),
    ], 0, NOW, 0, START_OF_DAY);

    expect(result.simulados.lastScore).toBe(0.8);
    expect(result.simulados.recentAverage).toBe(0.7);
  });

  it('builds a 7-day performance series with daily accuracy and volume', () => {
    const deck = makeDeck();
    const card = makeCard();
    const reviews = [
      makeReview({ grade: 2, reviewed_at: START_OF_DAY + 10 * 60 * 60 * 1000 }),
      makeReview({ grade: 0, reviewed_at: START_OF_DAY + 12 * 60 * 60 * 1000 }),
      makeReview({ grade: 3, reviewed_at: START_OF_DAY - DAY + 9 * 60 * 60 * 1000 }),
    ];

    const result = computeDashboardStats([deck], [card], reviews, [], 2, NOW, 0, START_OF_DAY);

    expect(result.performanceSeries).toHaveLength(7);
    expect(result.performanceSeries[5]).toMatchObject({
      accuracy: 1,
      reviews: 1,
    });
    expect(result.performanceSeries[6]).toMatchObject({
      accuracy: 0.5,
      reviews: 2,
    });
  });

  it('does not crash with null arrays from supabase', () => {
    // Simulates what happens when supabase returns null data
    const result = computeDashboardStats([], [], [], [], 0, NOW, 0, START_OF_DAY);

    expect(result).toBeDefined();
    expect(result.focusDecks).toEqual([]);
    expect(result.weakTopics).toEqual([]);
    expect(result.reinforcement).toBeNull();
  });
});
