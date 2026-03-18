/**
 * FSRS Algorithm Tests
 * 
 * Tests for the enhanced FSRS-5 implementation including:
 * - Trainable weights
 * - Power law retrievability
 * - Spacing effect bonus
 * - Desired retention intervals
 */

import {
  calculateRetrievability,
  calculateIntervalForRetention,
  calculateStabilityIncrease,
  calculateInitialStability,
  updateDifficulty,
  processReview,
  DEFAULT_CONFIG,
  formatInterval,
  getIntervalPreviews,
  INITIAL_DIFFICULTY,
} from '../index';

import {
  DEFAULT_WEIGHTS,
} from '../weights';

// ============================================================================
// RETRIEVABILITY TESTS
// ============================================================================

describe('calculateRetrievability', () => {
  test('returns 1 for immediate review (0 days)', () => {
    const r = calculateRetrievability(10, 0);
    expect(r).toBe(1);
  });

  test('returns 0 for stability of 0', () => {
    const r = calculateRetrievability(0, 5);
    expect(r).toBe(0);
  });

  test('returns ~0.9 when days equals stability', () => {
    // At t = S, R should be approximately 0.9 (by FSRS design)
    const stability = 10;
    const r = calculateRetrievability(stability, stability);
    expect(r).toBeGreaterThan(0.85);
    expect(r).toBeLessThan(0.95);
  });

  test('retrievability decreases over time', () => {
    const stability = 5;
    const r1 = calculateRetrievability(stability, 1);
    const r2 = calculateRetrievability(stability, 3);
    const r3 = calculateRetrievability(stability, 5);
    
    expect(r1).toBeGreaterThan(r2);
    expect(r2).toBeGreaterThan(r3);
  });

  test('higher stability means slower decay', () => {
    const days = 5;
    const rLowS = calculateRetrievability(3, days);
    const rHighS = calculateRetrievability(10, days);
    
    expect(rHighS).toBeGreaterThan(rLowS);
  });
});

// ============================================================================
// INTERVAL CALCULATION TESTS
// ============================================================================

describe('calculateIntervalForRetention', () => {
  test('higher desired retention = shorter interval', () => {
    const stability = 10;
    const interval95 = calculateIntervalForRetention(stability, 0.95);
    const interval85 = calculateIntervalForRetention(stability, 0.85);
    
    expect(interval95).toBeLessThan(interval85);
  });

  test('with 90% retention, interval roughly equals stability', () => {
    const stability = 10;
    const interval = calculateIntervalForRetention(stability, 0.9);
    
    // Should be close to stability (within 20%)
    expect(interval).toBeGreaterThan(stability * 0.8);
    expect(interval).toBeLessThan(stability * 1.2);
  });

  test('returns minimum interval for zero stability', () => {
    const interval = calculateIntervalForRetention(0, 0.9);
    expect(interval).toBeGreaterThan(0);
  });
});

// ============================================================================
// SPACING EFFECT TESTS (THE CORE INNOVATION)
// ============================================================================

