-- ============================================================================
-- HARDEN SECURITY: Enforce Tier Limits at Database Level
-- Migration: 20260212000000_harden_security.sql
-- ============================================================================

-- Function to check upload limit (3 uploads / rolling 7 days)
CREATE OR REPLACE FUNCTION public.check_upload_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_pro_user BOOLEAN;
  upload_count INTEGER;
  week_start BIGINT;
BEGIN
  -- Check if user is Pro
  SELECT is_pro INTO is_pro_user
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- If user is Pro, allow everything
  IF is_pro_user THEN
    RETURN NEW;
  END IF;

  -- Calculate start of the rolling week window (7 days ago) in milliseconds
  -- Current timestamp in ms - 7 days * 24 hours * 60 mins * 60 secs * 1000 ms
  week_start := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT - (7 * 24 * 60 * 60 * 1000);

  -- Count uploads in the last 7 days (INCLUDING deleted ones)
  -- "Trust No Client": We count everything created in the window.
  SELECT COUNT(*) INTO upload_count
  FROM public.sources
  WHERE user_id = NEW.user_id
    AND created_at >= week_start;

  -- Free tier limit: 3 uploads per week
  IF upload_count >= 3 THEN
    RAISE EXCEPTION 'Upload limit reached (3/week). Upgrade to Pro for unlimited uploads.';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger for upload limit
DROP TRIGGER IF EXISTS check_upload_limit_trigger ON public.sources;
CREATE TRIGGER check_upload_limit_trigger
BEFORE INSERT ON public.sources
FOR EACH ROW
EXECUTE FUNCTION public.check_upload_limit();


-- Function to check run limits (Max 10 items, Pro objectives restricted)
CREATE OR REPLACE FUNCTION public.check_run_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_pro_user BOOLEAN;
BEGIN
  -- Check if user is Pro
  SELECT is_pro INTO is_pro_user
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- If user is Pro, allow (we rely on client/server constraints for sensible max counts, e.g. 50)
  IF is_pro_user THEN
    RETURN NEW;
  END IF;

  -- Free Tier Restrictions
  
  -- 1. Objective Check
  -- Free users can ONLY do 'flashcards'
  IF NEW.objective <> 'flashcards' THEN
     RAISE EXCEPTION 'This feature is Pro only. Upgrade to access.';
  END IF;

  -- 2. Item Count Check
  -- Free users limited to 10 items
  IF NEW.target_count > 10 THEN
     RAISE EXCEPTION 'Free users are limited to 10 items per run. Upgrade to generate more.';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger for run limits
DROP TRIGGER IF EXISTS check_run_limits_trigger ON public.runs;
CREATE TRIGGER check_run_limits_trigger
BEFORE INSERT ON public.runs
FOR EACH ROW
EXECUTE FUNCTION public.check_run_limits();
