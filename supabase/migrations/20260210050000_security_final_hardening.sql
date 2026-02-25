-- ============================================================================
-- FINAL SECURITY HARDENING
-- Fixes all remaining vulnerabilities from audit:
-- 1. push_changes: ownership WHERE on decks/cards ON CONFLICT
-- 2. push_changes: strip billing fields from profiles sync
-- 3. Enable RLS on card_reviews and study_goals
-- 4. Restrict profiles UPDATE policy (no billing fields via client)
-- 5. Revoke excessive anon grants on sensitive tables
-- ============================================================================

-- ============================================================================
-- 1. ENABLE RLS on tables that were missing it
-- ============================================================================

ALTER TABLE "public"."card_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."study_goals" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Lock down profiles: prevent delete-then-reinsert escalation
--    Attack: user DELETEs own profile row, then INSERTs new one with
--    is_pro=true / forged subscription fields → free premium access.
--    Fix: drop insert/delete/update policies, revoke grants.
--    Only SELECT (read own profile) and service_role (webhooks) remain.
-- ============================================================================

DROP POLICY IF EXISTS "profiles_update_own" ON "public"."profiles";
DROP POLICY IF EXISTS "profiles_insert_own" ON "public"."profiles";
DROP POLICY IF EXISTS "profiles_delete_own" ON "public"."profiles";

-- Service role needs full access for webhook updates + handle_new_user trigger
CREATE POLICY "Service role full access profiles"
  ON "public"."profiles"
  AS permissive
  FOR ALL
  TO public
USING (auth.role() = 'service_role'::text);

-- Revoke INSERT/DELETE/UPDATE from authenticated on profiles table-level grants
-- SELECT is kept so users can read their own profile (profiles_select_own policy)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE "public"."profiles" FROM "authenticated";

-- ============================================================================
-- 3. Revoke excessive anon grants on sensitive tables
--    anon should NOT have write access to user data tables
-- ============================================================================

-- card_reviews: anon should have NO access
REVOKE ALL ON TABLE "public"."card_reviews" FROM "anon";

-- profiles: anon should have NO access at all
REVOKE ALL ON TABLE "public"."profiles" FROM "anon";

-- study_goals: anon should have NO access
REVOKE ALL ON TABLE "public"."study_goals" FROM "anon";

-- subscriptions: anon should have NO access
REVOKE ALL ON TABLE "public"."subscriptions" FROM "anon";

-- user_credits: anon should have NO access
REVOKE ALL ON TABLE "public"."user_credits" FROM "anon";

-- webhook_logs: anon should have NO access (already RLS-protected but belt+suspenders)
REVOKE ALL ON TABLE "public"."webhook_logs" FROM "anon";

-- ============================================================================
-- 4. Harden push_changes: ownership WHERE on ON CONFLICT + strip billing fields
-- ============================================================================

