-- ============================================================================
-- card_reviews ownership hardening
-- Prevent authenticated users from inserting reviews that reference cards
-- belonging to another user's deck.
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert their own reviews" ON "public"."card_reviews";

CREATE POLICY "Users can insert reviews for own cards"
  ON "public"."card_reviews"
  AS permissive
  FOR INSERT
  TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.cards c
    JOIN public.decks d ON d.id = c.deck_id
    WHERE c.id = card_reviews.card_id
      AND d.user_id = auth.uid()
  )
);
