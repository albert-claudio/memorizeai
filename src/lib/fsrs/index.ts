/**
 * FSRS - Free Spaced Repetition Scheduler (Enhanced)
 * 
 * Implementation of DSR model (Difficulty, Stability, Retrievability)
 * with trainable weights (FSRS-5), spacing effect bonus, and
 * desired retention support.
 * 
 * Key improvements:
 * - Power law decay for retrievability
 * - Spacing Effect: bigger stability boost when R is low
 * - Trainable weights per user
 * - Desired retention slider support
 */

import {
  type FSRSWeights,
  DEFAULT_WEIGHTS,
  DEFAULT_RETENTION,
  DECAY,
  FACTOR,
  clampRetention,
} from './weights';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Initial difficulty for new cards (1-10 scale) */
export const INITIAL_DIFFICULTY = 5.0;

/** Minimum difficulty (1 = very easy) */
export const MIN_DIFFICULTY = 1.0;

/** Maximum difficulty (10 = very hard) */
export const MAX_DIFFICULTY = 10.0;

/** Initial stability in days for new cards */
export const INITIAL_STABILITY = 0;

/** Number of lapses to trigger early struggle warning (AI analysis) */
export const STRUGGLE_THRESHOLD = 3;

/** Number of lapses to mark a card as full leech */
export const LEECH_THRESHOLD = 8;

/** Relearning steps in minutes [1min, 10min, 2 hours] */
export const RELEARNING_STEPS = [1, 10, 120];

/** Maximum interval in days */
export const MAX_INTERVAL = 36500; // ~100 years

/** Minimum interval in days */
export const MIN_INTERVAL = 1 / 24; // 1 hour

/** Fuzz factor range to prevent cards bunching up on same day */
export const FUZZ_RANGE = 0.05; // ±5%

/** Mean reversion rate for difficulty updates.
 *  Controls how strongly difficulty is pulled back toward D_default (w4).
 *  Future: make this a trainable weight instead of a constant. */
export const MEAN_REVERSION_RATE = 0.1;

// ============================================================================
// TYPES
// ============================================================================

/** Grade options for review response */
export type Grade = 0 | 1 | 2 | 3;

export const GRADE_LABELS: Record<Grade, string> = {
  0: 'Errei',
  1: 'Difícil',
  2: 'Bom',
  3: 'Fácil',
};

export interface SRSState {
  difficulty: number;
  stability: number;
  ease_factor: number;  // Legacy - kept for compatibility
  lapses: number;
  is_leech: boolean;
  next_review_at: number;
  last_review_at: number;
  relearning_step: number | null;
  step: number;
}

export interface ReviewResult {
  newState: SRSState;
  intervalDays: number;
  becameLeech: boolean;
  becameStruggle: boolean;  // True when lapses hit STRUGGLE_THRESHOLD (3)
  retrievability: number;   // R at time of review (for analytics)
  stabilityIncrease: number; // SInc factor applied (for analytics)
}

export interface FSRSConfig {
  weights: FSRSWeights;
  desiredRetention: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_CONFIG: FSRSConfig = {
  weights: DEFAULT_WEIGHTS,
  desiredRetention: DEFAULT_RETENTION,
};

// ============================================================================
// CORE FUNCTIONS - DSR MODEL
// ============================================================================

/**
 * Calculate Retrievability (R) - the probability of recall
 * 
 * Uses FSRS-5 power law decay formula:
 * R(t, S) = (1 + FACTOR × t/S)^DECAY
 * 
 * Where:
 * - t = days since last review
 * - S = stability (days until ~90% retention)
 * - DECAY = -0.5 (controls decay curve shape)
 * - FACTOR = 19/81 ≈ 0.2346
 * 
 * @returns Value between 0 and 1
 */
export function calculateRetrievability(
  stability: number,
  daysSinceReview: number
): number {
  if (stability <= 0) return 0;
  if (daysSinceReview <= 0) return 1;
  
  // Power law decay: R = (1 + FACTOR × t/S)^DECAY
  const r = Math.pow(1 + FACTOR * daysSinceReview / stability, DECAY);
  return Math.max(0, Math.min(1, r));
}

/**
 * Calculate interval for a desired retention level
 * 
 * Rearranging R = (1 + FACTOR × t/S)^DECAY:
 * t = S/FACTOR × (R^(1/DECAY) - 1)
 * 
 * Higher desired retention = shorter intervals
 * Lower desired retention = longer intervals
 */
export function calculateIntervalForRetention(
  stability: number,
  desiredRetention: number = DEFAULT_RETENTION
): number {
  if (stability <= 0) return MIN_INTERVAL;
  
  const retention = clampRetention(desiredRetention);
  
  // Solve for t when R = desiredRetention
  const interval = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  
  return Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, interval));
}

