-- ============================================================================
-- Public launch free trial access for database limit triggers
-- ============================================================================
-- The public launch flow grants a 30-day internal free_trial subscription.
-- Database-side limits must treat that active trial as effective Pro access,
-- without requiring a private beta invite.

CREATE OR REPLACE FUNCTION public.is_active_free_trial_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = target_user_id
      AND s.price_id = 'free_trial'
      AND s.status = 'trialing'
      AND NOT COALESCE(s.cancel_at_period_end, FALSE)
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end > (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_free_trial_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_free_trial_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_upload_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_effective_pro BOOLEAN := FALSE;
  now_ms BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  upload_count INTEGER;
  week_start BIGINT;
BEGIN
  SELECT COALESCE((
    SELECT (
      COALESCE(p.admin_override_pro, FALSE)
      OR public.is_active_free_trial_user(NEW.user_id)
      OR (
        p.is_pro
        AND p.subscription_status IN ('active', 'past_due')
        AND p.subscription_period_end IS NOT NULL
        AND p.subscription_period_end > now_ms
        AND EXISTS (
          SELECT 1
          FROM public.subscriptions s
          WHERE s.user_id = p.id
            AND COALESCE(s.price_id, '') NOT IN ('beta_trial', 'beta_access', 'free_trial')
            AND s.status IN ('active', 'past_due')
            AND NOT COALESCE(s.cancel_at_period_end, FALSE)
            AND s.current_period_end IS NOT NULL
            AND s.current_period_end > now_ms
        )
      )
    )
    FROM public.profiles p
    WHERE p.id = NEW.user_id
  ), FALSE)
  INTO is_effective_pro;

  IF is_effective_pro THEN
    RETURN NEW;
  END IF;

  week_start := now_ms - (7 * 24 * 60 * 60 * 1000);

  SELECT COUNT(*) INTO upload_count
  FROM public.sources
  WHERE user_id = NEW.user_id
    AND created_at >= week_start;

  IF upload_count >= 3 THEN
    RAISE EXCEPTION 'Upload limit reached (3/week). Upgrade to Pro for unlimited uploads.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_run_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_effective_pro BOOLEAN := FALSE;
  now_ms BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
BEGIN
  SELECT COALESCE((
    SELECT (
      COALESCE(p.admin_override_pro, FALSE)
      OR public.is_active_free_trial_user(NEW.user_id)
      OR (
        p.is_pro
        AND p.subscription_status IN ('active', 'past_due')
        AND p.subscription_period_end IS NOT NULL
        AND p.subscription_period_end > now_ms
        AND EXISTS (
          SELECT 1
          FROM public.subscriptions s
          WHERE s.user_id = p.id
            AND COALESCE(s.price_id, '') NOT IN ('beta_trial', 'beta_access', 'free_trial')
            AND s.status IN ('active', 'past_due')
            AND NOT COALESCE(s.cancel_at_period_end, FALSE)
            AND s.current_period_end IS NOT NULL
            AND s.current_period_end > now_ms
        )
      )
    )
    FROM public.profiles p
    WHERE p.id = NEW.user_id
  ), FALSE)
  INTO is_effective_pro;

  IF is_effective_pro THEN
    RETURN NEW;
  END IF;

  IF NEW.objective <> 'flashcards' THEN
    RAISE EXCEPTION 'This feature is Pro only. Upgrade to access.';
  END IF;

  IF NEW.target_count > 10 THEN
    RAISE EXCEPTION 'Free users are limited to 10 items per run. Upgrade to generate more.';
  END IF;

  RETURN NEW;
END;
$$;
