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
  formatInterval,
  INITIAL_DIFFICULTY,
} from './fsrs';

import {
  DEFAULT_WEIGHTS,
  DEFAULT_RETENTION,
} from './fsrs-weights';

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
