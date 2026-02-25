-- ============================================================================
-- SECURITY AUDIT FIXES — 2026-02-11
-- Resolves ALL remaining vulnerabilities from automated security audit:
--   1. Block hard DELETE on decks, cards (enforce soft-delete only)
--   2. Revoke ALL anon grants on every user-data table
--   3. Revoke DELETE grants from authenticated on core tables
--   4. Add RLS policies for card_reviews (service_role access)
--   5. Restrict profiles SELECT to hide stripe_customer_id from client
--   6. Ensure no table is accessible to anon role via direct API
-- ============================================================================

-- ============================================================================
-- 1. BLOCK HARD DELETE — decks, cards, sources, runs, simulados
--    Policy: FOR DELETE USING (false) blocks all DELETE operations
--    Soft delete uses UPDATE (setting deleted_at), which is still allowed
-- ============================================================================

-- DECKS: drop existing delete policies, block all DELETEs
DROP POLICY IF EXISTS "Users can delete own decks" ON "public"."decks";
DROP POLICY IF EXISTS "decks_delete_own" ON "public"."decks";

CREATE POLICY "No hard deletes on decks"
  ON "public"."decks"
  AS restrictive
  FOR DELETE
  TO authenticated
USING (false);

-- CARDS: drop existing delete policies, block all DELETEs
DROP POLICY IF EXISTS "Users can delete cards in own decks" ON "public"."cards";
DROP POLICY IF EXISTS "cards_delete_own" ON "public"."cards";

CREATE POLICY "No hard deletes on cards"
  ON "public"."cards"
  AS restrictive
  FOR DELETE
  TO authenticated
USING (false);

-- SOURCES: block hard delete
CREATE POLICY "No hard deletes on sources"
  ON "public"."sources"
  AS restrictive
  FOR DELETE
  TO authenticated
USING (false);

-- RUNS: block hard delete
CREATE POLICY "No hard deletes on runs"
  ON "public"."runs"
  AS restrictive
  FOR DELETE
  TO authenticated
USING (false);

-- SIMULADOS: block hard delete
CREATE POLICY "No hard deletes on simulados"
  ON "public"."simulados"
  AS restrictive
  FOR DELETE
  TO authenticated
USING (false);

-- Also revoke DELETE grant from authenticated on these tables
REVOKE DELETE ON TABLE "public"."decks" FROM "authenticated";
REVOKE DELETE ON TABLE "public"."cards" FROM "authenticated";
REVOKE DELETE ON TABLE "public"."sources" FROM "authenticated";
REVOKE DELETE ON TABLE "public"."runs" FROM "authenticated";
REVOKE DELETE ON TABLE "public"."simulados" FROM "authenticated";
REVOKE DELETE ON TABLE "public"."card_reviews" FROM "authenticated";

-- ============================================================================
-- 2. REVOKE ALL ANON GRANTS — anon should NEVER access user data
--    Only service_role and authenticated roles should have access
-- ============================================================================

-- Core user data tables
REVOKE ALL ON TABLE "public"."decks" FROM "anon";
REVOKE ALL ON TABLE "public"."cards" FROM "anon";
REVOKE ALL ON TABLE "public"."card_reviews" FROM "anon";
REVOKE ALL ON TABLE "public"."card_references" FROM "anon";
REVOKE ALL ON TABLE "public"."profiles" FROM "anon";
REVOKE ALL ON TABLE "public"."sources" FROM "anon";
REVOKE ALL ON TABLE "public"."source_chunks" FROM "anon";
REVOKE ALL ON TABLE "public"."chunks" FROM "anon";
REVOKE ALL ON TABLE "public"."runs" FROM "anon";
REVOKE ALL ON TABLE "public"."simulados" FROM "anon";
REVOKE ALL ON TABLE "public"."simulado_questoes" FROM "anon";
REVOKE ALL ON TABLE "public"."simulado_respostas" FROM "anon";
REVOKE ALL ON TABLE "public"."study_goals" FROM "anon";
REVOKE ALL ON TABLE "public"."subscriptions" FROM "anon";
REVOKE ALL ON TABLE "public"."user_credits" FROM "anon";
REVOKE ALL ON TABLE "public"."user_srs_settings" FROM "anon";
REVOKE ALL ON TABLE "public"."user_weights" FROM "anon";
REVOKE ALL ON TABLE "public"."webhook_logs" FROM "anon";

