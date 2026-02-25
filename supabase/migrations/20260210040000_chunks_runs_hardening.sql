-- ============================================================================
-- Security Hardening Round 2: chunks read policy + runs insert constraints
-- ============================================================================

-- ============================================================================
-- 1. Replace open chunks SELECT policy with user-scoped version
--    Old: any authenticated user can read ALL chunks
--    New: only chunks linked to user's own sources via source_chunks
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can view chunks" ON "public"."chunks";

CREATE POLICY "Users can view own chunks"
  ON "public"."chunks"
  AS permissive
  FOR SELECT
  TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM source_chunks sc
    JOIN sources s ON s.id = sc.source_id
    WHERE sc.chunk_id = chunks.id
      AND s.user_id = auth.uid()
  )
);

-- Service role keeps full access (already has insert policy, add select+update)
DROP POLICY IF EXISTS "Service role can read chunks" ON "public"."chunks";
CREATE POLICY "Service role can read chunks"
  ON "public"."chunks"
  AS permissive
  FOR SELECT
  TO public
USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS "Service role can update chunks" ON "public"."chunks";
CREATE POLICY "Service role can update chunks"
  ON "public"."chunks"
  AS permissive
  FOR UPDATE
  TO public
USING (auth.role() = 'service_role'::text);

-- ============================================================================
-- 2. Replace permissive runs INSERT policy with ownership-validated version
--    Old: only checked auth.uid() = user_id
--    New: also validates source_id belongs to user + deck_id (if set) belongs to user
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own runs" ON "public"."runs";

CREATE POLICY "Users can insert own runs with validated refs"
  ON "public"."runs"
  AS permissive
  FOR INSERT
  TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM sources WHERE sources.id = source_id AND sources.user_id = auth.uid()
  )
  AND (
    deck_id IS NULL
    OR EXISTS (
      SELECT 1 FROM decks WHERE decks.id = deck_id AND decks.user_id = auth.uid()
    )
  )
);
