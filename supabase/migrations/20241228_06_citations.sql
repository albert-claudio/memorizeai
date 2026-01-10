-- Migration: Add citation system for source provenance
-- Description: Links cards to their source chunks for proof of origin

-- ============================================================================
-- UPDATE CARDS TABLE
-- Add citation fields to existing cards table
-- ============================================================================

ALTER TABLE cards ADD COLUMN IF NOT EXISTS source_id TEXT REFERENCES sources(id);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS citation_text TEXT;

-- ============================================================================
-- CARD REFERENCES TABLE
-- Many-to-many relationship: one card can reference multiple chunks
-- ============================================================================

CREATE TABLE IF NOT EXISTS card_references (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  page_number INTEGER,
  excerpt TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  
  UNIQUE(card_id, chunk_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_card_references_card ON card_references(card_id);
CREATE INDEX IF NOT EXISTS idx_card_references_chunk ON card_references(chunk_id);
CREATE INDEX IF NOT EXISTS idx_card_references_source ON card_references(source_id);

-- RLS Policies
ALTER TABLE card_references ENABLE ROW LEVEL SECURITY;

-- Users can view references for their own cards
CREATE POLICY "Users can view own card_references" ON card_references
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM cards c
      JOIN decks d ON c.deck_id = d.id
      WHERE c.id = card_references.card_id 
      AND d.user_id = auth.uid()
    )
  );

-- Service role can do anything
CREATE POLICY "Service role full access card_references" ON card_references
  FOR ALL USING (auth.role() = 'service_role');
