-- Migration: Harden runs INSERT policy with source/deck ownership validation
-- Description: Defense-in-depth: ensure users can only create runs for sources/decks they own

-- ============================================================================
-- DROP OLD PERMISSIVE INSERT POLICY
-- ============================================================================
DROP POLICY IF EXISTS "Users can insert own runs" ON runs;

-- ============================================================================
-- CREATE HARDENED INSERT POLICY WITH OWNERSHIP CHECKS
-- ============================================================================

-- Users can only insert runs where:
-- 1. They are the owner (auth.uid() = user_id)
-- 2. The source_id belongs to them (subquery check)
-- 3. If deck_id is provided, it also belongs to them (subquery check)
CREATE POLICY "Users can insert own runs with valid source/deck" ON runs
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM sources 
      WHERE sources.id = source_id 
      AND sources.user_id = auth.uid()
    )
    AND (
      deck_id IS NULL 
      OR EXISTS (
        SELECT 1 FROM decks 
        WHERE decks.id = deck_id 
        AND decks.user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- VERIFICATION COMMENT
-- This policy ensures:
-- - auth.uid() must match the run's user_id (basic auth)
-- - source_id must belong to a source owned by the same user
-- - deck_id (if provided) must belong to a deck owned by the same user
-- - Blocks IDOR attacks where attacker knows foreign source/deck IDs
-- ============================================================================
