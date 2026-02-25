-- Migration: Add FSRS fields to cards table
-- Description: Implements DSR model (Difficulty, Stability, Retrievability) for spaced repetition

-- ============================================================================
-- STEP 1: Add FSRS columns to existing cards table
-- ============================================================================

ALTER TABLE cards 
  ADD COLUMN IF NOT EXISTS difficulty FLOAT DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS stability FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ease_factor FLOAT DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS lapses INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_leech BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_review_at BIGINT,
  ADD COLUMN IF NOT EXISTS relearning_step INTEGER; -- null = not in relearning

-- ============================================================================
-- STEP 2: Create card_reviews table for review history
-- ============================================================================

CREATE TABLE IF NOT EXISTS card_reviews (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL CHECK (grade >= 0 AND grade <= 3), -- 0=Again, 1=Hard, 2=Good, 3=Easy
  difficulty_before FLOAT NOT NULL,
  stability_before FLOAT NOT NULL,
  interval_days FLOAT NOT NULL,
  reviewed_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Index for querying user review history
CREATE INDEX IF NOT EXISTS idx_card_reviews_user_id ON card_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_card_reviews_card_id ON card_reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_card_reviews_reviewed_at ON card_reviews(reviewed_at DESC);

-- ============================================================================
-- STEP 3: Create study_goals table for exam scheduling
-- ============================================================================

CREATE TABLE IF NOT EXISTS study_goals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id TEXT REFERENCES decks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_date BIGINT NOT NULL, -- Exam date timestamp
  target_retention FLOAT DEFAULT 0.95, -- 95% retention goal
  is_active BOOLEAN DEFAULT TRUE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  deleted_at BIGINT -- Soft delete
);

CREATE INDEX IF NOT EXISTS idx_study_goals_user_id ON study_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_study_goals_deck_id ON study_goals(deck_id);

-- ============================================================================
-- STEP 4: RLS Policies
-- ============================================================================

-- card_reviews policies
ALTER TABLE card_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own reviews"
  ON card_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can view their own reviews"
  ON card_reviews FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

-- study_goals policies
ALTER TABLE study_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own goals"
  ON study_goals FOR ALL
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ============================================================================
-- STEP 5: Index for efficient due card queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(deck_id, next_review_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cards_leech ON cards(deck_id, is_leech)
  WHERE deleted_at IS NULL AND is_leech = TRUE;
