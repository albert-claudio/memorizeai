-- ============================================================================
-- EXAM TARGETS
-- Stores per-deck exam/review goals with target date and retention.
-- This is separate from user_preferences.study_goal, which represents the
-- pedagogical profile (concurso, oab, enem, faculdade).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."exam_targets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "deck_id" text NOT NULL,
  "title" text NOT NULL,
  "target_date" bigint NOT NULL,
  "target_retention" double precision NOT NULL DEFAULT 0.95,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  "updated_at" bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint
);

CREATE UNIQUE INDEX IF NOT EXISTS exam_targets_pkey
  ON "public"."exam_targets" USING btree (id);

CREATE INDEX IF NOT EXISTS idx_exam_targets_user_id
  ON "public"."exam_targets" USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_exam_targets_deck_id_active
  ON "public"."exam_targets" USING btree (deck_id, is_active, target_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_targets_active_per_deck
  ON "public"."exam_targets" USING btree (deck_id)
  WHERE is_active = true;

ALTER TABLE "public"."exam_targets"
  ADD CONSTRAINT "exam_targets_pkey"
  PRIMARY KEY USING INDEX "exam_targets_pkey";

ALTER TABLE "public"."exam_targets"
  ADD CONSTRAINT "exam_targets_user_id_fkey"
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."exam_targets"
  ADD CONSTRAINT "exam_targets_deck_id_fkey"
  FOREIGN KEY (deck_id) REFERENCES public.decks(id) ON DELETE CASCADE;

ALTER TABLE "public"."exam_targets"
  ADD CONSTRAINT "exam_targets_target_retention_check"
  CHECK (target_retention >= 0.70 AND target_retention <= 0.99);

ALTER TABLE "public"."exam_targets" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exam targets"
  ON "public"."exam_targets"
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own exam targets"
  ON "public"."exam_targets"
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own exam targets"
  ON "public"."exam_targets"
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own exam targets"
  ON "public"."exam_targets"
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."exam_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_targets" TO "service_role";