/**
 * Calculate initial stability for new cards based on grade
 * 
 * Uses weights w0-w3 for initial stability values.
 */
export function calculateInitialStability(
  grade: Grade,
  weights: FSRSWeights = DEFAULT_WEIGHTS
): number {
  const initialStabilities: Record<Grade, number> = {
    0: weights.w0,  // Again
    1: weights.w1,  // Hard
    2: weights.w2,  // Good
    3: weights.w3,  // Easy
  };
  
  return initialStabilities[grade];
}

/**
 * Calculate Stability Increase (SInc) after successful recall
 * 
 * THE KEY INNOVATION - SPACING EFFECT:
 * When retrievability (R) is LOW (card almost forgotten),
 * stability increases MORE. This is scientifically proven
 * to maximize long-term retention.
 * 
 * Formula: SInc = e^w6 × (11-D)^w7 × S^(-w8) × (e^(w9×(1-R)) - 1)
 *                                              ↑↑↑ SPACING EFFECT ↑↑↑
 * 
 * Where:
 * - D = difficulty (1-10)
 * - S = current stability
 * - R = retrievability at review time
 * - w6-w9 = trainable weights
 */
export function calculateStabilityIncrease(
  difficulty: number,
  stability: number,
  retrievability: number,
  grade: Grade,
  weights: FSRSWeights = DEFAULT_WEIGHTS
): number {
  const { w6, w7, w8, w9, w15, w16 } = weights;
  
  // Clamp values for safety
  const D = Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, difficulty));
  const S = Math.max(0.01, stability);
  const R = Math.max(0.01, Math.min(0.99, retrievability));
  
  // SPACING EFFECT: When R is low, (1-R) is high, giving a bigger boost
  const spacingBonus = Math.exp(w9 * (1 - R)) - 1;
  
  // Difficulty factor: easier cards (low D) grow faster
  const difficultyFactor = Math.pow(11 - D, w7);
  
  // Stability factor: higher current stability = slower relative growth
  const stabilityFactor = Math.pow(S, -w8);
  
  // Base stability increase multiplier
  const baseIncrease = Math.exp(w6) * difficultyFactor * stabilityFactor * spacingBonus;
  
  // SInc = 1 + baseIncrease (stability can't decrease on success)
  let sInc = 1 + baseIncrease;
  
  // Grade modifiers (FSRS convention: w15=Hard penalty, w16=Easy bonus)
  if (grade === 1) {
    // Hard: reduce the increase portion
    sInc = 1 + (sInc - 1) * w15;
  } else if (grade === 3) {
    // Easy: boost the increase with w16 multiplier
    sInc = 1 + (sInc - 1) * w16;
  }
  
  // Successful recall should never reduce stability, but can yield only a tiny gain.
  return Math.max(1.0, sInc);
}


/**
 * Calculate new stability after lapse (grade = 0)
 * 
 * When a card is forgotten, stability is reduced but not reset to zero.
 * This preserves some learning from previous reviews.
 */
