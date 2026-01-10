-- ============================================================================
-- Migration: FSRS Enhanced - User Settings & Trainable Weights
-- Description: Adds user SRS settings (desired retention) and trainable weights
-- ============================================================================

-- ============================================================================
-- STEP 1: User SRS Settings (Desired Retention)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_srs_settings (
  user_id TEXT PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Desired retention: 0.70 - 0.99 (70% to 99% target recall)
  -- Higher = more reviews but better memory
  -- Lower = fewer reviews but more forgetting
  desired_retention FLOAT DEFAULT 0.9 CHECK (
    desired_retention >= 0.70 AND desired_retention <= 0.99
  ),
  
  -- Calibration settings
  calibration_enabled BOOLEAN DEFAULT TRUE,
  last_calibration_at BIGINT,
  review_count_since_calibration INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- ============================================================================
-- STEP 2: User Trainable Weights (FSRS-5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_weights (
  user_id TEXT PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- FSRS-5 weights stored as JSONB for flexibility
  -- These calibrated values give SInc typically between 1.5 and 4
  weights JSONB NOT NULL DEFAULT '{
    "w0": 0.4,
    "w1": 0.6,
    "w2": 2.4,
    "w3": 5.8,
    "w4": 4.93,
    "w5": 0.94,
    "w6": 1.14,
    "w7": 0.05,
    "w8": 0.35,
    "w9": 2.5,
    "w10": 0.94,
    "w11": 2.18,
    "w12": 0.05,
    "w13": 0.34,
    "w14": 0.75,
    "w15": 0.35,
    "w16": 2.61
  }',
  
  -- Optimization metrics (updated after each calibration)
  metrics JSONB, -- { "logLoss": 0.xx, "rmse": 0.xx, "sampleSize": N }
  
  -- TRUE after first optimization (indicates custom weights)
  is_custom BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- ============================================================================
-- STEP 3: RLS Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE user_srs_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_weights ENABLE ROW LEVEL SECURITY;

-- user_srs_settings policies
CREATE POLICY "Users can view their own SRS settings"
  ON user_srs_settings FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own SRS settings"
  ON user_srs_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own SRS settings"
  ON user_srs_settings FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- user_weights policies
CREATE POLICY "Users can view their own weights"
  ON user_weights FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own weights"
  ON user_weights FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own weights"
  ON user_weights FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ============================================================================
-- STEP 4: Indexes for efficient queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_srs_settings_calibration 
  ON user_srs_settings(calibration_enabled, last_calibration_at);

-- ============================================================================
-- STEP 5: Helper function to increment review count
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_review_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment review count for calibration tracking
  INSERT INTO user_srs_settings (user_id, review_count_since_calibration)
  VALUES (NEW.user_id, 1)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    review_count_since_calibration = user_srs_settings.review_count_since_calibration + 1,
    updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-increment review count
DROP TRIGGER IF EXISTS trigger_increment_review_count ON card_reviews;
CREATE TRIGGER trigger_increment_review_count
  AFTER INSERT ON card_reviews
  FOR EACH ROW
  EXECUTE FUNCTION increment_review_count();