-- ============================================================================
-- 3. REVOKE TRUNCATE from authenticated (should never be allowed)
-- ============================================================================

REVOKE TRUNCATE ON TABLE "public"."decks" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."cards" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."card_reviews" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."card_references" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."profiles" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."sources" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."source_chunks" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."chunks" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."runs" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."simulados" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."simulado_questoes" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."simulado_respostas" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."study_goals" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."subscriptions" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."user_credits" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."user_srs_settings" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."user_weights" FROM "authenticated";
REVOKE TRUNCATE ON TABLE "public"."webhook_logs" FROM "authenticated";

-- ============================================================================
-- 4. PROFILES — Lock down further
--    Already handled by 20260210050000_security_final_hardening.sql which:
--      - Dropped profiles_update_own, profiles_insert_own, profiles_delete_own
--      - Revoked INSERT/UPDATE/DELETE from authenticated
--      - Added service_role full access policy
--    Here we reinforce and also restrict DELETE from anon (belt+suspenders)
-- ============================================================================

-- Ensure profiles_select_own only shows safe columns
-- Note: RLS can't filter columns, but the SELECT grant can
-- Revoke full SELECT and regrant only safe columns
REVOKE SELECT ON TABLE "public"."profiles" FROM "authenticated";
GRANT SELECT (id, is_pro, subscription_status, subscription_tier, subscription_period_end, created_at, updated_at) ON TABLE "public"."profiles" TO "authenticated";

-- ============================================================================
-- 5. card_reviews — Add service_role access policy (missing)
-- ============================================================================

DROP POLICY IF EXISTS "Service role full access card_reviews" ON "public"."card_reviews";
CREATE POLICY "Service role full access card_reviews"
  ON "public"."card_reviews"
  AS permissive
  FOR ALL
  TO public
USING (auth.role() = 'service_role'::text);

-- ============================================================================
-- 6. user_credits — Lock down (users should only read, not write)
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE ON TABLE "public"."user_credits" FROM "authenticated";

-- ============================================================================
-- 7. subscriptions — Lock down (users should only read, not write)
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE ON TABLE "public"."subscriptions" FROM "authenticated";

-- ============================================================================
-- 8. webhook_logs — Lock down completely from users
-- ============================================================================

REVOKE ALL ON TABLE "public"."webhook_logs" FROM "authenticated";

-- ============================================================================
-- 9. RPC — Revoke anon access to all SECURITY DEFINER functions
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.push_changes(jsonb, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pull_changes(bigint, integer, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_user_credit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_user_credit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_credits(uuid) FROM anon;

-- ============================================================================
-- 10. Storage — Tighten sources bucket policy (currently allows any auth user)
-- ============================================================================

-- Drop overly permissive "Users can upload sources" policy
DROP POLICY IF EXISTS "Users can upload sources" ON "storage"."objects";

-- Replace with folder-scoped policy (like PDFs)
CREATE POLICY "Users can upload sources to own folder"
  ON "storage"."objects"
  AS permissive
  FOR INSERT
  TO authenticated
WITH CHECK (
  bucket_id = 'sources'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Replace overly permissive "Users can view their own sources" SELECT
DROP POLICY IF EXISTS "Users can view their own sources" ON "storage"."objects";

CREATE POLICY "Users can view own sources"
  ON "storage"."objects"
  AS permissive
  FOR SELECT
  TO authenticated
USING (
  bucket_id = 'sources'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
