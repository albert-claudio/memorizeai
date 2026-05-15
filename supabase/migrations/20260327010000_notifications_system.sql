-- ============================================================================
-- NOTIFICATIONS SYSTEM
-- Structured preferences, inbox, delivery log, and browser device capability.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "notification_type" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "in_app_enabled" boolean NOT NULL DEFAULT true,
  "browser_enabled" boolean NOT NULL DEFAULT true,
  "email_enabled" boolean NOT NULL DEFAULT false,
  "created_at" bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  "updated_at" bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  CONSTRAINT "notification_preferences_type_check"
    CHECK ("notification_type" IN (
      'review_reminder',
      'daily_goal_missed',
      'streak_alert',
      'content_ready',
      'plan_renewal',
      'marketing'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_user_type_key
  ON public.notification_preferences (user_id, notification_type);

ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification preferences" ON "public"."notification_preferences";
CREATE POLICY "Users can view own notification preferences"
  ON "public"."notification_preferences"
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification preferences" ON "public"."notification_preferences";
CREATE POLICY "Users can insert own notification preferences"
  ON "public"."notification_preferences"
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification preferences" ON "public"."notification_preferences";
CREATE POLICY "Users can update own notification preferences"
  ON "public"."notification_preferences"
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";


CREATE TABLE IF NOT EXISTS "public"."notification_inbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "notification_type" text NOT NULL,
  "importance" text NOT NULL DEFAULT 'medium',
  "title" text NOT NULL,
  "body" text NOT NULL,
  "cta_label" text,
  "cta_url" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "dedupe_key" text,
  "read_at" bigint,
  "created_at" bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  "expires_at" bigint,
  CONSTRAINT "notification_inbox_type_check"
    CHECK ("notification_type" IN (
      'review_reminder',
      'daily_goal_missed',
      'streak_alert',
      'content_ready',
      'plan_renewal',
      'marketing'
    )),
  CONSTRAINT "notification_inbox_importance_check"
    CHECK ("importance" IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_notification_inbox_user_created
  ON public.notification_inbox (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS notification_inbox_user_dedupe_key
  ON public.notification_inbox (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE "public"."notification_inbox" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification inbox" ON "public"."notification_inbox";
CREATE POLICY "Users can view own notification inbox"
  ON "public"."notification_inbox"
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification inbox" ON "public"."notification_inbox";
CREATE POLICY "Users can update own notification inbox"
  ON "public"."notification_inbox"
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, UPDATE ON TABLE "public"."notification_inbox" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_inbox" TO "service_role";


CREATE TABLE IF NOT EXISTS "public"."notification_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notification_id" uuid NOT NULL REFERENCES public.notification_inbox(id) ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "channel" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "provider" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "external_id" text,
  "failure_reason" text,
  "delivered_at" bigint,
  "created_at" bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  "updated_at" bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  CONSTRAINT "notification_deliveries_channel_check"
    CHECK ("channel" IN ('in_app', 'browser', 'email')),
  CONSTRAINT "notification_deliveries_status_check"
    CHECK ("status" IN ('pending', 'sent', 'failed', 'skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_notification_channel_key
  ON public.notification_deliveries (notification_id, channel);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_channel_status
  ON public.notification_deliveries (user_id, channel, status, created_at DESC);

ALTER TABLE "public"."notification_deliveries" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access notification_deliveries" ON "public"."notification_deliveries";
CREATE POLICY "Service role full access notification_deliveries"
  ON "public"."notification_deliveries"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT ALL ON TABLE "public"."notification_deliveries" TO "service_role";


CREATE TABLE IF NOT EXISTS "public"."browser_notification_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "device_key" text NOT NULL,
  "permission" text NOT NULL DEFAULT 'default',
  "user_agent" text,
  "last_seen_at" bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  "created_at" bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  "updated_at" bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  CONSTRAINT "browser_notification_devices_permission_check"
    CHECK ("permission" IN ('default', 'granted', 'denied'))
);

CREATE UNIQUE INDEX IF NOT EXISTS browser_notification_devices_user_device_key
  ON public.browser_notification_devices (user_id, device_key);

ALTER TABLE "public"."browser_notification_devices" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own browser devices" ON "public"."browser_notification_devices";
CREATE POLICY "Users can view own browser devices"
  ON "public"."browser_notification_devices"
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own browser devices" ON "public"."browser_notification_devices";
CREATE POLICY "Users can manage own browser devices"
  ON "public"."browser_notification_devices"
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."browser_notification_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."browser_notification_devices" TO "service_role";
