-- ============================================================================
-- Private beta invites
-- ============================================================================
-- Admins can invite up to 30 active beta testers by email. A redeemed invite
-- grants a 30-day internal Pro trial through the existing profiles/subscriptions
-- access model.

CREATE TABLE IF NOT EXISTS public.beta_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  send_count integer NOT NULL DEFAULT 0,
  email_delivery_status text,
  email_delivery_error text,
  expires_at bigint NOT NULL,
  sent_at bigint,
  redeemed_at bigint,
  trial_started_at bigint,
  trial_ends_at bigint,
  created_at bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * 1000)::numeric)::bigint,
  updated_at bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * 1000)::numeric)::bigint,
  CONSTRAINT beta_invites_email_lowercase CHECK (email = lower(trim(email))),
  CONSTRAINT beta_invites_status_check CHECK (status IN ('pending', 'sent', 'redeemed', 'expired', 'revoked')),
  CONSTRAINT beta_invites_delivery_status_check CHECK (
    email_delivery_status IS NULL OR email_delivery_status IN ('sent', 'failed', 'skipped')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS beta_invites_email_key
  ON public.beta_invites (email);

CREATE UNIQUE INDEX IF NOT EXISTS beta_invites_user_id_key
  ON public.beta_invites (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_beta_invites_status
  ON public.beta_invites (status);

ALTER TABLE public.beta_invites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.beta_invites FROM anon;
REVOKE ALL ON TABLE public.beta_invites FROM authenticated;
GRANT ALL ON TABLE public.beta_invites TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_beta_invite_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_count integer;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IN ('pending', 'sent', 'redeemed') THEN
    SELECT COUNT(*) INTO active_count
    FROM public.beta_invites
    WHERE status IN ('pending', 'sent', 'redeemed');

    IF active_count >= 30 THEN
      RAISE EXCEPTION 'Private beta invite limit reached (30 active invites).';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status NOT IN ('pending', 'sent', 'redeemed')
    AND NEW.status IN ('pending', 'sent', 'redeemed')
  THEN
    SELECT COUNT(*) INTO active_count
    FROM public.beta_invites
    WHERE status IN ('pending', 'sent', 'redeemed')
      AND id <> NEW.id;

    IF active_count >= 30 THEN
      RAISE EXCEPTION 'Private beta invite limit reached (30 active invites).';
    END IF;
  END IF;

  NEW.email = lower(trim(NEW.email));
  NEW.updated_at = ((EXTRACT(epoch FROM now()) * 1000)::numeric)::bigint;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS beta_invites_limit_trigger ON public.beta_invites;
CREATE TRIGGER beta_invites_limit_trigger
BEFORE INSERT OR UPDATE ON public.beta_invites
FOR EACH ROW
EXECUTE FUNCTION public.enforce_beta_invite_limit();
