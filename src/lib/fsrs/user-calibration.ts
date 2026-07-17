import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MIN_REVIEWS_FOR_CALIBRATION,
  DEFAULT_WEIGHTS,
  weightsFromAny,
  type OptimizationMetrics,
} from './weights';
import {
  calculateMetrics,
  optimizeWeights,
  shouldTriggerCalibration,
  type ReviewRecord,
} from './optimizer';

const MAX_CALIBRATION_REVIEWS = 2000;

interface UserSrsSettingsRow {
  calibration_enabled: boolean | null;
  last_calibration_at: number | null;
  review_count_since_calibration: number | null;
}

interface UserWeightsRow {
  weights: unknown;
}

interface CardReviewRow {
  card_id: string;
  grade: number;
  difficulty_before: number;
  stability_before: number;
  interval_days: number;
  reviewed_at: number;
}

export type CalibrationResult =
  | {
      status: 'skipped';
      reason: 'disabled' | 'not_due' | 'insufficient_reviews' | 'insufficient_predictions';
      reviewCount: number;
      reviewCountSinceCalibration: number;
    }
  | {
      status: 'calibrated';
      reviewCount: number;
      improved: boolean;
      metrics: OptimizationMetrics;
    };

function toReviewRecord(row: CardReviewRow): ReviewRecord | null {
  const grade = Number(row.grade);
  if (![0, 1, 2, 3].includes(grade)) return null;

  return {
    cardId: row.card_id,
    grade: grade as 0 | 1 | 2 | 3,
    difficultyBefore: Number(row.difficulty_before),
    stabilityBefore: Number(row.stability_before),
    intervalDays: Number(row.interval_days),
    reviewedAt: Number(row.reviewed_at),
    success: grade > 0,
  };
}

export async function calibrateUserFsrsWeights(
  supabase: SupabaseClient,
  userId: string,
  options: { force?: boolean; now?: number } = {},
): Promise<CalibrationResult> {
  const now = options.now ?? Date.now();

  const settingsResult = await supabase
    .from('user_srs_settings')
    .select('calibration_enabled,last_calibration_at,review_count_since_calibration')
    .eq('user_id', userId)
    .maybeSingle();

  if (settingsResult.error) {
    throw new Error(`Failed to load SRS settings: ${settingsResult.error.message}`);
  }

  const settings = (settingsResult.data ?? {
    calibration_enabled: true,
    last_calibration_at: null,
    review_count_since_calibration: 0,
  }) as UserSrsSettingsRow;

  const reviewCountSinceCalibration = Number(settings.review_count_since_calibration ?? 0);
  const calibrationEnabled = settings.calibration_enabled !== false;

  if (!calibrationEnabled && !options.force) {
    return {
      status: 'skipped',
      reason: 'disabled',
      reviewCount: 0,
      reviewCountSinceCalibration,
    };
  }

  if (
    !options.force &&
    !shouldTriggerCalibration(reviewCountSinceCalibration, settings.last_calibration_at ?? null)
  ) {
    return {
      status: 'skipped',
      reason: 'not_due',
      reviewCount: 0,
      reviewCountSinceCalibration,
    };
  }

  const reviewsResult = await supabase
    .from('card_reviews')
    .select('card_id,grade,difficulty_before,stability_before,interval_days,reviewed_at')
    .eq('user_id', userId)
    .order('reviewed_at', { ascending: false })
    .limit(MAX_CALIBRATION_REVIEWS);

  if (reviewsResult.error) {
    throw new Error(`Failed to load review history: ${reviewsResult.error.message}`);
  }

  const reviews = ((reviewsResult.data ?? []) as CardReviewRow[])
    .map(toReviewRecord)
    .filter((row): row is ReviewRecord => row !== null)
    .sort((a, b) => a.reviewedAt - b.reviewedAt);

  if (reviews.length < MIN_REVIEWS_FOR_CALIBRATION) {
    return {
      status: 'skipped',
      reason: 'insufficient_reviews',
      reviewCount: reviews.length,
      reviewCountSinceCalibration,
    };
  }

  const weightsResult = await supabase
    .from('user_weights')
    .select('weights')
    .eq('user_id', userId)
    .maybeSingle();

  if (weightsResult.error) {
    throw new Error(`Failed to load user weights: ${weightsResult.error.message}`);
  }

  const currentWeights = weightsFromAny((weightsResult.data as UserWeightsRow | null)?.weights ?? DEFAULT_WEIGHTS);
  const baselineMetrics = calculateMetrics(reviews, currentWeights);

  if (baselineMetrics.sampleSize < MIN_REVIEWS_FOR_CALIBRATION / 2) {
    return {
      status: 'skipped',
      reason: 'insufficient_predictions',
      reviewCount: reviews.length,
      reviewCountSinceCalibration,
    };
  }

  const result = await optimizeWeights(reviews, currentWeights, 30);
  const metrics = result.metrics.sampleSize > 0 ? result.metrics : baselineMetrics;

  const upsertWeights = await supabase
    .from('user_weights')
    .upsert(
      {
        user_id: userId,
        weights: result.weights,
        metrics,
        is_custom: true,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    );

  if (upsertWeights.error) {
    throw new Error(`Failed to save user weights: ${upsertWeights.error.message}`);
  }

  const upsertSettings = await supabase
    .from('user_srs_settings')
    .upsert(
      {
        user_id: userId,
        last_calibration_at: now,
        review_count_since_calibration: 0,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    );

  if (upsertSettings.error) {
    throw new Error(`Failed to update calibration settings: ${upsertSettings.error.message}`);
  }

  return {
    status: 'calibrated',
    reviewCount: reviews.length,
    improved: result.improved,
    metrics,
  };
}
