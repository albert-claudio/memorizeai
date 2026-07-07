-- ============================================================================
-- Server-side free plan limits for direct deck/card writes
-- ============================================================================
-- UI gates are advisory only. These triggers enforce plan limits inside the
-- database for authenticated clients and service-role backend paths.

CREATE OR REPLACE FUNCTION public.has_effective_pro_access_for_limits(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_active_beta_user(target_user_id), FALSE)
    OR COALESCE(public.is_active_free_trial_user(target_user_id), FALSE)
    OR COALESCE((
      SELECT (
        COALESCE(p.admin_override_pro, FALSE)
        OR (
          p.is_pro
          AND p.subscription_status IN ('active', 'past_due')
          AND p.subscription_period_end IS NOT NULL
          AND p.subscription_period_end > (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
          AND EXISTS (
            SELECT 1
            FROM public.subscriptions s
            WHERE s.user_id = p.id
              AND COALESCE(s.price_id, '') NOT IN ('beta_trial', 'beta_access', 'free_trial')
              AND s.status IN ('active', 'past_due')
              AND NOT COALESCE(s.cancel_at_period_end, FALSE)
              AND s.current_period_end IS NOT NULL
              AND s.current_period_end > (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
          )
        )
      )
      FROM public.profiles p
      WHERE p.id = target_user_id
    ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.has_effective_pro_access_for_limits(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_effective_pro_access_for_limits(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_deck_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_deck_count integer;
BEGIN
  IF public.has_effective_pro_access_for_limits(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO active_deck_count
  FROM public.decks d
  WHERE d.user_id = NEW.user_id
    AND d.deleted_at IS NULL;

  IF active_deck_count >= 3 THEN
    RAISE EXCEPTION 'Free plan deck limit reached (3). Upgrade to Pro for unlimited decks.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_card_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deck_owner uuid;
  active_card_count integer;
BEGIN
  SELECT d.user_id
  INTO deck_owner
  FROM public.decks d
  WHERE d.id = NEW.deck_id
    AND d.deleted_at IS NULL;

  IF deck_owner IS NULL THEN
    RAISE EXCEPTION 'Deck not found for card insert.'
      USING ERRCODE = '42501';
  END IF;

  IF public.has_effective_pro_access_for_limits(deck_owner) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO active_card_count
  FROM public.cards c
  WHERE c.deck_id = NEW.deck_id
    AND c.deleted_at IS NULL;

  IF active_card_count >= 50 THEN
    RAISE EXCEPTION 'Free plan card limit reached (50 per deck). Upgrade to Pro for more cards.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_deck_limit_before_insert ON public.decks;
CREATE TRIGGER enforce_deck_limit_before_insert
  BEFORE INSERT ON public.decks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_deck_limit();

DROP TRIGGER IF EXISTS enforce_card_limit_before_insert ON public.cards;
CREATE TRIGGER enforce_card_limit_before_insert
  BEFORE INSERT ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.check_card_limit();

CREATE OR REPLACE FUNCTION public.apply_free_user_preference_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_effective_pro_access_for_limits(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  NEW.prioritize_weak := FALSE;
  NEW.prioritize_near_exam := FALSE;
  NEW.fsrs_enabled := FALSE;
  NEW.interval_limit_days := LEAST(COALESCE(NEW.interval_limit_days, 365), 365);
  NEW.daily_load_tolerance := LEAST(COALESCE(NEW.daily_load_tolerance, 100), 100);
  NEW.auto_reschedule_missed := FALSE;
  NEW.bury_siblings := FALSE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_free_user_preference_limits ON public.user_preferences;
CREATE TRIGGER enforce_free_user_preference_limits
  BEFORE INSERT OR UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_free_user_preference_limits();

CREATE OR REPLACE FUNCTION public.apply_free_srs_setting_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_effective_pro_access_for_limits(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  NEW.desired_retention := 0.9;
  NEW.calibration_enabled := FALSE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_free_srs_setting_limits ON public.user_srs_settings;
CREATE TRIGGER enforce_free_srs_setting_limits
  BEFORE INSERT OR UPDATE ON public.user_srs_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_free_srs_setting_limits();

CREATE OR REPLACE FUNCTION public.apply_free_weight_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_effective_pro_access_for_limits(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  NEW.weights := '{"w0": 0.4, "w1": 0.6, "w2": 2.4, "w3": 5.8, "w4": 4.93, "w5": 0.94, "w6": 1.14, "w7": 0.05, "w8": 0.35, "w9": 2.5, "w10": 0.94, "w11": 2.18, "w12": 0.05, "w13": 0.34, "w14": 0.75, "w15": 0.35, "w16": 2.61}'::jsonb;
  NEW.metrics := NULL;
  NEW.is_custom := FALSE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_free_weight_limits ON public.user_weights;
CREATE TRIGGER enforce_free_weight_limits
  BEFORE INSERT OR UPDATE ON public.user_weights
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_free_weight_limits();

CREATE OR REPLACE FUNCTION public.check_exam_target_pro_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  target_user_id := COALESCE(NEW.user_id, OLD.user_id);

  IF public.has_effective_pro_access_for_limits(target_user_id) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Exam targets are available only for Pro and Premium users.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS enforce_exam_target_pro_before_write ON public.exam_targets;
CREATE TRIGGER enforce_exam_target_pro_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.exam_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.check_exam_target_pro_access();
