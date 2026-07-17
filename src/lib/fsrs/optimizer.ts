/**
 * FSRS Optimizer - Weight Calibration System
 * 
 * This module provides weight optimization based on user's review history.
 * It uses Log Loss (binary cross-entropy) and RMSE to measure prediction accuracy,
 * then adjusts weights to minimize error.
 */

import {
  type FSRSWeights,
  type OptimizationMetrics,
  DEFAULT_WEIGHTS,
  DECAY,
  FACTOR,
  CALIBRATION_THRESHOLD,
  MIN_REVIEWS_FOR_CALIBRATION,
} from './weights';
import { processReview, type SRSState } from './index';

// ============================================================================
// TYPES
// ============================================================================

export interface ReviewRecord {
  cardId: string;
  grade: 0 | 1 | 2 | 3;
  stabilityBefore: number;
  difficultyBefore: number;
  intervalDays: number;
  reviewedAt: number;
  success: boolean; // grade > 0
}

interface PredictionResult {
  predictedR: number;  // Predicted retrievability
  actualSuccess: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_PREDICTION_REVIEWS = 2;
const WEIGHT_BOUNDS: Record<keyof FSRSWeights, { min: number; max: number }> = {
  w0: { min: 0.05, max: 3 },
  w1: { min: 0.05, max: 5 },
  w2: { min: 0.1, max: 15 },
  w3: { min: 0.2, max: 30 },
  w4: { min: 1, max: 9 },
  w5: { min: 0.1, max: 3 },
  w6: { min: 0.1, max: 3 },
  w7: { min: 0.001, max: 1 },
  w8: { min: 0.05, max: 1.5 },
  w9: { min: 0.5, max: 5 },
  w10: { min: 0.05, max: 2 },
  w11: { min: 0.1, max: 5 },
  w12: { min: 0.001, max: 1 },
  w13: { min: 0.05, max: 2 },
  w14: { min: 0.05, max: 2 },
  w15: { min: 0.05, max: 1.2 },
  w16: { min: 1, max: 5 },
};

// ============================================================================
// METRIC CALCULATIONS
// ============================================================================

/**
 * Calculate Log Loss (Binary Cross-Entropy)
 * 
 * Measures how well predicted probabilities match actual outcomes.
 * Lower is better. Perfect prediction = 0.
 * 
 * L = -1/N × Σ[y×log(p) + (1-y)×log(1-p)]
 */
export function calculateLogLoss(predictions: PredictionResult[]): number {
  if (predictions.length === 0) return Infinity;
  
  const epsilon = 1e-15; // Prevent log(0)
  let totalLoss = 0;
  
  for (const { predictedR, actualSuccess } of predictions) {
    const p = Math.max(epsilon, Math.min(1 - epsilon, predictedR));
    const y = actualSuccess ? 1 : 0;
    
    totalLoss += y * Math.log(p) + (1 - y) * Math.log(1 - p);
  }
  
  return -totalLoss / predictions.length;
}

/**
 * Calculate RMSE (Root Mean Square Error)
 * 
 * Measures average prediction error.
 * Lower is better. Perfect prediction = 0.
 */
export function calculateRMSE(predictions: PredictionResult[]): number {
  if (predictions.length === 0) return Infinity;
  
  let sumSquaredError = 0;
  
  for (const { predictedR, actualSuccess } of predictions) {
    const actual = actualSuccess ? 1 : 0;
    const error = predictedR - actual;
    sumSquaredError += error * error;
  }
  
  return Math.sqrt(sumSquaredError / predictions.length);
}

/**
 * Calculate Calibration Score
 * 
 * Compares predicted recall rate vs actual recall rate.
 * Perfect calibration = 0 (no difference)
 */
export function calculateCalibration(predictions: PredictionResult[]): number {
  if (predictions.length === 0) return Infinity;
  
  const avgPredicted = predictions.reduce((sum, p) => sum + p.predictedR, 0) / predictions.length;
  const avgActual = predictions.filter(p => p.actualSuccess).length / predictions.length;
  
  return Math.abs(avgPredicted - avgActual);
}

// ============================================================================
// RETRIEVABILITY CALCULATION (for optimization)
// ============================================================================

/**
 * Calculate Retrievability using FSRS-5 power law formula
 * 
 * R = (1 + FACTOR × t/S)^DECAY
 */
function calculateR(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  if (elapsedDays <= 0) return 1;
  
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

function clampWeight(key: keyof FSRSWeights, value: number): number {
  const bounds = WEIGHT_BOUNDS[key];
  return Math.max(bounds.min, Math.min(bounds.max, value));
}

// ============================================================================
// WEIGHT OPTIMIZATION
// ============================================================================

/**
 * Check if calibration should be triggered
 */
export function shouldTriggerCalibration(
  reviewCountSinceCalibration: number,
  lastCalibrationAt: number | null
): boolean {
  // Trigger every CALIBRATION_THRESHOLD reviews
  if (reviewCountSinceCalibration >= CALIBRATION_THRESHOLD) {
    return true;
  }
  
  // Or if never calibrated and have enough data
  if (lastCalibrationAt === null && reviewCountSinceCalibration >= MIN_REVIEWS_FOR_CALIBRATION) {
    return true;
  }
  
  return false;
}

/**
 * Prepare predictions from review history for metric calculation
 */
export function preparePredictions(
  reviews: ReviewRecord[]
): PredictionResult[] {
  const predictions: PredictionResult[] = [];
  
  // Group reviews by card to calculate elapsed time
  const cardReviews = new Map<string, ReviewRecord[]>();
  for (const review of reviews) {
    const existing = cardReviews.get(review.cardId) || [];
    existing.push(review);
    cardReviews.set(review.cardId, existing);
  }
  
  // For each review, calculate predicted R at time of review
  for (const [, cardRevs] of cardReviews) {
    // Sort by time
    cardRevs.sort((a, b) => a.reviewedAt - b.reviewedAt);
    
    for (let i = 1; i < cardRevs.length; i++) {
      const prev = cardRevs[i - 1];
      const curr = cardRevs[i];
      
      // Skip if previous review was a lapse (stability was reset)
      if (prev.grade === 0) continue;
      
      const elapsedDays = (curr.reviewedAt - prev.reviewedAt) / DAY_MS;
      const predictedR = calculateR(curr.stabilityBefore, elapsedDays);
      
      predictions.push({
        predictedR,
        actualSuccess: curr.success,
      });
    }
  }
  
  return predictions;
}

/**
 * Prepare predictions by replaying each user's card history with a candidate
 * weight set. This makes optimization actually compare weight candidates,
 * instead of only scoring the persisted card states produced in the past.
 */
export function preparePredictionsWithWeights(
  reviews: ReviewRecord[],
  weights: FSRSWeights = DEFAULT_WEIGHTS
): PredictionResult[] {
  const predictions: PredictionResult[] = [];
  const cardReviews = new Map<string, ReviewRecord[]>();

  for (const review of reviews) {
    const existing = cardReviews.get(review.cardId) || [];
    existing.push(review);
    cardReviews.set(review.cardId, existing);
  }

  for (const [, cardRevs] of cardReviews) {
    cardRevs.sort((a, b) => a.reviewedAt - b.reviewedAt);
    if (cardRevs.length < MIN_PREDICTION_REVIEWS) continue;

    let state: Partial<SRSState> = {};
    let previousReviewedAt: number | null = null;

    for (const review of cardRevs) {
      if (previousReviewedAt !== null) {
        const elapsedDays = Math.max(0, (review.reviewedAt - previousReviewedAt) / DAY_MS);
        const stability = Number(state.stability ?? 0);
        predictions.push({
          predictedR: calculateR(stability, elapsedDays),
          actualSuccess: review.success,
        });
      }

      const result = processReview(
        {
          ...state,
          last_review_at: previousReviewedAt ?? review.reviewedAt,
          next_review_at: review.reviewedAt,
        },
        review.grade,
        review.reviewedAt,
        { weights, desiredRetention: 0.9 },
        false,
      );

      state = result.newState;
      previousReviewedAt = review.reviewedAt;
    }
  }

  return predictions;
}

/**
 * Calculate optimization metrics for current weights
 */
export function calculateMetrics(
  reviews: ReviewRecord[],
  weights?: FSRSWeights
): OptimizationMetrics {
  const predictions = weights
    ? preparePredictionsWithWeights(reviews, weights)
    : preparePredictions(reviews);
  
  return {
    logLoss: calculateLogLoss(predictions),
    rmse: calculateRMSE(predictions),
    calibration: calculateCalibration(predictions),
    sampleSize: predictions.length,
  };
}

/**
 * Simple gradient-free optimization using coordinate descent
 * 
 * This is a simpler approach that works well for FSRS optimization.
 * For each weight, try small adjustments and keep if it improves loss.
 */
export async function optimizeWeights(
  reviews: ReviewRecord[],
  currentWeights: FSRSWeights = DEFAULT_WEIGHTS,
  maxIterations: number = 50
): Promise<{
  weights: FSRSWeights;
  metrics: OptimizationMetrics;
  improved: boolean;
}> {
  // Calculate baseline metrics by replaying history with the current weights.
  const baselinePredictions = preparePredictionsWithWeights(reviews, currentWeights);
  let bestLoss = calculateLogLoss(baselinePredictions);
  let weights = { ...currentWeights };
  let improved = false;
  
  // Weights to optimize (subset for MVP)
  const optimizableKeys: (keyof FSRSWeights)[] = [
    'w0', 'w1', 'w2', 'w3', // Initial stability by first grade
    'w6', 'w7', 'w8', 'w9', // SInc parameters
    'w10', 'w11',           // Lapse parameters
    'w15', 'w16',           // Hard/Easy modifiers
  ];
  
  const stepSizes = [0.1, 0.05, 0.02, 0.01];
  
  for (let iter = 0; iter < maxIterations; iter++) {
    let iterImproved = false;
    
    for (const key of optimizableKeys) {
      for (const stepSize of stepSizes) {
        // Try increasing
        const upWeights = { ...weights, [key]: clampWeight(key, weights[key] + stepSize) };
        
        // Try decreasing
        const downWeights = { ...weights, [key]: clampWeight(key, weights[key] - stepSize) };
        
        const upLoss = calculateLogLoss(preparePredictionsWithWeights(reviews, upWeights));
        const downLoss = calculateLogLoss(preparePredictionsWithWeights(reviews, downWeights));
        
        if (upLoss < bestLoss) {
          weights = upWeights;
          bestLoss = upLoss;
          iterImproved = true;
          improved = true;
        } else if (downLoss < bestLoss) {
          weights = downWeights;
          bestLoss = downLoss;
          iterImproved = true;
          improved = true;
        }
      }
    }
    
    if (!iterImproved) break;
  }
  
  return {
    weights,
    metrics: calculateMetrics(reviews, weights),
    improved,
  };
}

/**
 * Format metrics for display
 */
export function formatMetrics(metrics: OptimizationMetrics): {
  logLossDisplay: string;
  rmseDisplay: string;
  calibrationDisplay: string;
  accuracy: string;
} {
  return {
    logLossDisplay: metrics.logLoss.toFixed(4),
    rmseDisplay: metrics.rmse.toFixed(4),
    calibrationDisplay: `${(metrics.calibration * 100).toFixed(1)}%`,
    accuracy: `${((1 - metrics.rmse) * 100).toFixed(0)}%`,
  };
}