describe('calculateStabilityIncrease (Spacing Effect)', () => {
  const defaultParams = {
    difficulty: INITIAL_DIFFICULTY,
    stability: 5,
    grade: 2 as const,
    weights: DEFAULT_WEIGHTS,
  };

  test('LOW retrievability = BIGGER stability boost (Spacing Effect!)', () => {
    // This is THE key feature of FSRS
    const lowR = 0.3;  // Card almost forgotten
    const highR = 0.9; // Card still fresh
    
    const sIncLowR = calculateStabilityIncrease(
      defaultParams.difficulty,
      defaultParams.stability,
      lowR,
      defaultParams.grade,
      defaultParams.weights
    );
    
    const sIncHighR = calculateStabilityIncrease(
      defaultParams.difficulty,
      defaultParams.stability,
      highR,
      defaultParams.grade,
      defaultParams.weights
    );
    
    // Spacing Effect: reviewing at low R gives MUCH bigger boost
    expect(sIncLowR).toBeGreaterThan(sIncHighR);
    expect(sIncLowR / sIncHighR).toBeGreaterThan(2); // At least 2x boost
  });

  test('stability increase is always >= 1', () => {
    const sInc = calculateStabilityIncrease(5, 1, 0.9, 2, DEFAULT_WEIGHTS);
    expect(sInc).toBeGreaterThanOrEqual(1);
  });

  test('mature card with high retrievability can have only a small gain', () => {
    const sInc = calculateStabilityIncrease(5, 120, 0.99, 2, DEFAULT_WEIGHTS);
    expect(sInc).toBeLessThan(1.1);
  });

  test('Easy grade gives bigger boost than Good', () => {
    const sIncGood = calculateStabilityIncrease(5, 5, 0.7, 2, DEFAULT_WEIGHTS);
    const sIncEasy = calculateStabilityIncrease(5, 5, 0.7, 3, DEFAULT_WEIGHTS);
    
    expect(sIncEasy).toBeGreaterThan(sIncGood);
  });

  test('Hard grade gives smaller boost than Good', () => {
    const sIncGood = calculateStabilityIncrease(5, 5, 0.7, 2, DEFAULT_WEIGHTS);
    const sIncHard = calculateStabilityIncrease(5, 5, 0.7, 1, DEFAULT_WEIGHTS);
    
    expect(sIncHard).toBeLessThan(sIncGood);
  });

  test('harder cards (high D) grow stability slower', () => {
    const sIncEasyCard = calculateStabilityIncrease(2, 5, 0.7, 2, DEFAULT_WEIGHTS);
    const sIncHardCard = calculateStabilityIncrease(8, 5, 0.7, 2, DEFAULT_WEIGHTS);
    
    expect(sIncEasyCard).toBeGreaterThan(sIncHardCard);
  });
});

// ============================================================================
// INITIAL STABILITY TESTS
// ============================================================================

describe('calculateInitialStability', () => {
  test('Easy grade gives highest initial stability', () => {
    const sAgain = calculateInitialStability(0, DEFAULT_WEIGHTS);
    const sHard = calculateInitialStability(1, DEFAULT_WEIGHTS);
    const sGood = calculateInitialStability(2, DEFAULT_WEIGHTS);
    const sEasy = calculateInitialStability(3, DEFAULT_WEIGHTS);
    
    expect(sEasy).toBeGreaterThan(sGood);
    expect(sGood).toBeGreaterThan(sHard);
    expect(sHard).toBeGreaterThan(sAgain);
  });
});

// ============================================================================
// DIFFICULTY UPDATE TESTS
// ============================================================================

