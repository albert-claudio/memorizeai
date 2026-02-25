-- Migration: Lock down chunks RLS
-- Description: Restrict chunk access to users who own the source via source_chunks
-- Fixes: Any authenticated user could read all chunks (data leak risk)

-- 1. Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view chunks" ON chunks;

-- 2. Create secure policy: Users can only view chunks from their own sources
CREATE POLICY "Users can view own source chunks" ON chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM source_chunks sc
      JOIN sources s ON s.id = sc.source_id
      WHERE sc.chunk_id = chunks.id
      AND s.user_id = auth.uid()
    )
  );

-- Comment explaining the change
COMMENT ON POLICY "Users can view own source chunks" ON chunks IS 
  'Users can only view chunks that belong to sources they own. Service role bypasses RLS for edge functions.';
