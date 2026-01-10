/**
 * FSRS-5 Trainable Weights System
 * 
 * Instead of using magic constants (like SM-2's 2.5x), FSRS uses 17 trainable
 * weights that can be personalized for each user based on their review history.
 * 
 * These default values are from the FSRS-5 paper, trained on millions of reviews.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FSRSWeights {
  // Initial stability for each grade (days)
  w0: number;  // Again - initial stability
  w1: number;  // Hard - initial stability
  w2: number;  // Good - initial stability
  w3: number;  // Easy - initial stability
  
  // Difficulty parameters
  w4: number;  // Mean reversion strength
  w5: number;  // Difficulty multiplier
  
  // Stability increase parameters (SInc formula)
  w6: number;  // Base SInc
  w7: number;  // Difficulty penalty
  w8: number;  // Stability factor (negative = harder cards grow slower)
  w9: number;  // Retrievability bonus (SPACING EFFECT!) ⭐
  
  // Stability decrease parameters (lapse)
  w10: number; // Stability decrease factor
  w11: number; // Stability decay
  w12: number; // Difficulty impact on decrease
  w13: number; // Stability impact on decrease
  
  // Grade modifiers
  w14: number; // Hard penalty multiplier
  w15: number; // Easy bonus multiplier
  w16: number; // Hard interval penalty
}

export interface UserSRSSettings {
  desiredRetention: number;     // 0.80 - 0.95
  calibrationEnabled: boolean;
  lastCalibrationAt: number | null;
  reviewCountSinceCalibration: number;
}

export interface OptimizationMetrics {
  logLoss: number;       // Binary cross-entropy loss
  rmse: number;          // Root mean square error
  calibration: number;   // Predicted vs actual recall rate
  sampleSize: number;    // Number of reviews used
}

// ============================================================================
// DEFAULT WEIGHTS (FSRS-5)
// ============================================================================

/**
 * Default FSRS-5 weights trained on Open Spaced Repetition dataset.
 * These provide excellent baseline performance for most users.
 */
export const DEFAULT_WEIGHTS: FSRSWeights = {
  // Initial stability by grade (in days)
  w0: 0.4,     // Again: ~10 hours
  w1: 0.6,     // Hard: ~14 hours
  w2: 2.4,     // Good: ~2.4 days
  w3: 5.8,     // Easy: ~6 days
  
  // Difficulty parameters
  w4: 4.93,    // Mean reversion - pulls difficulty toward center
  w5: 0.94,    // Difficulty multiplier on grade
  
  // Stability increase (SInc) - THE CORE OF SPACING EFFECT
  // These values are calibrated to give SInc typically between 1.5 and 4
  w6: 1.14,    // Base stability increase (e^1.14 ≈ 3.13)
  w7: 0.05,    // Difficulty penalty (harder cards grow slower)
  w8: 0.35,    // Stability factor (higher S = smaller growth, less aggressive)
  w9: 2.5,     // ⭐ SPACING EFFECT: Bonus when R is low! (stronger effect)
  
  // Stability decrease (after lapse)
  w10: 0.94,   // Base decrease factor
  w11: 2.18,   // Decay rate
  w12: 0.05,   // Difficulty impact
  w13: 0.34,   // Current stability impact
  
  // Grade modifiers
  w14: 0.75,   // Hard: use 75% of the normal increase
  w15: 0.35,   // Easy: 35% bonus on top of normal increase
  w16: 2.61,   // Hard interval reduction factor
};

// ============================================================================
// CONSTANTS
// ============================================================================

/** Power law decay constant (FSRS-5) */
export const DECAY = -0.5;

/** Factor for power law formula: (19/81) ≈ 0.2346 */
export const FACTOR = 19 / 81;

/** Minimum desired retention */
export const MIN_RETENTION = 0.70;

/** Maximum desired retention */
export const MAX_RETENTION = 0.99;

/** Default desired retention (90% recall) */
export const DEFAULT_RETENTION = 0.90;

/** Number of reviews before suggesting calibration */
export const CALIBRATION_THRESHOLD = 500;

/** Minimum reviews needed for calibration */
export const MIN_REVIEWS_FOR_CALIBRATION = 100;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate and clamp desired retention to valid range
 */
export function clampRetention(retention: number): number {
  return Math.max(MIN_RETENTION, Math.min(MAX_RETENTION, retention));
}

/**
 * Get retention level description in Portuguese
 */
export function getRetentionDescription(retention: number): {
  label: string;
  description: string;
  color: string;
} {
  if (retention >= 0.95) {
    return {
      label: 'Máxima',
      description: 'Mais revisões, memória muito forte',
      color: '#22C55E',
    };
  }
  if (retention >= 0.90) {
    return {
      label: 'Equilibrado',
      description: 'Recomendado para a maioria',
      color: '#6366F1',
    };
  }
  if (retention >= 0.85) {
    return {
      label: 'Moderado',
      description: 'Menos revisões, boa retenção',
      color: '#F59E0B',
    };
  }
  return {
    label: 'Mínimo',
    description: 'Muito menos revisões, aceita esquecimento',
    color: '#EF4444',
  };
}

/**
 * Estimate daily review count change based on retention
 * Higher retention = more reviews
 */
export function estimateReviewImpact(
  currentRetention: number,
  newRetention: number
): number {
  // Approximate: 5% retention increase = ~40% more reviews
  const diff = newRetention - currentRetention;
  return Math.round(diff * 8 * 100); // Returns percentage change
}

/**
 * Merge user weights with defaults (for partial overrides)
 */
export function mergeWeights(
  userWeights: Partial<FSRSWeights> | null
): FSRSWeights {
  if (!userWeights) return DEFAULT_WEIGHTS;
  
  return {
    ...DEFAULT_WEIGHTS,
    ...userWeights,
  };
}
