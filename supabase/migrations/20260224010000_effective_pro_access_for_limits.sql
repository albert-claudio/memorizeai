-- ============================================================================
-- Enforce effective Pro access in DB limit triggers
-- Migration: 20260224010000_effective_pro_access_for_limits.sql
-- ============================================================================

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
  -- Effective Pro requires:
  -- 1) is_pro = true
  -- 2) status in active/past_due
  -- 3) period still valid (past_due must always have period_end)
  SELECT COALESCE((
    SELECT (
      p.is_pro
      AND (
        p.subscription_status = 'active'
        OR (
          p.subscription_status = 'past_due'
          AND p.subscription_period_end IS NOT NULL
          AND p.subscription_period_end > now_ms
        )
      )
      AND (
        p.subscription_period_end IS NULL
        OR p.subscription_period_end > now_ms
      )
    )
    FROM public.profiles p
    WHERE p.id = NEW.user_id
  ), FALSE)
  INTO is_effective_pro;

  IF is_effective_pro THEN
    RETURN NEW;
  END IF;

  -- Calculate start of rolling 7-day window in milliseconds
  week_start := now_ms - (7 * 24 * 60 * 60 * 1000);

  -- Count uploads in the last 7 days (including deleted rows)
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
  -- Effective Pro requires:
  -- 1) is_pro = true
  -- 2) status in active/past_due
  -- 3) period still valid (past_due must always have period_end)
  SELECT COALESCE((
    SELECT (
      p.is_pro
      AND (
        p.subscription_status = 'active'
        OR (
          p.subscription_status = 'past_due'
          AND p.subscription_period_end IS NOT NULL
          AND p.subscription_period_end > now_ms
        )
      )
      AND (
        p.subscription_period_end IS NULL
        OR p.subscription_period_end > now_ms
      )
    )
    FROM public.profiles p
    WHERE p.id = NEW.user_id
  ), FALSE)
  INTO is_effective_pro;

  IF is_effective_pro THEN
    RETURN NEW;
  END IF;

  -- Free users can only create flashcards
  IF NEW.objective <> 'flashcards' THEN
    RAISE EXCEPTION 'This feature is Pro only. Upgrade to access.';
  END IF;

  -- Free users are limited to 10 items
  IF NEW.target_count > 10 THEN
    RAISE EXCEPTION 'Free users are limited to 10 items per run. Upgrade to generate more.';
  END IF;

  RETURN NEW;
END;
$$;