describe('updateDifficulty', () => {
  test('Easy grade decreases difficulty', () => {
    const newD = updateDifficulty(5, 3, DEFAULT_WEIGHTS);
    expect(newD).toBeLessThan(5);
  });

  test('Again grade increases difficulty', () => {
    const newD = updateDifficulty(5, 0, DEFAULT_WEIGHTS);
    expect(newD).toBeGreaterThan(5);
  });

  test('difficulty stays within bounds', () => {
    const dFromMax = updateDifficulty(10, 0, DEFAULT_WEIGHTS);
    const dFromMin = updateDifficulty(1, 3, DEFAULT_WEIGHTS);
    
    expect(dFromMax).toBeLessThanOrEqual(10);
    expect(dFromMin).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// FULL REVIEW PROCESSING TESTS
// ============================================================================

describe('processReview', () => {
  test('first Good review gives initial stability from weights', () => {
    const result = processReview({}, 2);
    
    expect(result.newState.stability).toBeCloseTo(DEFAULT_WEIGHTS.w2, 1);
    expect(result.newState.step).toBe(1);
  });

  test('first Easy review gives higher stability than Good', () => {
    const resultGood = processReview({}, 2);
    const resultEasy = processReview({}, 3);
    
    expect(resultEasy.newState.stability).toBeGreaterThan(resultGood.newState.stability);
  });

  test('Again (grade 0) enters relearning mode', () => {
    const result = processReview({ stability: 5 }, 0);
    
    expect(result.newState.relearning_step).toBe(0);
    expect(result.newState.lapses).toBe(1);
  });

  test('multiple lapses trigger leech detection', () => {
    const result = processReview({ stability: 5, lapses: 7 }, 0);
    
    expect(result.becameLeech).toBe(true);
    expect(result.newState.is_leech).toBe(true);
    expect(result.newState.lapses).toBe(8);
  });

  test('desired retention affects intervals', () => {
    const state = { stability: 10 };
    
    const result95 = processReview(state, 2, Date.now(), {
      weights: DEFAULT_WEIGHTS,
      desiredRetention: 0.95,
    });
    
    const result85 = processReview(state, 2, Date.now(), {
      weights: DEFAULT_WEIGHTS,
      desiredRetention: 0.85,
    });
    
    expect(result95.intervalDays).toBeLessThan(result85.intervalDays);
  });

  test('returns retrievability at review time', () => {
    const now = Date.now();
    const lastReview = now - 5 * 24 * 60 * 60 * 1000; // 5 days ago
    
    const result = processReview({
      stability: 10,
      last_review_at: lastReview,
    }, 2, now);
    
    expect(result.retrievability).toBeGreaterThan(0);
    expect(result.retrievability).toBeLessThan(1);
  });
});

// ============================================================================
// RELEARNING TESTS
// ============================================================================

describe('processReview (relearning)', () => {
  test('completing relearning steps exits relearning', () => {
    const result = processReview({
      stability: 0.5,
      relearning_step: 2, // Last step
    }, 2);
    
    expect(result.newState.relearning_step).toBeNull();
  });

  test('completing relearning preserves post-lapse stability', () => {
    const postLapseStability = 0.63;
    const result = processReview({
      stability: postLapseStability,
      difficulty: 7,
      lapses: 1,
      relearning_step: 2, // Last step
    }, 2, Date.now(), DEFAULT_CONFIG, false);

    expect(result.newState.relearning_step).toBeNull();
    expect(result.newState.stability).toBeCloseTo(postLapseStability, 2);
    expect(result.newState.stability).toBeLessThan(DEFAULT_WEIGHTS.w2);
  });

  test('failing during relearning restarts from step 0', () => {
    const result = processReview({
      stability: 0.5,
      relearning_step: 1,
    }, 0);
    
    expect(result.newState.relearning_step).toBe(0);
  });
});

// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

describe('formatInterval', () => {
  test('formats minutes correctly', () => {
    expect(formatInterval(1 / (24 * 60))).toMatch(/1 min/);
    expect(formatInterval(10 / (24 * 60))).toMatch(/10 min/);
  });

  test('formats hours correctly', () => {
    expect(formatInterval(2 / 24)).toMatch(/2 h/);
  });

  test('formats days correctly', () => {
    expect(formatInterval(1)).toMatch(/1 d/);
    expect(formatInterval(5)).toMatch(/5 d/);
  });

  test('formats weeks correctly', () => {
    expect(formatInterval(14)).toMatch(/2 sem/);
  });

  test('formats months correctly', () => {
    expect(formatInterval(60)).toMatch(/2 mês/);
  });
});

// ============================================================================
// WEIGHTS VALIDATION
// ============================================================================

describe('DEFAULT_WEIGHTS', () => {
  test('all weights are defined', () => {
    for (let i = 0; i <= 16; i++) {
      const key = `w${i}` as keyof typeof DEFAULT_WEIGHTS;
      expect(DEFAULT_WEIGHTS[key]).toBeDefined();
      expect(typeof DEFAULT_WEIGHTS[key]).toBe('number');
    }
  });

  test('initial stability weights are positive', () => {
    expect(DEFAULT_WEIGHTS.w0).toBeGreaterThan(0);
    expect(DEFAULT_WEIGHTS.w1).toBeGreaterThan(0);
    expect(DEFAULT_WEIGHTS.w2).toBeGreaterThan(0);
    expect(DEFAULT_WEIGHTS.w3).toBeGreaterThan(0);
  });
});

// ============================================================================
// D_DEFAULT (w4) AND MEAN REVERSION TESTS
// ============================================================================

describe('updateDifficulty (D_default from w4)', () => {
  test('changing w4 shifts the mean reversion target', () => {
    const customWeights = { ...DEFAULT_WEIGHTS, w4: 3.0 };
    const d1 = updateDifficulty(5, 2, DEFAULT_WEIGHTS); // Good grade, D0=4.93
    const d2 = updateDifficulty(5, 2, customWeights);    // Good grade, D0=3.0

    // With lower D0, difficulty should be pulled lower
    expect(d2).toBeLessThan(d1);
  });

  test('mean reversion pulls toward D_default (w4)', () => {
    // With D=8 (high) and Good grade (no delta), D should decrease toward w4
    const newD = updateDifficulty(8, 2, DEFAULT_WEIGHTS);
    expect(newD).toBeLessThan(8);
    // Should be pulled toward w4 (4.93)
    expect(newD).toBeGreaterThan(DEFAULT_WEIGHTS.w4);
  });
});

// ============================================================================
// w16 EASY MULTIPLIER TESTS
// ============================================================================

describe('calculateStabilityIncrease (w16 Easy multiplier)', () => {
  test('w16 > 1 makes Easy SInc larger than Good SInc', () => {
    // w16 = 2.61 means Easy gets ~2.61x the SInc increase portion
    const sIncGood = calculateStabilityIncrease(5, 5, 0.7, 2, DEFAULT_WEIGHTS);
    const sIncEasy = calculateStabilityIncrease(5, 5, 0.7, 3, DEFAULT_WEIGHTS);
    expect(sIncEasy).toBeGreaterThan(sIncGood);
  });

  test('changing w16 changes Easy boost', () => {
    const lowW16 = { ...DEFAULT_WEIGHTS, w16: 1.5 };
    const highW16 = { ...DEFAULT_WEIGHTS, w16: 3.0 };
    const sIncLow = calculateStabilityIncrease(5, 5, 0.7, 3, lowW16);
    const sIncHigh = calculateStabilityIncrease(5, 5, 0.7, 3, highW16);
    expect(sIncHigh).toBeGreaterThan(sIncLow);
  });

  test('w15 < 1 makes Hard SInc smaller than Good SInc', () => {
    // w15 = 0.35 means Hard gets only 35% of the SInc increase portion
    const sIncGood = calculateStabilityIncrease(5, 5, 0.7, 2, DEFAULT_WEIGHTS);
    const sIncHard = calculateStabilityIncrease(5, 5, 0.7, 1, DEFAULT_WEIGHTS);
    expect(sIncHard).toBeLessThan(sIncGood);
  });
});

// ============================================================================
// DETERMINISTIC PREVIEW TESTS
// ============================================================================

describe('getIntervalPreviews (deterministic)', () => {
  test('previews are identical across multiple calls', () => {
    const state = { stability: 10, difficulty: 5 };
    const p1 = getIntervalPreviews(state);
    const p2 = getIntervalPreviews(state);
    expect(p1[1]).toBe(p2[1]);
    expect(p1[2]).toBe(p2[2]);
    expect(p1[3]).toBe(p2[3]);
  });

  test('previews respect relearning steps', () => {
    const state = { stability: 0.63, difficulty: 7, relearning_step: 1 };
    const previews = getIntervalPreviews(state, DEFAULT_CONFIG);

    expect(previews[0]).toBe('1 min');
    expect(previews[1]).toBe('2 h');
    expect(previews[2]).toBe('2 h');
    expect(previews[3]).toBe('2 h');
  });
});

describe('processReview applyFuzz', () => {
  test('applyFuzz=false gives deterministic intervals', () => {
    const state = { stability: 10, difficulty: 5 };
    const r1 = processReview(state, 2, Date.now(), undefined, false);
    const r2 = processReview(state, 2, Date.now(), undefined, false);
    expect(r1.intervalDays).toBe(r2.intervalDays);
  });
});
