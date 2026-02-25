-- ============================================================================
-- RPC Security Hardening
-- Restrict EXECUTE on SECURITY DEFINER functions + fix push_changes profile path
-- ============================================================================

-- ============================================================================
-- 1. REVOKE default EXECUTE from public on all sensitive functions
-- ============================================================================

-- Credit functions: only service_role should call these directly
REVOKE EXECUTE ON FUNCTION public.deduct_user_credit(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_user_credit(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refund_user_credit(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_user_credit(uuid) TO service_role;

-- user_has_credits: service_role + authenticated (read-only check)
REVOKE EXECUTE ON FUNCTION public.user_has_credits(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_has_credits(uuid) TO service_role, authenticated;

-- Sync functions: only authenticated users
REVOKE EXECUTE ON FUNCTION public.push_changes(jsonb, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.push_changes(jsonb, bigint) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.pull_changes(bigint, integer, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pull_changes(bigint, integer, jsonb) TO authenticated;

-- Trigger-invoked functions: only service_role (triggers run as definer)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_user_credits() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_credits() TO service_role;

-- Notification/trigger functions: only service_role
REVOKE EXECUTE ON FUNCTION public.notify_new_source() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_new_source() TO service_role;

REVOKE EXECUTE ON FUNCTION public.notify_run_status_change() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_run_status_change() TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_review_count() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_review_count() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_webhook_logs() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_webhook_logs() TO service_role;

-- Utility (used by subscriptions table default): keep for service_role
REVOKE EXECUTE ON FUNCTION public.generate_subscription_id() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_subscription_id() TO service_role;


-- ============================================================================
-- 2. Harden push_changes: force user_uuid on profile upsert
--    Previously accepted (rec->>'id')::UUID from client, allowing cross-tenant
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
  -- PROFILES (hardened: always use user_uuid, ignore client-supplied id)
  -- =====================
  -- Created
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'profiles'->'created', '[]'::jsonb))
  LOOP
    INSERT INTO profiles (id, is_pro, stripe_customer_id, created_at, updated_at)
    VALUES (
      user_uuid,  -- HARDENED: force authenticated user's own id
      COALESCE((rec->>'is_pro')::BOOLEAN, FALSE),
      rec->>'stripe_customer_id',
      COALESCE((rec->>'created_at')::BIGINT, current_ts),
      current_ts
    )
    ON CONFLICT (id) DO UPDATE SET
      is_pro = EXCLUDED.is_pro,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      updated_at = current_ts;
  END LOOP;

  -- Updated
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'profiles'->'updated', '[]'::jsonb))
  LOOP
    UPDATE profiles SET
      is_pro = COALESCE((rec->>'is_pro')::BOOLEAN, is_pro),
      stripe_customer_id = COALESCE(rec->>'stripe_customer_id', stripe_customer_id),
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
  -- DECKS
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
      updated_at = current_ts;
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
  -- CARDS
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
      updated_at = current_ts;
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
