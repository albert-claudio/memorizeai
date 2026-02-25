-- ============================================================================
-- Security Hardening: RLS, webhook_logs unique constraint, storage policies
-- ============================================================================

-- ============================================================================
-- 1. webhook_logs: enable RLS + restrict to service_role only
-- ============================================================================
alter table "public"."webhook_logs" enable row level security;

create policy "Service role full access webhook_logs"
  on "public"."webhook_logs"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));

-- ============================================================================
-- 2. Unique constraint on webhook_logs.event_id (prevent duplicate processing)
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS webhook_logs_event_id_key
  ON public.webhook_logs (event_id)
  WHERE event_id IS NOT NULL;

-- ============================================================================
-- 3. Tighten storage "sources" bucket policies
--    Was: any authenticated user can insert/view ALL sources
--    Now: users can only access their own folder (user_id prefix)
-- ============================================================================
DROP POLICY IF EXISTS "Users can upload sources" ON "storage"."objects";
DROP POLICY IF EXISTS "Users can view their own sources" ON "storage"."objects";

create policy "Users can upload to own sources folder"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (
  (bucket_id = 'sources'::text)
  AND ((storage.foldername(name))[1] = (auth.uid())::text)
);

create policy "Users can view own sources files"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (
  (bucket_id = 'sources'::text)
  AND ((storage.foldername(name))[1] = (auth.uid())::text)
);

create policy "Users can delete own sources files"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (
  (bucket_id = 'sources'::text)
  AND ((storage.foldername(name))[1] = (auth.uid())::text)
);

-- Service role full access on sources bucket
create policy "Service role full access sources"
  on "storage"."objects"
  as permissive
  for all
  to public
using (((bucket_id = 'sources'::text) AND (auth.role() = 'service_role'::text)));