export function calculateStabilityAfterLapse(
  stability: number,
  difficulty: number,
  retrievability: number,
  weights: FSRSWeights = DEFAULT_WEIGHTS
): number {
  const { w10, w11, w12, w13 } = weights;
  
  const D = Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, difficulty));
  const S = Math.max(0.1, stability);
  const R = Math.max(0, Math.min(1, retrievability));
  
  // Stability decrease formula
  const newStability = w10 
    * Math.pow(D, w12) 
    * Math.pow(S + 1, -w13) 
    * Math.pow(Math.exp(1 - R), w11);
  
  // Minimum stability after lapse (about 1 day)
  return Math.max(weights.w0, newStability);
}

/**
 * Update difficulty based on grade
 * 
 * Difficulty adjusts based on performance with mean reversion:
 * D' = w4 - exp(w5 × (g - 2)) + D × (1 - meanReversion)
 * 
 * This ensures:
 * - Easy cards gradually become easier
 * - Hard cards stay challenging
 * - Extreme values regress toward the mean
 */
export function updateDifficulty(
  currentDifficulty: number,
  grade: Grade,
  weights: FSRSWeights = DEFAULT_WEIGHTS
): number {
  const { w4, w5 } = weights;
  
  // D_default: the baseline difficulty from trainable weights (w4).
  // FSRS uses this as the equilibrium point that difficulty reverts toward.
  const D_default = w4;
  
  // Grade adjustment: 0=-2, 1=-1, 2=0, 3=1
  const gradeOffset = grade - 2;
  
  // Calculate temporary difficulty with grade-based delta
  const delta = -w5 * gradeOffset;
  const Dtemp = currentDifficulty + delta;
  
  // Mean reversion: interpolate toward D_default
  // D' = meanRev * D_default + (1 - meanRev) * Dtemp
  const newDifficulty = MEAN_REVERSION_RATE * D_default + (1 - MEAN_REVERSION_RATE) * Dtemp;
  
  return Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, newDifficulty));
}

// ============================================================================
// MAIN REVIEW PROCESSING
// ============================================================================

/**
 * Process a review and calculate new SRS state
 * 
 * This is the main entry point for the FSRS algorithm.
 * 
 * Enhanced features:
 * - Struggle detection at 3 lapses (early AI intervention)
 * - Leech detection at 8 lapses (full atomization)
 * - Fuzz factor to prevent card bunching
 * - Analytics tracking (retrievability, stability increase)
 */
