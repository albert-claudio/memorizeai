import { isDue, sortByPriority } from '@/lib/fsrs';
import type { Card, ExamTarget } from '@/lib/types';
import type { ReviewPlannerInput, ReviewPlannerPreferences, ReviewPlannerResult } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_REVIEW_PLANNER_PREFERENCES: ReviewPlannerPreferences = {
  prioritizeWeak: true,
  prioritizeNearExam: false,
};

function getOverdueDays(card: Card, now: number): number {
  if (card.next_review_at === null || card.next_review_at >= now) {
    return 0;
  }

  return Math.max(0, (now - card.next_review_at) / DAY_MS);
}

function getWeaknessScore(card: Card): number {
  const lapses = Math.max(0, card.lapses ?? 0);
  const difficulty = Number.isFinite(card.difficulty) ? Math.max(0, card.difficulty - 5) : 0;
  const lowStability = Number.isFinite(card.stability) ? Math.max(0, 4 - card.stability) : 4;

  return (
    lapses * 1.8 +
    difficulty * 0.8 +
    lowStability * 1.2 +
    (card.is_leech ? 5 : 0)
  );
}

function getExamUrgencyMultiplier(examTarget: ExamTarget | null | undefined, now: number): number {
  if (!examTarget?.is_active) {
    return 1;
  }

  const daysUntilExam = (examTarget.target_date - now) / DAY_MS;
  const retentionBonus = Math.max(0, (examTarget.target_retention ?? 0.95) - 0.9) * 4;

  if (daysUntilExam <= 0) return 2.6 + retentionBonus;
  if (daysUntilExam <= 7) return 2.2 + retentionBonus;
  if (daysUntilExam <= 30) return 1.7 + retentionBonus;
  if (daysUntilExam <= 90) return 1.25 + retentionBonus;
  return 1;
}

function buildPriorityScore(
  card: Card,
  now: number,
  preferences: ReviewPlannerPreferences,
  examTarget: ExamTarget | null | undefined,
): number {
  let score = 0;

  if (card.relearning_step !== null) {
    score += 1_000_000;
  }

  const overdueDays = getOverdueDays(card, now);
  const weaknessScore = getWeaknessScore(card);

  score += overdueDays * 100;

  if (preferences.prioritizeWeak) {
    score += weaknessScore * 40;
  }

  if (preferences.prioritizeNearExam && examTarget?.is_active) {
    const urgency = getExamUrgencyMultiplier(examTarget, now);
    score += overdueDays * urgency * 40;
    score += weaknessScore * urgency * 30;
  }

  return score;
}

export function buildReviewQueue({
  cards,
  now = Date.now(),
  preferences = DEFAULT_REVIEW_PLANNER_PREFERENCES,
  examTarget = null,
}: ReviewPlannerInput): ReviewPlannerResult {
  const mergedPreferences: ReviewPlannerPreferences = {
    ...DEFAULT_REVIEW_PLANNER_PREFERENCES,
    ...preferences,
  };

  const dueCards = cards.filter((card) => isDue(card.next_review_at, now));
  const baseOrder = sortByPriority(dueCards);

  const useExamTargetOrdering = mergedPreferences.prioritizeNearExam && Boolean(examTarget?.is_active);
  const useWeakOrdering = mergedPreferences.prioritizeWeak;

  if (!useExamTargetOrdering && !useWeakOrdering) {
    return {
      cards: baseOrder,
      strategy: 'default',
      appliedRules: [],
      examTarget: examTarget
        ? {
            id: examTarget.id,
            title: examTarget.title,
            target_date: examTarget.target_date,
            target_retention: examTarget.target_retention,
          }
        : null,
    };
  }

  const baseRank = new Map(baseOrder.map((card, index) => [card.id, index]));

  const orderedCards = [...dueCards].sort((left, right) => {
    const rightScore = buildPriorityScore(right, now, mergedPreferences, examTarget);
    const leftScore = buildPriorityScore(left, now, mergedPreferences, examTarget);

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return (baseRank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (baseRank.get(right.id) ?? Number.MAX_SAFE_INTEGER);
  });

  const appliedRules: string[] = [];
  if (useWeakOrdering) appliedRules.push('prioritize_weak');
  if (useExamTargetOrdering) appliedRules.push('prioritize_near_exam');

  return {
    cards: orderedCards,
    strategy: useWeakOrdering && useExamTargetOrdering
      ? 'weak-first-exam-target'
      : useExamTargetOrdering
        ? 'exam-target'
        : 'weak-first',
    appliedRules,
    examTarget: examTarget
      ? {
          id: examTarget.id,
          title: examTarget.title,
          target_date: examTarget.target_date,
          target_retention: examTarget.target_retention,
        }
      : null,
  };
}
