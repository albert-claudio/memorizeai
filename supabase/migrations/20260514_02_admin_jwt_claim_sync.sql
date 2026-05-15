-- ============================================================================
-- Sync admin RBAC into Supabase Auth JWT app_metadata
-- ============================================================================
-- Admin access now requires both:
-- 1. profiles.app_role = 'admin' in the database
-- 2. auth.users.raw_app_meta_data.app_role = 'admin' in the JWT
--
-- After changing app_role, the user must refresh/re-login for the JWT claim to
-- be reflected in the active session.

CREATE OR REPLACE FUNCTION public.sync_profile_app_role_to_auth_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{app_role}',
    to_jsonb(NEW.app_role),
    true
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_app_role_auth_metadata_sync ON public.profiles;
CREATE TRIGGER profiles_app_role_auth_metadata_sync
AFTER INSERT OR UPDATE OF app_role ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_app_role_to_auth_metadata();

UPDATE auth.users u
SET raw_app_meta_data = jsonb_set(
  COALESCE(u.raw_app_meta_data, '{}'::jsonb),
  '{app_role}',
  to_jsonb(p.app_role),
  true
)
FROM public.profiles p
WHERE p.id = u.id
  AND p.app_role = 'admin';
