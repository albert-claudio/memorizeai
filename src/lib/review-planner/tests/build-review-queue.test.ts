import { describe, expect, it } from 'vitest';
import { buildReviewQueue } from '@/lib/review-planner/build-review-queue';
import type { Card } from '@/lib/types';

const NOW = Date.UTC(2026, 2, 25, 12, 0, 0);

function makeCard(overrides: Partial<Card>): Card {
  return {
    id: overrides.id ?? 'card',
    deck_id: overrides.deck_id ?? 'deck_1',
    front: overrides.front ?? 'front',
    back: overrides.back ?? 'back',
    step: overrides.step ?? 0,
    next_review_at: overrides.next_review_at ?? NOW - (60 * 60 * 1000),
    difficulty: overrides.difficulty ?? 5,
    stability: overrides.stability ?? 5,
    ease_factor: overrides.ease_factor ?? 2.5,
    lapses: overrides.lapses ?? 0,
    is_leech: overrides.is_leech ?? false,
    last_review_at: overrides.last_review_at ?? NOW - (2 * 24 * 60 * 60 * 1000),
    relearning_step: overrides.relearning_step ?? null,
    source_id: overrides.source_id ?? null,
    citation_text: overrides.citation_text ?? null,
    created_at: overrides.created_at ?? NOW - (10 * 24 * 60 * 60 * 1000),
    updated_at: overrides.updated_at ?? NOW,
    deleted_at: overrides.deleted_at ?? null,
  };
}

describe('buildReviewQueue', () => {
  it('preserves the current FSRS-first ordering when no planner rules apply', () => {
    const cards = [
      makeCard({ id: 'new_card', next_review_at: null }),
      makeCard({ id: 'overdue_card', next_review_at: NOW - (2 * 24 * 60 * 60 * 1000) }),
      makeCard({ id: 'relearning_card', relearning_step: 0, next_review_at: NOW - 1000 }),
    ];

    const result = buildReviewQueue({ cards, now: NOW, preferences: { prioritizeWeak: false } });

    expect(result.strategy).toBe('default');
    expect(result.cards.map((card) => card.id)).toEqual([
      'relearning_card',
      'overdue_card',
      'new_card',
    ]);
  });

  it('pushes weak cards ahead when prioritize_weak is enabled', () => {
    const cards = [
      makeCard({ id: 'stable_card', lapses: 0, difficulty: 5, stability: 7 }),
      makeCard({ id: 'weak_card', lapses: 4, difficulty: 8, stability: 1 }),
    ];

    const result = buildReviewQueue({
      cards,
      now: NOW,
      preferences: { prioritizeWeak: true },
    });

    expect(result.strategy).toBe('weak-first');
    expect(result.appliedRules).toContain('prioritize_weak');
    expect(result.cards[0]?.id).toBe('weak_card');
  });

  it('amplifies urgency when an active exam target is near', () => {
    const cards = [
      makeCard({ id: 'less_risky', lapses: 0, difficulty: 5, stability: 7 }),
      makeCard({ id: 'more_risky', lapses: 2, difficulty: 8, stability: 2 }),
    ];

    const result = buildReviewQueue({
      cards,
      now: NOW,
      preferences: { prioritizeWeak: false, prioritizeNearExam: true },
      examTarget: {
        id: 'target_1',
        user_id: 'user_1',
        deck_id: 'deck_1',
        title: 'Prova de Constitucional',
        target_date: NOW + (5 * 24 * 60 * 60 * 1000),
        target_retention: 0.97,
        is_active: true,
        created_at: NOW,
        updated_at: NOW,
      },
    });

    expect(result.strategy).toBe('exam-target');
    expect(result.appliedRules).toContain('prioritize_near_exam');
    expect(result.examTarget?.title).toBe('Prova de Constitucional');
    expect(result.cards[0]?.id).toBe('more_risky');
  });
});
