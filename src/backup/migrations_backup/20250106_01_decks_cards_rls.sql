-- Migration: Add RLS to decks and cards tables
-- Description: Protect user flashcard data from unauthorized access
-- Date: 2026-01-06

-- ============================================================================
-- DECKS TABLE - Row Level Security
-- ============================================================================

ALTER TABLE decks ENABLE ROW LEVEL SECURITY;

-- Users can only view their own decks
CREATE POLICY "Users can view own decks" ON decks
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own decks
CREATE POLICY "Users can insert own decks" ON decks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own decks
CREATE POLICY "Users can update own decks" ON decks
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own decks (soft delete)
CREATE POLICY "Users can delete own decks" ON decks
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can do anything (for Edge Functions/Server Actions)
CREATE POLICY "Service role full access decks" ON decks
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- CARDS TABLE - Row Level Security
-- ============================================================================

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

-- Users can view cards belonging to their decks
CREATE POLICY "Users can view cards in own decks" ON cards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM decks 
      WHERE decks.id = cards.deck_id 
      AND decks.user_id = auth.uid()
    )
  );

-- Users can insert cards to their own decks
CREATE POLICY "Users can insert cards to own decks" ON cards
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM decks 
      WHERE decks.id = cards.deck_id 
      AND decks.user_id = auth.uid()
    )
  );

-- Users can update cards in their own decks
CREATE POLICY "Users can update cards in own decks" ON cards
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM decks 
      WHERE decks.id = cards.deck_id 
      AND decks.user_id = auth.uid()
    )
  );

-- Users can delete cards from their own decks
CREATE POLICY "Users can delete cards in own decks" ON cards
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM decks 
      WHERE decks.id = cards.deck_id 
      AND decks.user_id = auth.uid()
    )
  );

-- Service role can do anything (for Edge Functions/Server Actions)
CREATE POLICY "Service role full access cards" ON cards
  FOR ALL USING (auth.role() = 'service_role');
