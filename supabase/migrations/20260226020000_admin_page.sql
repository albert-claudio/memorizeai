-- ============================================================================
-- Admin Page: admin_override_pro + admin_actions
-- ============================================================================

-- 1. Add admin_override_pro to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'admin_override_pro'
  ) THEN
    ALTER TABLE profiles ADD COLUMN admin_override_pro boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN profiles.admin_override_pro IS
      'Manual Pro override set by admin. Independent from Stripe billing.';
  END IF;
END $$;

-- 2. Admin actions audit table
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  target_user_id uuid NOT NULL REFERENCES auth.users(id),
  details jsonb,
  created_at bigint NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- Only service_role can access admin_actions (no client access)
CREATE POLICY "Service role full access admin_actions"
  ON public.admin_actions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_user ON public.admin_actions (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target_user ON public.admin_actions (target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON public.admin_actions (created_at DESC);
