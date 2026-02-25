-- ============================================================================
-- Migration: Add FSRS fields to cards table
-- These columns are required by the TypeScript Card type and the FSRS
-- algorithm (studyService.updateCard writes them on every review).
-- ============================================================================

-- Add FSRS algorithm columns that the app already expects
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS difficulty      double precision DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS stability       double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lapses          integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_leech        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_review_at  bigint,
  ADD COLUMN IF NOT EXISTS relearning_step integer;

-- Index for leech queries (finding cards that need atomization)
CREATE INDEX IF NOT EXISTS idx_cards_is_leech
  ON public.cards (is_leech) WHERE is_leech = true;

-- Index for relearning queries (cards currently in relearning steps)
CREATE INDEX IF NOT EXISTS idx_cards_relearning
  ON public.cards (relearning_step) WHERE relearning_step IS NOT NULL;
