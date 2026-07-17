import { describe, expect, it } from 'vitest';
import {
  calculateMetrics,
  optimizeWeights,
  preparePredictions,
  preparePredictionsWithWeights,
  type ReviewRecord,
} from '../optimizer';
import { DEFAULT_WEIGHTS } from '../weights';

const DAY = 24 * 60 * 60 * 1000;
const START = 1_704_067_200_000;

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    cardId: 'card_1',
    grade: 2,
    difficultyBefore: 5,
    stabilityBefore: 5,
    intervalDays: 5,
    reviewedAt: START,
    success: true,
    ...overrides,
  };
}

describe('FSRS optimizer personalization', () => {
  it('uses the current review stability to predict recall', () => {
    const predictions = preparePredictions([
      review({ reviewedAt: START, stabilityBefore: 1 }),
      review({ reviewedAt: START + DAY, stabilityBefore: 30 }),
    ]);

    expect(predictions).toHaveLength(1);
    expect(predictions[0].predictedR).toBeGreaterThan(0.98);
  });

  it('replays history with candidate weights', () => {
    const fastGrowthWeights = { ...DEFAULT_WEIGHTS, w2: 10, w6: 3 };
    const slowGrowthWeights = { ...DEFAULT_WEIGHTS, w2: 0.5, w6: 0.1 };
    const history = [
      review({ cardId: 'card_1', grade: 2, reviewedAt: START }),
      review({ cardId: 'card_1', grade: 0, success: false, reviewedAt: START + 20 * DAY }),
      review({ cardId: 'card_2', grade: 2, reviewedAt: START }),
      review({ cardId: 'card_2', grade: 0, success: false, reviewedAt: START + 20 * DAY }),
    ];

    const fastLoss = calculateMetrics(history, fastGrowthWeights).logLoss;
    const slowLoss = calculateMetrics(history, slowGrowthWeights).logLoss;

    expect(fastLoss).not.toBe(slowLoss);
    expect(preparePredictionsWithWeights(history, fastGrowthWeights)).toHaveLength(2);
  });

  it('optimizes weights toward a user-specific review pattern', async () => {
    const history: ReviewRecord[] = [];
    for (let card = 0; card < 40; card++) {
      history.push(review({ cardId: `card_${card}`, grade: 2, reviewedAt: START }));
      history.push(review({
        cardId: `card_${card}`,
        grade: 0,
        success: false,
        reviewedAt: START + 30 * DAY,
      }));
      history.push(review({
        cardId: `card_${card}`,
        grade: 2,
        success: true,
        reviewedAt: START + 31 * DAY,
      }));
    }

    const before = calculateMetrics(history, DEFAULT_WEIGHTS).logLoss;
    const result = await optimizeWeights(history, DEFAULT_WEIGHTS, 8);

    expect(result.metrics.sampleSize).toBeGreaterThan(0);
    expect(result.metrics.logLoss).toBeLessThanOrEqual(before);
    expect(result.weights).not.toEqual(DEFAULT_WEIGHTS);
  });
});