export function processReview(
  currentState: Partial<SRSState>,
  grade: Grade,
  now: number = Date.now(),
  config: FSRSConfig = DEFAULT_CONFIG,
  applyFuzz: boolean = true
): ReviewResult {
  const { weights, desiredRetention } = config;
  
  // Initialize state with defaults
  const state: SRSState = {
    difficulty: currentState.difficulty ?? INITIAL_DIFFICULTY,
    stability: currentState.stability ?? INITIAL_STABILITY,
    ease_factor: currentState.ease_factor ?? 2.5,  // Legacy
    lapses: currentState.lapses ?? 0,
    is_leech: currentState.is_leech ?? false,
    next_review_at: currentState.next_review_at ?? now,
    last_review_at: currentState.last_review_at ?? now,
    relearning_step: currentState.relearning_step ?? null,
    step: currentState.step ?? 0,
  };

  let becameLeech = false;
  let becameStruggle = false;
  let stabilityIncrease = 1.0;

  // Handle relearning mode
  if (state.relearning_step !== null) {
    return processRelearningReview(state, grade, now, config);
  }

  // Calculate time since last review
  const daysSinceReview = (now - state.last_review_at) / (24 * 60 * 60 * 1000);
  
  // Calculate current retrievability
  const retrievability = state.stability > 0
    ? calculateRetrievability(state.stability, daysSinceReview)
    : 0;

  // Update difficulty based on grade
  const newDifficulty = updateDifficulty(state.difficulty, grade, weights);
  
  let newStability: number;
  let newLapses = state.lapses;
  let newRelearningStep: number | null = null;
  let newStep = state.step;

  if (grade === 0) {
    // LAPSE: Card was forgotten
    newLapses = state.lapses + 1;
    
    if (state.stability > 0) {
      // Reduce stability but preserve some learning
      newStability = calculateStabilityAfterLapse(
        state.stability,
        state.difficulty,
        retrievability,
        weights
      );
    } else {
      // First review, lapse
      newStability = weights.w0;
    }
    
    newRelearningStep = 0; // Start relearning
    
    // Check for struggle (early warning at 3 lapses)
    if (newLapses === STRUGGLE_THRESHOLD && !state.is_leech) {
      becameStruggle = true;
    }
    
    // Check for leech (full atomization at 8 lapses)
    if (newLapses >= LEECH_THRESHOLD && !state.is_leech) {
      becameLeech = true;
    }
  } else if (grade === 1) {
    // HARD: Recall with difficulty - smaller stability boost
    if (state.stability === 0) {
      newStability = calculateInitialStability(grade, weights);
    } else {
      stabilityIncrease = calculateStabilityIncrease(
        state.difficulty,
        state.stability,
        retrievability,
        grade,
        weights
      );
      newStability = state.stability * stabilityIncrease;
    }
    newStep = state.step + 1;
  } else {
    // GOOD (2) or EASY (3): Successful recall
    if (state.stability === 0) {
      // First successful review - use initial stability
      newStability = calculateInitialStability(grade, weights);
    } else {
      // Subsequent reviews - apply SInc with spacing effect
      stabilityIncrease = calculateStabilityIncrease(
        state.difficulty,
        state.stability,
        retrievability,
        grade,
        weights
      );
      newStability = state.stability * stabilityIncrease;
    }
    newStep = state.step + 1;
  }

  // Calculate interval based on desired retention
  let intervalDays = grade === 0
    ? RELEARNING_STEPS[0] / (24 * 60) // First relearning step
    : calculateIntervalForRetention(newStability, desiredRetention);

  // Apply fuzz factor to prevent cards bunching up on same day
  // Only for intervals > 2 days to avoid affecting short-term reviews
  // Disabled for previews (applyFuzz=false) to keep UI deterministic
  if (applyFuzz && intervalDays > 2) {
    const fuzz = 1 + (Math.random() * 2 - 1) * FUZZ_RANGE;
    intervalDays = intervalDays * fuzz;
  }

  const nextReviewAt = now + intervalDays * 24 * 60 * 60 * 1000;

  return {
    newState: {
      difficulty: newDifficulty,
      stability: newStability,
      ease_factor: state.ease_factor,  // Legacy field
      lapses: newLapses,
      is_leech: state.is_leech || becameLeech,
      next_review_at: nextReviewAt,
      last_review_at: now,
      relearning_step: newRelearningStep,
      step: newStep,
    },
    intervalDays,
    becameLeech,
    becameStruggle,
    retrievability,
    stabilityIncrease,
  };
}


/**
 * Process a review while in relearning mode
 * 
 * User must pass through relearning steps to exit relearning mode.
 */
