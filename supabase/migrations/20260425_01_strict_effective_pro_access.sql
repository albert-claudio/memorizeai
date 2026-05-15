-- ============================================================================
-- Strict effective Pro access for DB limit triggers
-- ============================================================================
-- Billing-based Pro access must have a known paid period in the future. The only
-- non-billing exception is the explicit admin_override_pro flag.

WITH latest_valid_subscription AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    status,
    current_period_end
  FROM public.subscriptions
  WHERE status IN ('active', 'past_due')
    AND NOT COALESCE(cancel_at_period_end, FALSE)
    AND current_period_end IS NOT NULL
    AND current_period_end > (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  ORDER BY user_id, updated_at DESC
)
UPDATE public.profiles p
SET
  subscription_status = s.status,
  subscription_period_end = s.current_period_end,
  subscription_tier = CASE
    WHEN p.subscription_tier IN ('pro', 'enterprise') THEN p.subscription_tier
    ELSE 'pro'
  END,
  updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
FROM latest_valid_subscription s
WHERE p.id = s.user_id
  AND p.is_pro
  AND (
    p.subscription_period_end IS NULL
    OR p.subscription_period_end <= (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  );

UPDATE public.profiles
SET
  is_pro = FALSE,
  admin_override_pro = FALSE,
  subscription_status = 'free',
  subscription_tier = 'free',
  updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
WHERE is_pro
  AND (
    subscription_status IN ('active', 'past_due')
    OR subscription_tier IN ('pro', 'enterprise')
  )
  AND (
    subscription_period_end IS NULL
    OR subscription_period_end <= (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    OR COALESCE((
      SELECT s.cancel_at_period_end
      FROM public.subscriptions s
      WHERE s.user_id = profiles.id
      ORDER BY s.updated_at DESC
      LIMIT 1
    ), FALSE)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = profiles.id
      AND s.status IN ('active', 'past_due')
      AND NOT COALESCE(s.cancel_at_period_end, FALSE)
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end > (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  );

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
      p.is_pro
      AND p.subscription_status IN ('active', 'past_due')
      AND NOT COALESCE((
        SELECT s.cancel_at_period_end
        FROM public.subscriptions s
        WHERE s.user_id = p.id
        ORDER BY s.updated_at DESC
        LIMIT 1
      ), FALSE)
      AND p.subscription_period_end IS NOT NULL
      AND p.subscription_period_end > now_ms
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
      p.is_pro
      AND p.subscription_status IN ('active', 'past_due')
      AND NOT COALESCE((
        SELECT s.cancel_at_period_end
        FROM public.subscriptions s
        WHERE s.user_id = p.id
        ORDER BY s.updated_at DESC
        LIMIT 1
      ), FALSE)
      AND p.subscription_period_end IS NOT NULL
      AND p.subscription_period_end > now_ms
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
