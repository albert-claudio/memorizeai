-- ============================================================================
-- Beta list grants full Pro access
-- ============================================================================
-- A user linked to an active beta_invites row is treated as Pro by database
-- limit triggers. App code also syncs matching emails to user_id on login.

ALTER TABLE public.beta_invites
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.beta_invites.name IS
  'Display name entered by admin for the private beta list.';

CREATE INDEX IF NOT EXISTS idx_beta_invites_user_status
  ON public.beta_invites (user_id, status)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_active_beta_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.beta_invites bi
    WHERE bi.user_id = target_user_id
      AND bi.status IN ('pending', 'sent', 'redeemed')
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_beta_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_beta_user(uuid) TO service_role;

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
  SELECT COALESCE(public.is_active_beta_user(NEW.user_id), FALSE)
    OR COALESCE((
      SELECT (
        p.is_pro
        AND p.subscription_status IN ('active', 'past_due')
        AND p.subscription_period_end IS NOT NULL
        AND p.subscription_period_end > now_ms
        AND EXISTS (
          SELECT 1
          FROM public.subscriptions s
          WHERE s.user_id = p.id
            AND COALESCE(s.price_id, '') NOT IN ('beta_trial', 'beta_access')
            AND s.status IN ('active', 'past_due')
            AND NOT COALESCE(s.cancel_at_period_end, FALSE)
            AND s.current_period_end IS NOT NULL
            AND s.current_period_end > now_ms
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
  SELECT COALESCE(public.is_active_beta_user(NEW.user_id), FALSE)
    OR COALESCE((
      SELECT (
        p.is_pro
        AND p.subscription_status IN ('active', 'past_due')
        AND p.subscription_period_end IS NOT NULL
        AND p.subscription_period_end > now_ms
        AND EXISTS (
          SELECT 1
          FROM public.subscriptions s
          WHERE s.user_id = p.id
            AND COALESCE(s.price_id, '') NOT IN ('beta_trial', 'beta_access')
            AND s.status IN ('active', 'past_due')
            AND NOT COALESCE(s.cancel_at_period_end, FALSE)
            AND s.current_period_end IS NOT NULL
            AND s.current_period_end > now_ms
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
