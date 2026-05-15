-- ============================================================================
-- USER PREFERENCES TABLE
-- Stores all user-configurable settings (flat, no JSONB)
-- ============================================================================

CREATE TABLE "public"."user_preferences" (
  "user_id"                  uuid NOT NULL,

  -- Objetivo de Estudo
  "study_goal"               text NOT NULL DEFAULT 'concurso',

  -- Meta Diária
  "daily_reviews"            integer NOT NULL DEFAULT 30,
  "daily_new_cards"          integer NOT NULL DEFAULT 10,
  "daily_study_minutes"      integer NOT NULL DEFAULT 60,

  -- Horário de Estudo
  "study_period"             text NOT NULL DEFAULT 'noite',
  "reminder_time"            text NOT NULL DEFAULT '20:00',

  -- Dias da Semana ('all' or CSV: 'seg,ter,qua,qui,sex')
  "study_days"               text NOT NULL DEFAULT 'all',

  -- Modo de Revisão
  "review_overdue_first"     boolean NOT NULL DEFAULT true,
  "mix_new_and_review"       boolean NOT NULL DEFAULT true,
  "prioritize_weak"          boolean NOT NULL DEFAULT false,
  "prioritize_near_exam"     boolean NOT NULL DEFAULT false,
  "simple_mode"              boolean NOT NULL DEFAULT false,
  "review_intensity"         text NOT NULL DEFAULT 'normal',

  -- Modo Avançado
  "fsrs_enabled"             boolean NOT NULL DEFAULT true,
  "interval_limit_days"      integer NOT NULL DEFAULT 365,
  "daily_load_tolerance"     integer NOT NULL DEFAULT 100,
  "auto_reschedule_missed"   boolean NOT NULL DEFAULT true,
  "bury_siblings"            boolean NOT NULL DEFAULT true,

  -- Notificações
  "notify_review"            boolean NOT NULL DEFAULT true,
  "notify_daily_goal"        boolean NOT NULL DEFAULT true,
  "notify_streak"            boolean NOT NULL DEFAULT true,
  "notify_content_ready"     boolean NOT NULL DEFAULT true,
  "notify_plan_renewal"      boolean NOT NULL DEFAULT true,
  "email_marketing"          boolean NOT NULL DEFAULT true,
  "push_enabled"             boolean NOT NULL DEFAULT true,

  -- Interface
  "theme"                    text NOT NULL DEFAULT 'dark',
  "font_size"                text NOT NULL DEFAULT 'medium',
  "animations_enabled"       boolean NOT NULL DEFAULT true,
  "show_streak"              boolean NOT NULL DEFAULT true,
  "show_study_time"          boolean NOT NULL DEFAULT true,
  "sound_vibration"          boolean NOT NULL DEFAULT true,
  "app_language"             text NOT NULL DEFAULT 'pt-BR',
  "date_format"              text NOT NULL DEFAULT 'DD/MM/YYYY',

  -- Produtividade
  "focus_mode"               boolean NOT NULL DEFAULT false,
  "hide_distractions"        boolean NOT NULL DEFAULT false,
  "pomodoro_enabled"         boolean NOT NULL DEFAULT false,
  "auto_breaks"              boolean NOT NULL DEFAULT false,
  "sound_on_complete"        boolean NOT NULL DEFAULT false,
  "open_on_review"           boolean NOT NULL DEFAULT false,

  -- Timestamps
  "created_at"               bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  "updated_at"               bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint
);

-- Primary key
CREATE UNIQUE INDEX user_preferences_pkey ON public.user_preferences USING btree (user_id);
ALTER TABLE "public"."user_preferences" ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY USING INDEX "user_preferences_pkey";

-- Foreign key
ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_user_id_fkey"
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Row Level Security
ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON "public"."user_preferences"
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON "public"."user_preferences"
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON "public"."user_preferences"
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Grants
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";

-- CHECK constraints
ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_study_goal_check"
  CHECK (study_goal IN ('concurso', 'oab', 'enem', 'faculdade'));

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_study_period_check"
  CHECK (study_period IN ('manha', 'tarde', 'noite'));

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_review_intensity_check"
  CHECK (review_intensity IN ('leve', 'normal', 'pesada'));

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_theme_check"
  CHECK (theme IN ('light', 'dark', 'system'));

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_font_size_check"
  CHECK (font_size IN ('small', 'medium', 'large'));

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_daily_reviews_check"
  CHECK (daily_reviews >= 1 AND daily_reviews <= 500);

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_daily_new_cards_check"
  CHECK (daily_new_cards >= 0 AND daily_new_cards <= 200);

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_daily_study_minutes_check"
  CHECK (daily_study_minutes >= 5 AND daily_study_minutes <= 720);

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_interval_limit_check"
  CHECK (interval_limit_days >= 1 AND interval_limit_days <= 3650);

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_daily_load_tolerance_check"
  CHECK (daily_load_tolerance >= 10 AND daily_load_tolerance <= 1000);