CREATE OR REPLACE FUNCTION public.push_changes(changes jsonb, last_pulled_at bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  user_uuid UUID;
  current_ts BIGINT;
  rec JSONB;
  del_id TEXT;
BEGIN
  -- Authenticate
  user_uuid := auth.uid();
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  current_ts := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

  -- =====================
  -- PROFILES (HARDENED: no billing fields, only timestamp sync)
  -- =====================
  -- Created: only insert the profile row with safe fields
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'profiles'->'created', '[]'::jsonb))
  LOOP
    INSERT INTO profiles (id, created_at, updated_at)
    VALUES (
      user_uuid,  -- HARDENED: force authenticated user's own id
      COALESCE((rec->>'created_at')::BIGINT, current_ts),
      current_ts
    )
    ON CONFLICT (id) DO UPDATE SET
      updated_at = current_ts
    WHERE profiles.id = user_uuid;  -- HARDENED: ownership guard
    -- NOTE: is_pro, stripe_customer_id, subscription_* are EXCLUDED
    -- These fields are ONLY set by the webhook route via service_role
  END LOOP;

  -- Updated: only update timestamp (no billing fields)
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'profiles'->'updated', '[]'::jsonb))
  LOOP
    UPDATE profiles SET
      updated_at = current_ts
    WHERE id = user_uuid;  -- HARDENED: always own profile
  END LOOP;

  -- Deleted (soft delete)
  FOR del_id IN SELECT * FROM jsonb_array_elements_text(COALESCE(changes->'profiles'->'deleted', '[]'::jsonb))
  LOOP
    UPDATE profiles SET deleted_at = current_ts, updated_at = current_ts
    WHERE id = user_uuid;  -- HARDENED: always own profile
  END LOOP;

  -- =====================
  -- DECKS (HARDENED: ownership WHERE on ON CONFLICT)
  -- =====================
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'decks'->'created', '[]'::jsonb))
  LOOP
    INSERT INTO decks (id, user_id, title, description, created_at, updated_at)
    VALUES (
      rec->>'id',
      user_uuid,
      rec->>'title',
      rec->>'description',
      COALESCE((rec->>'created_at')::BIGINT, current_ts),
      current_ts
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      updated_at = current_ts
    WHERE decks.user_id = user_uuid;  -- HARDENED: only update own decks
  END LOOP;

  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'decks'->'updated', '[]'::jsonb))
  LOOP
    UPDATE decks SET
      title = COALESCE(rec->>'title', title),
      description = COALESCE(rec->>'description', description),
      updated_at = current_ts
    WHERE id = rec->>'id' AND user_id = user_uuid;

    -- Recovery: insert if not found
    IF NOT FOUND THEN
      INSERT INTO decks (id, user_id, title, description, created_at, updated_at)
      VALUES (
        rec->>'id',
        user_uuid,
        rec->>'title',
        rec->>'description',
        COALESCE((rec->>'created_at')::BIGINT, current_ts),
        current_ts
      );
    END IF;
  END LOOP;

  FOR del_id IN SELECT * FROM jsonb_array_elements_text(COALESCE(changes->'decks'->'deleted', '[]'::jsonb))
  LOOP
    UPDATE decks SET deleted_at = current_ts, updated_at = current_ts
    WHERE id = del_id AND user_id = user_uuid;
  END LOOP;

  -- =====================
  -- CARDS (HARDENED: ownership WHERE on ON CONFLICT via deck ownership)
  -- =====================
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'cards'->'created', '[]'::jsonb))
  LOOP
    -- Verify deck ownership
    IF NOT EXISTS (SELECT 1 FROM decks WHERE id = rec->>'deck_id' AND user_id = user_uuid) THEN
      CONTINUE; -- Skip unauthorized cards
    END IF;

    INSERT INTO cards (id, deck_id, front, back, step, next_review_at, created_at, updated_at)
    VALUES (
      rec->>'id',
      rec->>'deck_id',
      rec->>'front',
      rec->>'back',
      COALESCE((rec->>'step')::INT, 0),
      (rec->>'next_review_at')::BIGINT,
      COALESCE((rec->>'created_at')::BIGINT, current_ts),
      current_ts
    )
    ON CONFLICT (id) DO UPDATE SET
      front = EXCLUDED.front,
      back = EXCLUDED.back,
      step = EXCLUDED.step,
      next_review_at = EXCLUDED.next_review_at,
      updated_at = current_ts
    WHERE EXISTS (
      SELECT 1 FROM decks
      WHERE decks.id = cards.deck_id AND decks.user_id = user_uuid
    );  -- HARDENED: only update cards in own decks
  END LOOP;

  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'cards'->'updated', '[]'::jsonb))
  LOOP
    UPDATE cards SET
      front = COALESCE(rec->>'front', front),
      back = COALESCE(rec->>'back', back),
      step = COALESCE((rec->>'step')::INT, step),
      next_review_at = COALESCE((rec->>'next_review_at')::BIGINT, next_review_at),
      updated_at = current_ts
    WHERE id = rec->>'id'
      AND EXISTS (SELECT 1 FROM decks WHERE decks.id = cards.deck_id AND decks.user_id = user_uuid);

    IF NOT FOUND AND EXISTS (SELECT 1 FROM decks WHERE id = rec->>'deck_id' AND user_id = user_uuid) THEN
      INSERT INTO cards (id, deck_id, front, back, step, next_review_at, created_at, updated_at)
      VALUES (
        rec->>'id',
        rec->>'deck_id',
        rec->>'front',
        rec->>'back',
        COALESCE((rec->>'step')::INT, 0),
        (rec->>'next_review_at')::BIGINT,
        COALESCE((rec->>'created_at')::BIGINT, current_ts),
        current_ts
      );
    END IF;
  END LOOP;

  FOR del_id IN SELECT * FROM jsonb_array_elements_text(COALESCE(changes->'cards'->'deleted', '[]'::jsonb))
  LOOP
    UPDATE cards SET deleted_at = current_ts, updated_at = current_ts
    WHERE id = del_id
      AND EXISTS (SELECT 1 FROM decks WHERE decks.id = cards.deck_id AND decks.user_id = user_uuid);
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ============================================================================
-- 5. Re-apply EXECUTE grants (CREATE OR REPLACE resets them)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.push_changes(jsonb, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.push_changes(jsonb, bigint) TO authenticated;
