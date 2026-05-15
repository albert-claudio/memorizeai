-- ============================================================================
-- RBAC: persist application role on profiles
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'app_role'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN app_role text NOT NULL DEFAULT 'user';

    COMMENT ON COLUMN public.profiles.app_role IS
      'Application role used for RBAC. Allowed values: user, admin.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_app_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_app_role_check
      CHECK (app_role IN ('user', 'admin'));
  END IF;
END $$;

REVOKE SELECT ON TABLE "public"."profiles" FROM "authenticated";
GRANT SELECT (
  id,
  is_pro,
  subscription_status,
  subscription_tier,
  subscription_period_end,
  admin_override_pro,
  app_role,
  created_at,
  updated_at
) ON TABLE "public"."profiles" TO "authenticated";