function processRelearningReview(
  state: SRSState,
  grade: Grade,
  now: number,
  config: FSRSConfig
): ReviewResult {
  const { weights, desiredRetention } = config;
  const currentStep = state.relearning_step ?? 0;

  if (grade === 0) {
    // Failed again: restart relearning
    const intervalMinutes = RELEARNING_STEPS[0];
    const nextReviewAt = now + intervalMinutes * 60 * 1000;

    return {
      newState: {
        ...state,
        relearning_step: 0,
        next_review_at: nextReviewAt,
        last_review_at: now,
      },
      intervalDays: intervalMinutes / (24 * 60),
      becameLeech: false,
      becameStruggle: false,
      retrievability: 0,
      stabilityIncrease: 1.0,
    };
  }

  // Passed: advance to next relearning step
  const nextStep = currentStep + 1;

  if (nextStep >= RELEARNING_STEPS.length) {
    // Completed relearning: keep the post-lapse stability instead of resetting
    // the card to "new Good". This preserves the forgetting event in the schedule.
    const stabilizedState = Math.max(weights.w0, state.stability);
    const intervalDays = calculateIntervalForRetention(stabilizedState, desiredRetention);
    const nextReviewAt = now + intervalDays * 24 * 60 * 60 * 1000;

    return {
      newState: {
        ...state,
        stability: stabilizedState,
        relearning_step: null, // Exit relearning
        next_review_at: nextReviewAt,
        last_review_at: now,
        step: state.step + 1,
      },
      intervalDays,
      becameLeech: false,
      becameStruggle: false,
      retrievability: 0,
      stabilityIncrease: 1.0,
    };
  }

  // Continue to next relearning step
  const intervalMinutes = RELEARNING_STEPS[nextStep];
  const nextReviewAt = now + intervalMinutes * 60 * 1000;

  return {
    newState: {
      ...state,
      relearning_step: nextStep,
      next_review_at: nextReviewAt,
      last_review_at: now,
    },
    intervalDays: intervalMinutes / (24 * 60),
    becameLeech: false,
    becameStruggle: false,
    retrievability: 0,
    stabilityIncrease: 1.0,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format interval for display
 * Examples: "1 min", "10 min", "2 h", "1 d", "3 d", "2 sem", "1 mês"
 */
export function formatInterval(days: number): string {
  const minutes = days * 24 * 60;
  
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  
  const hours = days * 24;
  if (hours < 24) {
    return `${Math.round(hours)} h`;
  }
  
  if (days < 7) {
    return `${Math.round(days)} d`;
  }
  
  const weeks = days / 7;
  if (weeks < 4) {
    return `${Math.round(weeks)} sem`;
  }
  
  const months = days / 30;
  if (months < 12) {
    return `${Math.round(months)} mês`;
  }
  
  const years = days / 365;
  return `${years.toFixed(1)} ano`;
}

/**
 * Get preview of next intervals for each grade
 */
export function getIntervalPreviews(
  currentState: Partial<SRSState>,
  config: FSRSConfig = DEFAULT_CONFIG
): Record<Grade, string> {
  const now = Date.now();
  
  return {
    0: formatInterval(RELEARNING_STEPS[0] / (24 * 60)),
    1: formatInterval(processReview(currentState, 1, now, config, false).intervalDays),
    2: formatInterval(processReview(currentState, 2, now, config, false).intervalDays),
    3: formatInterval(processReview(currentState, 3, now, config, false).intervalDays),
  };
}

/**
 * Check if a card is due for review
 */
export function isDue(nextReviewAt: number | null, now: number = Date.now()): boolean {
  if (nextReviewAt === null) return true; // New card
  return now >= nextReviewAt;
}

/**
 * Sort cards by priority (most urgent first)
 * 
 * Priority:
 * 1. Cards in relearning (immediate)
 * 2. Overdue cards (oldest first)
 * 3. New cards
 */
export function sortByPriority<T extends { 
  next_review_at: number | null; 
  relearning_step: number | null;
}>(cards: T[]): T[] {
  return [...cards].sort((a, b) => {
    // Relearning cards first
    const aRelearning = a.relearning_step !== null;
    const bRelearning = b.relearning_step !== null;
    if (aRelearning && !bRelearning) return -1;
    if (!aRelearning && bRelearning) return 1;

    // Then by next_review_at (nulls = new cards go last)
    const aTime = a.next_review_at ?? Infinity;
    const bTime = b.next_review_at ?? Infinity;
    
    return aTime - bTime;
  });
}

// ============================================================================
// RE-EXPORTS for backward compatibility
// ============================================================================

export { DEFAULT_WEIGHTS, DEFAULT_RETENTION } from './weights';
export type { FSRSWeights } from './weights';
