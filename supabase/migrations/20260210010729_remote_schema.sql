-- ============================================================================
-- MEMORIZA - Complete Database Schema
-- Migration: 20260210010729_remote_schema.sql
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
drop extension if exists "pg_net";



-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- 2.1 card_references
  create table "public"."card_references" (
    "id" text not null,
    "card_id" text not null,
    "chunk_id" text not null,
    "source_id" text not null,
    "page_number" integer,
    "excerpt" text not null,
    "created_at" bigint not null
      );


alter table "public"."card_references" enable row level security;


-- 2.2 card_reviews
  create table "public"."card_reviews" (
    "id" uuid not null default gen_random_uuid(),
    "card_id" text not null,
    "user_id" uuid not null,
    "grade" integer not null,
    "difficulty_before" double precision not null,
    "stability_before" double precision not null,
    "interval_days" double precision not null,
    "reviewed_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "created_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint
      );



-- 2.3 cards
  create table "public"."cards" (
    "id" text not null,
    "deck_id" text not null,
    "front" text not null,
    "back" text not null,
    "step" integer not null default 0,
    "next_review_at" bigint,
    "created_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "updated_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "deleted_at" bigint,
    "source_id" text,
    "citation_text" text
      );


alter table "public"."cards" enable row level security;


-- 2.4 chunks
  create table "public"."chunks" (
    "id" text not null,
    "content_hash" text not null,
    "content" text not null,
    "page_number" integer,
    "char_start" integer,
    "char_end" integer,
    "created_at" bigint not null
      );


alter table "public"."chunks" enable row level security;


-- 2.5 decks
  create table "public"."decks" (
    "id" text not null,
    "user_id" uuid not null,
    "title" text not null,
    "description" text,
    "created_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "updated_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "deleted_at" bigint
      );


alter table "public"."decks" enable row level security;


-- 2.6 profiles
  create table "public"."profiles" (
    "id" uuid not null,
    "is_pro" boolean not null default false,
    "stripe_customer_id" text,
    "created_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "updated_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "deleted_at" bigint,
    "subscription_status" text default 'free'::text,
    "subscription_tier" text default 'free'::text,
    "subscription_period_end" bigint
      );


alter table "public"."profiles" enable row level security;


-- 2.7 runs
  create table "public"."runs" (
    "id" text not null,
    "user_id" uuid not null,
    "source_id" text not null,
    "deck_id" text,
    "objective" text not null,
    "model_preference" text not null default 'auto'::text,
    "target_count" integer default 10,
    "status" text not null default 'pendente'::text,
    "model_used" text,
    "attempt_count" integer default 0,
    "items_generated" integer default 0,
    "error_message" text,
    "started_at" bigint,
    "completed_at" bigint,
    "created_at" bigint not null,
    "updated_at" bigint not null,
    "deleted_at" bigint,
    "simulado_id" text
      );


alter table "public"."runs" enable row level security;


-- 2.8 simulado_questoes
  create table "public"."simulado_questoes" (
    "id" text not null,
    "simulado_id" text,
    "numero" integer not null,
    "enunciado" text not null,
    "alternativa_a" text not null,
    "alternativa_b" text not null,
    "alternativa_c" text not null,
    "alternativa_d" text not null,
    "alternativa_e" text not null,
    "resposta_correta" text not null,
    "comentario" text,
    "chunk_id" text,
    "citation_excerpt" text,
    "created_at" bigint not null
      );


alter table "public"."simulado_questoes" enable row level security;


-- 2.9 simulado_respostas
  create table "public"."simulado_respostas" (
    "id" text not null,
    "simulado_id" text,
    "questao_id" text,
    "resposta_usuario" text,
    "correta" boolean,
    "tempo_segundos" integer,
    "respondido_em" bigint,
    "created_at" bigint not null
      );


alter table "public"."simulado_respostas" enable row level security;


-- 2.10 simulados
  create table "public"."simulados" (
    "id" text not null,
    "run_id" text,
    "user_id" uuid not null,
    "source_id" text,
    "titulo" text not null,
    "total_questoes" integer not null default 0,
    "status" text default 'pendente'::text,
    "acertos" integer,
    "erros" integer,
    "tempo_total_segundos" integer,
    "iniciado_em" bigint,
    "finalizado_em" bigint,
    "created_at" bigint not null,
    "updated_at" bigint,
    "deleted_at" bigint
      );


alter table "public"."simulados" enable row level security;


-- 2.11 source_chunks
  create table "public"."source_chunks" (
    "source_id" text not null,
    "chunk_id" text not null,
    "position" integer not null,
    "created_at" bigint not null
      );


alter table "public"."source_chunks" enable row level security;


-- 2.12 sources
  create table "public"."sources" (
    "id" text not null,
    "user_id" uuid not null,
    "filename" text not null,
    "storage_path" text not null,
    "status" text not null default 'uploading'::text,
    "progress" integer default 0,
    "total_pages" integer,
    "error_message" text,
    "created_at" bigint not null,
    "updated_at" bigint not null,
    "deleted_at" bigint,
    "file_type" text default 'pdf'::text
      );


alter table "public"."sources" enable row level security;


-- 2.13 study_goals
  create table "public"."study_goals" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "deck_id" text,
    "title" text not null,
    "target_date" bigint not null,
    "target_retention" double precision default 0.95,
    "is_active" boolean default true,
    "created_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "updated_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "deleted_at" bigint
      );



-- 2.14 subscriptions
  create table "public"."subscriptions" (
    "id" text not null default public.generate_subscription_id(),
    "user_id" uuid not null,
    "stripe_subscription_id" text,
    "stripe_customer_id" text not null,
    "price_id" text,
    "status" text not null default 'incomplete'::text,
    "current_period_start" bigint,
    "current_period_end" bigint,
    "cancel_at_period_end" boolean default false,
    "created_at" bigint not null default (EXTRACT(epoch FROM now()) * (1000)::numeric),
    "updated_at" bigint not null default (EXTRACT(epoch FROM now()) * (1000)::numeric)
      );


alter table "public"."subscriptions" enable row level security;


-- 2.15 user_credits
  create table "public"."user_credits" (
    "user_id" uuid not null,
    "plan_runs_remaining" integer default 10,
    "extra_credits" integer default 0,
    "last_plan_reset" bigint,
    "created_at" bigint not null,
    "updated_at" bigint not null
      );


alter table "public"."user_credits" enable row level security;


-- 2.16 user_srs_settings
  create table "public"."user_srs_settings" (
    "user_id" uuid not null,
    "desired_retention" double precision default 0.9,
    "calibration_enabled" boolean default true,
    "last_calibration_at" bigint,
    "review_count_since_calibration" integer default 0,
    "created_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "updated_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint
      );


alter table "public"."user_srs_settings" enable row level security;


-- 2.17 user_weights
  create table "public"."user_weights" (
    "user_id" uuid not null,
    "weights" jsonb not null default '{"w0": 0.4, "w1": 0.6, "w2": 2.4, "w3": 5.8, "w4": 4.93, "w5": 0.94, "w6": 1.14, "w7": 0.05, "w8": 0.35, "w9": 2.5, "w10": 0.94, "w11": 2.18, "w12": 0.05, "w13": 0.34, "w14": 0.75, "w15": 0.35, "w16": 2.61}'::jsonb,
    "metrics" jsonb,
    "is_custom" boolean default false,
    "created_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "updated_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint
      );


alter table "public"."user_weights" enable row level security;


-- 2.18 webhook_logs
  create table "public"."webhook_logs" (
    "id" uuid not null default gen_random_uuid(),
    "ip_address" text not null,
    "event_id" text,
    "event_type" text,
    "success" boolean not null default false,
    "error_message" text,
    "signature_valid" boolean not null default false,
    "timestamp_valid" boolean not null default false,
    "processing_time_ms" integer,
    "created_at" bigint not null default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint
      );



-- ============================================================================
-- 3. INDEXES
-- ============================================================================
CREATE UNIQUE INDEX card_references_card_id_chunk_id_key ON public.card_references USING btree (card_id, chunk_id);

CREATE UNIQUE INDEX card_references_pkey ON public.card_references USING btree (id);

CREATE UNIQUE INDEX card_reviews_pkey ON public.card_reviews USING btree (id);

CREATE UNIQUE INDEX cards_pkey ON public.cards USING btree (id);

CREATE UNIQUE INDEX chunks_content_hash_key ON public.chunks USING btree (content_hash);

CREATE UNIQUE INDEX chunks_pkey ON public.chunks USING btree (id);

CREATE UNIQUE INDEX decks_pkey ON public.decks USING btree (id);

CREATE INDEX idx_card_references_card ON public.card_references USING btree (card_id);

CREATE INDEX idx_card_references_chunk ON public.card_references USING btree (chunk_id);

CREATE INDEX idx_card_references_source ON public.card_references USING btree (source_id);

CREATE INDEX idx_card_reviews_card_id ON public.card_reviews USING btree (card_id);

CREATE INDEX idx_card_reviews_reviewed_at ON public.card_reviews USING btree (reviewed_at DESC);

CREATE INDEX idx_card_reviews_user_id ON public.card_reviews USING btree (user_id);

CREATE INDEX idx_cards_deck_id ON public.cards USING btree (deck_id);

CREATE INDEX idx_cards_next_review ON public.cards USING btree (next_review_at);

CREATE INDEX idx_cards_updated_at ON public.cards USING btree (updated_at);

CREATE INDEX idx_chunks_hash ON public.chunks USING btree (content_hash);

CREATE INDEX idx_decks_updated_at ON public.decks USING btree (updated_at);

CREATE INDEX idx_decks_user_id ON public.decks USING btree (user_id);

CREATE INDEX idx_profiles_stripe_customer_id ON public.profiles USING btree (stripe_customer_id);

CREATE INDEX idx_profiles_updated_at ON public.profiles USING btree (updated_at);

CREATE INDEX idx_runs_created_at ON public.runs USING btree (created_at DESC);

CREATE INDEX idx_runs_simulado_id ON public.runs USING btree (simulado_id);

CREATE INDEX idx_runs_source_id ON public.runs USING btree (source_id);

CREATE INDEX idx_runs_status ON public.runs USING btree (status);

CREATE INDEX idx_runs_user_id ON public.runs USING btree (user_id);

CREATE INDEX idx_simulado_questoes_simulado_id ON public.simulado_questoes USING btree (simulado_id);

CREATE INDEX idx_simulado_respostas_questao_id ON public.simulado_respostas USING btree (questao_id);

CREATE INDEX idx_simulado_respostas_simulado_id ON public.simulado_respostas USING btree (simulado_id);

CREATE INDEX idx_simulados_status ON public.simulados USING btree (status);

CREATE INDEX idx_simulados_user_id ON public.simulados USING btree (user_id);

CREATE INDEX idx_source_chunks_chunk ON public.source_chunks USING btree (chunk_id);

CREATE INDEX idx_source_chunks_source ON public.source_chunks USING btree (source_id);

CREATE INDEX idx_sources_status ON public.sources USING btree (status);

CREATE INDEX idx_sources_user_id ON public.sources USING btree (user_id);

CREATE INDEX idx_subscriptions_stripe_customer_id ON public.subscriptions USING btree (stripe_customer_id);

CREATE INDEX idx_subscriptions_stripe_subscription_id ON public.subscriptions USING btree (stripe_subscription_id);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);

CREATE INDEX idx_user_srs_settings_calibration ON public.user_srs_settings USING btree (calibration_enabled, last_calibration_at);

CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs USING btree (created_at DESC);

CREATE INDEX idx_webhook_logs_ip_address ON public.webhook_logs USING btree (ip_address);

CREATE INDEX idx_webhook_logs_success ON public.webhook_logs USING btree (success) WHERE (success = false);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX runs_pkey ON public.runs USING btree (id);

CREATE UNIQUE INDEX simulado_questoes_pkey ON public.simulado_questoes USING btree (id);

CREATE UNIQUE INDEX simulado_respostas_pkey ON public.simulado_respostas USING btree (id);

CREATE UNIQUE INDEX simulados_pkey ON public.simulados USING btree (id);

CREATE UNIQUE INDEX source_chunks_pkey ON public.source_chunks USING btree (source_id, chunk_id);

CREATE UNIQUE INDEX sources_pkey ON public.sources USING btree (id);

CREATE UNIQUE INDEX study_goals_pkey ON public.study_goals USING btree (id);

CREATE UNIQUE INDEX subscriptions_pkey ON public.subscriptions USING btree (id);

CREATE UNIQUE INDEX subscriptions_stripe_subscription_id_key ON public.subscriptions USING btree (stripe_subscription_id);

CREATE UNIQUE INDEX user_credits_pkey ON public.user_credits USING btree (user_id);

CREATE UNIQUE INDEX user_srs_settings_pkey ON public.user_srs_settings USING btree (user_id);

CREATE UNIQUE INDEX user_weights_pkey ON public.user_weights USING btree (user_id);

CREATE UNIQUE INDEX webhook_logs_pkey ON public.webhook_logs USING btree (id);


-- ============================================================================
-- 4. PRIMARY KEYS
-- ============================================================================
alter table "public"."card_references" add constraint "card_references_pkey" PRIMARY KEY using index "card_references_pkey";

alter table "public"."card_reviews" add constraint "card_reviews_pkey" PRIMARY KEY using index "card_reviews_pkey";

alter table "public"."cards" add constraint "cards_pkey" PRIMARY KEY using index "cards_pkey";

alter table "public"."chunks" add constraint "chunks_pkey" PRIMARY KEY using index "chunks_pkey";

alter table "public"."decks" add constraint "decks_pkey" PRIMARY KEY using index "decks_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."runs" add constraint "runs_pkey" PRIMARY KEY using index "runs_pkey";

alter table "public"."simulado_questoes" add constraint "simulado_questoes_pkey" PRIMARY KEY using index "simulado_questoes_pkey";

alter table "public"."simulado_respostas" add constraint "simulado_respostas_pkey" PRIMARY KEY using index "simulado_respostas_pkey";

alter table "public"."simulados" add constraint "simulados_pkey" PRIMARY KEY using index "simulados_pkey";

alter table "public"."source_chunks" add constraint "source_chunks_pkey" PRIMARY KEY using index "source_chunks_pkey";

alter table "public"."sources" add constraint "sources_pkey" PRIMARY KEY using index "sources_pkey";

alter table "public"."study_goals" add constraint "study_goals_pkey" PRIMARY KEY using index "study_goals_pkey";

alter table "public"."subscriptions" add constraint "subscriptions_pkey" PRIMARY KEY using index "subscriptions_pkey";

alter table "public"."user_credits" add constraint "user_credits_pkey" PRIMARY KEY using index "user_credits_pkey";

alter table "public"."user_srs_settings" add constraint "user_srs_settings_pkey" PRIMARY KEY using index "user_srs_settings_pkey";

alter table "public"."user_weights" add constraint "user_weights_pkey" PRIMARY KEY using index "user_weights_pkey";

alter table "public"."webhook_logs" add constraint "webhook_logs_pkey" PRIMARY KEY using index "webhook_logs_pkey";


-- ============================================================================
-- 5. FOREIGN KEYS & CONSTRAINTS
-- ============================================================================
alter table "public"."card_references" add constraint "card_references_card_id_chunk_id_key" UNIQUE using index "card_references_card_id_chunk_id_key";

alter table "public"."card_references" add constraint "card_references_card_id_fkey" FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE not valid;

alter table "public"."card_references" validate constraint "card_references_card_id_fkey";

alter table "public"."card_references" add constraint "card_references_chunk_id_fkey" FOREIGN KEY (chunk_id) REFERENCES public.chunks(id) ON DELETE CASCADE not valid;

alter table "public"."card_references" validate constraint "card_references_chunk_id_fkey";

alter table "public"."card_references" add constraint "card_references_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE not valid;

alter table "public"."card_references" validate constraint "card_references_source_id_fkey";

alter table "public"."card_reviews" add constraint "card_reviews_card_id_fkey" FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE not valid;

alter table "public"."card_reviews" validate constraint "card_reviews_card_id_fkey";

alter table "public"."card_reviews" add constraint "card_reviews_grade_check" CHECK (((grade >= 0) AND (grade <= 3))) not valid;

alter table "public"."card_reviews" validate constraint "card_reviews_grade_check";

alter table "public"."card_reviews" add constraint "card_reviews_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."card_reviews" validate constraint "card_reviews_user_id_fkey";

alter table "public"."cards" add constraint "cards_deck_id_fkey" FOREIGN KEY (deck_id) REFERENCES public.decks(id) ON DELETE CASCADE not valid;

alter table "public"."cards" validate constraint "cards_deck_id_fkey";

alter table "public"."cards" add constraint "cards_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.sources(id) not valid;

alter table "public"."cards" validate constraint "cards_source_id_fkey";

alter table "public"."chunks" add constraint "chunks_content_hash_key" UNIQUE using index "chunks_content_hash_key";

alter table "public"."decks" add constraint "decks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."decks" validate constraint "decks_user_id_fkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."runs" add constraint "runs_deck_id_fkey" FOREIGN KEY (deck_id) REFERENCES public.decks(id) ON DELETE SET NULL not valid;

alter table "public"."runs" validate constraint "runs_deck_id_fkey";

alter table "public"."runs" add constraint "runs_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE not valid;

alter table "public"."runs" validate constraint "runs_source_id_fkey";

alter table "public"."runs" add constraint "runs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."runs" validate constraint "runs_user_id_fkey";

alter table "public"."runs" add constraint "valid_model" CHECK ((model_preference = ANY (ARRAY['groq'::text, 'gemini'::text, 'auto'::text]))) not valid;

alter table "public"."runs" validate constraint "valid_model";

alter table "public"."runs" add constraint "valid_objective" CHECK ((objective = ANY (ARRAY['flashcards'::text, 'questoes_banca'::text, 'logica_juridica'::text]))) not valid;

alter table "public"."runs" validate constraint "valid_objective";

alter table "public"."runs" add constraint "valid_status" CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'concluido'::text, 'erro'::text]))) not valid;

alter table "public"."runs" validate constraint "valid_status";

alter table "public"."simulado_questoes" add constraint "simulado_questoes_simulado_id_fkey" FOREIGN KEY (simulado_id) REFERENCES public.simulados(id) ON DELETE CASCADE not valid;

alter table "public"."simulado_questoes" validate constraint "simulado_questoes_simulado_id_fkey";

alter table "public"."simulado_respostas" add constraint "simulado_respostas_questao_id_fkey" FOREIGN KEY (questao_id) REFERENCES public.simulado_questoes(id) ON DELETE CASCADE not valid;

alter table "public"."simulado_respostas" validate constraint "simulado_respostas_questao_id_fkey";

alter table "public"."simulado_respostas" add constraint "simulado_respostas_simulado_id_fkey" FOREIGN KEY (simulado_id) REFERENCES public.simulados(id) ON DELETE CASCADE not valid;

alter table "public"."simulado_respostas" validate constraint "simulado_respostas_simulado_id_fkey";

alter table "public"."simulados" add constraint "simulados_run_id_fkey" FOREIGN KEY (run_id) REFERENCES public.runs(id) not valid;

alter table "public"."simulados" validate constraint "simulados_run_id_fkey";

alter table "public"."simulados" add constraint "simulados_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.sources(id) not valid;

alter table "public"."simulados" validate constraint "simulados_source_id_fkey";

alter table "public"."simulados" add constraint "simulados_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."simulados" validate constraint "simulados_user_id_fkey";

alter table "public"."source_chunks" add constraint "source_chunks_chunk_id_fkey" FOREIGN KEY (chunk_id) REFERENCES public.chunks(id) ON DELETE CASCADE not valid;

alter table "public"."source_chunks" validate constraint "source_chunks_chunk_id_fkey";

alter table "public"."source_chunks" add constraint "source_chunks_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE not valid;

alter table "public"."source_chunks" validate constraint "source_chunks_source_id_fkey";

alter table "public"."sources" add constraint "sources_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."sources" validate constraint "sources_user_id_fkey";

alter table "public"."sources" add constraint "valid_status" CHECK ((status = ANY (ARRAY['na_fila'::text, 'processando'::text, 'concluido'::text, 'erro'::text]))) not valid;

alter table "public"."sources" validate constraint "valid_status";

alter table "public"."study_goals" add constraint "study_goals_deck_id_fkey" FOREIGN KEY (deck_id) REFERENCES public.decks(id) ON DELETE CASCADE not valid;

alter table "public"."study_goals" validate constraint "study_goals_deck_id_fkey";

alter table "public"."study_goals" add constraint "study_goals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."study_goals" validate constraint "study_goals_user_id_fkey";

alter table "public"."subscriptions" add constraint "subscriptions_stripe_subscription_id_key" UNIQUE using index "subscriptions_stripe_subscription_id_key";

alter table "public"."subscriptions" add constraint "subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_user_id_fkey";

alter table "public"."user_credits" add constraint "user_credits_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_credits" validate constraint "user_credits_user_id_fkey";

alter table "public"."user_srs_settings" add constraint "user_srs_settings_desired_retention_check" CHECK (((desired_retention >= (0.70)::double precision) AND (desired_retention <= (0.99)::double precision))) not valid;

alter table "public"."user_srs_settings" validate constraint "user_srs_settings_desired_retention_check";

alter table "public"."user_srs_settings" add constraint "user_srs_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_srs_settings" validate constraint "user_srs_settings_user_id_fkey";

alter table "public"."user_weights" add constraint "user_weights_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_weights" validate constraint "user_weights_user_id_fkey";


-- ============================================================================
-- 6. FUNCTIONS
-- ============================================================================
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_logs()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  DELETE FROM webhook_logs
  WHERE created_at < (EXTRACT(EPOCH FROM NOW()) * 1000 - 90 * 24 * 60 * 60 * 1000)::BIGINT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_user_credits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.user_credits (user_id, plan_runs_remaining, extra_credits, created_at, updated_at)
  VALUES (NEW.id, 10, 0, EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.deduct_user_credit(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_plan_remaining INTEGER;
  v_extra INTEGER;
BEGIN
  -- Get current credits with row lock
  SELECT plan_runs_remaining, extra_credits 
  INTO v_plan_remaining, v_extra
  FROM user_credits 
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- No record found, create one
  IF NOT FOUND THEN
    INSERT INTO user_credits (user_id, plan_runs_remaining, extra_credits, created_at, updated_at)
    VALUES (p_user_id, 9, 0, EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000);
    RETURN TRUE;
  END IF;
  
  -- Try to deduct from plan first
  IF v_plan_remaining > 0 THEN
    UPDATE user_credits 
    SET plan_runs_remaining = plan_runs_remaining - 1,
        updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;
  
  -- Try extra credits
  IF v_extra > 0 THEN
    UPDATE user_credits 
    SET extra_credits = extra_credits - 1,
        updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;
  
  -- No credits available
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_subscription_id()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN 'sub_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO profiles (id, is_pro, created_at, updated_at)
  VALUES (NEW.id, FALSE, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_review_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Increment review count for calibration tracking
  INSERT INTO user_srs_settings (user_id, review_count_since_calibration)
  VALUES (NEW.user_id, 1)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    review_count_since_calibration = user_srs_settings.review_count_since_calibration + 1,
    updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_new_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  payload JSON;
BEGIN
  -- Only trigger for new rows with status 'na_fila'
  IF NEW.status = 'na_fila' THEN
    payload := json_build_object(
      'source_id', NEW.id,
      'user_id', NEW.user_id,
      'filename', NEW.filename,
      'storage_path', NEW.storage_path
    );

    -- Send notification via pg_notify (for local listeners)
    PERFORM pg_notify('new_source', payload::text);

    -- For Supabase Edge Functions, use http extension to call the function
    -- This requires the http extension to be enabled
    -- Uncomment below if you have http extension:
    /*
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/process-source',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := payload::jsonb
    );
    */
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_run_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM pg_notify(
      'run_status_changed',
      json_build_object(
        'run_id', NEW.id,
        'user_id', NEW.user_id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'items_generated', NEW.items_generated
      )::text
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pull_changes(last_pulled_at bigint DEFAULT 0, schema_version integer DEFAULT 1, migration jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  current_timestamp_ms BIGINT;
  result JSONB;
  user_uuid UUID;
  -- Profiles
  profiles_created JSONB;
  profiles_updated JSONB;
  profiles_deleted JSONB;
  -- Decks
  decks_created JSONB;
  decks_updated JSONB;
  decks_deleted JSONB;
  -- Cards
  cards_created JSONB;
  cards_updated JSONB;
  cards_deleted JSONB;
BEGIN
  -- Authenticate
  user_uuid := auth.uid();
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Capture server time BEFORE queries (critical for consistency)
  current_timestamp_ms := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

  -- Handle NULL as first sync
  IF last_pulled_at IS NULL THEN
    last_pulled_at := 0;
  END IF;

  -- =====================
  -- PROFILES
  -- =====================
  IF last_pulled_at = 0 THEN
    -- First sync: all active records as "created"
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id::TEXT,
      'is_pro', is_pro,
      'stripe_customer_id', stripe_customer_id,
      'created_at', created_at,
      'updated_at', updated_at,
      'deleted_at', deleted_at
    )), '[]'::jsonb) INTO profiles_created
    FROM profiles WHERE id = user_uuid AND deleted_at IS NULL;
    
    profiles_updated := '[]'::jsonb;
    profiles_deleted := '[]'::jsonb;
  ELSE
    -- Created: created_at > last_pulled_at, not deleted
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id::TEXT,
      'is_pro', is_pro,
      'stripe_customer_id', stripe_customer_id,
      'created_at', created_at,
      'updated_at', updated_at,
      'deleted_at', deleted_at
    )), '[]'::jsonb) INTO profiles_created
    FROM profiles
    WHERE id = user_uuid AND created_at > last_pulled_at AND deleted_at IS NULL;

    -- Updated: updated_at > last_pulled_at, created_at <= last_pulled_at, not deleted
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id::TEXT,
      'is_pro', is_pro,
      'stripe_customer_id', stripe_customer_id,
      'created_at', created_at,
      'updated_at', updated_at,
      'deleted_at', deleted_at
    )), '[]'::jsonb) INTO profiles_updated
    FROM profiles
    WHERE id = user_uuid AND updated_at > last_pulled_at AND created_at <= last_pulled_at AND deleted_at IS NULL;

    -- Deleted: deleted_at > last_pulled_at
    SELECT COALESCE(jsonb_agg(id::TEXT), '[]'::jsonb) INTO profiles_deleted
    FROM profiles
    WHERE id = user_uuid AND deleted_at IS NOT NULL AND deleted_at > last_pulled_at;
  END IF;

  -- =====================
  -- DECKS
  -- =====================
  IF last_pulled_at = 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'user_id', user_id::TEXT,
      'title', title,
      'description', description,
      'created_at', created_at,
      'updated_at', updated_at,
      'deleted_at', deleted_at
    )), '[]'::jsonb) INTO decks_created
    FROM decks WHERE user_id = user_uuid AND deleted_at IS NULL;
    
    decks_updated := '[]'::jsonb;
    decks_deleted := '[]'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'user_id', user_id::TEXT,
      'title', title,
      'description', description,
      'created_at', created_at,
      'updated_at', updated_at,
      'deleted_at', deleted_at
    )), '[]'::jsonb) INTO decks_created
    FROM decks
    WHERE user_id = user_uuid AND created_at > last_pulled_at AND deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'user_id', user_id::TEXT,
      'title', title,
      'description', description,
      'created_at', created_at,
      'updated_at', updated_at,
      'deleted_at', deleted_at
    )), '[]'::jsonb) INTO decks_updated
    FROM decks
    WHERE user_id = user_uuid AND updated_at > last_pulled_at AND created_at <= last_pulled_at AND deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) INTO decks_deleted
    FROM decks
    WHERE user_id = user_uuid AND deleted_at IS NOT NULL AND deleted_at > last_pulled_at;
  END IF;

  -- =====================
  -- CARDS
  -- =====================
  IF last_pulled_at = 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'deck_id', c.deck_id,
      'front', c.front,
      'back', c.back,
      'step', c.step,
      'next_review_at', c.next_review_at,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'deleted_at', c.deleted_at
    )), '[]'::jsonb) INTO cards_created
    FROM cards c
    JOIN decks d ON d.id = c.deck_id
    WHERE d.user_id = user_uuid AND c.deleted_at IS NULL;
    
    cards_updated := '[]'::jsonb;
    cards_deleted := '[]'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'deck_id', c.deck_id,
      'front', c.front,
      'back', c.back,
      'step', c.step,
      'next_review_at', c.next_review_at,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'deleted_at', c.deleted_at
    )), '[]'::jsonb) INTO cards_created
    FROM cards c
    JOIN decks d ON d.id = c.deck_id
    WHERE d.user_id = user_uuid AND c.created_at > last_pulled_at AND c.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'deck_id', c.deck_id,
      'front', c.front,
      'back', c.back,
      'step', c.step,
      'next_review_at', c.next_review_at,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'deleted_at', c.deleted_at
    )), '[]'::jsonb) INTO cards_updated
    FROM cards c
    JOIN decks d ON d.id = c.deck_id
    WHERE d.user_id = user_uuid AND c.updated_at > last_pulled_at AND c.created_at <= last_pulled_at AND c.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(c.id), '[]'::jsonb) INTO cards_deleted
    FROM cards c
    JOIN decks d ON d.id = c.deck_id
    WHERE d.user_id = user_uuid AND c.deleted_at IS NOT NULL AND c.deleted_at > last_pulled_at;
  END IF;

  -- Build response
  result := jsonb_build_object(
    'changes', jsonb_build_object(
      'profiles', jsonb_build_object('created', profiles_created, 'updated', profiles_updated, 'deleted', profiles_deleted),
      'decks', jsonb_build_object('created', decks_created, 'updated', decks_updated, 'deleted', decks_deleted),
      'cards', jsonb_build_object('created', cards_created, 'updated', cards_updated, 'deleted', cards_deleted)
    ),
    'timestamp', current_timestamp_ms
  );

  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.push_changes(changes jsonb, last_pulled_at bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  user_uuid UUID;
  current_ts BIGINT;
  rec JSONB;
  del_id TEXT;
BEGIN
  -- Authenticate
  user_uuid := auth.uid();
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  current_ts := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

  -- =====================
  -- PROFILES
  -- =====================
  -- Created
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'profiles'->'created', '[]'::jsonb))
  LOOP
    INSERT INTO profiles (id, is_pro, stripe_customer_id, created_at, updated_at)
    VALUES (
      (rec->>'id')::UUID,
      COALESCE((rec->>'is_pro')::BOOLEAN, FALSE),
      rec->>'stripe_customer_id',
      COALESCE((rec->>'created_at')::BIGINT, current_ts),
      current_ts
    )
    ON CONFLICT (id) DO UPDATE SET
      is_pro = EXCLUDED.is_pro,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      updated_at = current_ts;
  END LOOP;

  -- Updated
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'profiles'->'updated', '[]'::jsonb))
  LOOP
    UPDATE profiles SET
      is_pro = COALESCE((rec->>'is_pro')::BOOLEAN, is_pro),
      stripe_customer_id = COALESCE(rec->>'stripe_customer_id', stripe_customer_id),
      updated_at = current_ts
    WHERE id = (rec->>'id')::UUID AND id = user_uuid;
  END LOOP;

  -- Deleted (soft delete)
  FOR del_id IN SELECT * FROM jsonb_array_elements_text(COALESCE(changes->'profiles'->'deleted', '[]'::jsonb))
  LOOP
    UPDATE profiles SET deleted_at = current_ts, updated_at = current_ts
    WHERE id = del_id::UUID AND id = user_uuid;
  END LOOP;

  -- =====================
  -- DECKS
  -- =====================
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'decks'->'created', '[]'::jsonb))
  LOOP
    INSERT INTO decks (id, user_id, title, description, created_at, updated_at)
    VALUES (
      rec->>'id',
      user_uuid,
      rec->>'title',
      rec->>'description',
      COALESCE((rec->>'created_at')::BIGINT, current_ts),
      current_ts
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      updated_at = current_ts;
  END LOOP;

  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'decks'->'updated', '[]'::jsonb))
  LOOP
    UPDATE decks SET
      title = COALESCE(rec->>'title', title),
      description = COALESCE(rec->>'description', description),
      updated_at = current_ts
    WHERE id = rec->>'id' AND user_id = user_uuid;

    -- Recovery: insert if not found
    IF NOT FOUND THEN
      INSERT INTO decks (id, user_id, title, description, created_at, updated_at)
      VALUES (
        rec->>'id',
        user_uuid,
        rec->>'title',
        rec->>'description',
        COALESCE((rec->>'created_at')::BIGINT, current_ts),
        current_ts
      );
    END IF;
  END LOOP;

  FOR del_id IN SELECT * FROM jsonb_array_elements_text(COALESCE(changes->'decks'->'deleted', '[]'::jsonb))
  LOOP
    UPDATE decks SET deleted_at = current_ts, updated_at = current_ts
    WHERE id = del_id AND user_id = user_uuid;
  END LOOP;

  -- =====================
  -- CARDS
  -- =====================
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'cards'->'created', '[]'::jsonb))
  LOOP
    -- Verify deck ownership
    IF NOT EXISTS (SELECT 1 FROM decks WHERE id = rec->>'deck_id' AND user_id = user_uuid) THEN
      CONTINUE; -- Skip unauthorized cards
    END IF;

    INSERT INTO cards (id, deck_id, front, back, step, next_review_at, created_at, updated_at)
    VALUES (
      rec->>'id',
      rec->>'deck_id',
      rec->>'front',
      rec->>'back',
      COALESCE((rec->>'step')::INT, 0),
      (rec->>'next_review_at')::BIGINT,
      COALESCE((rec->>'created_at')::BIGINT, current_ts),
      current_ts
    )
    ON CONFLICT (id) DO UPDATE SET
      front = EXCLUDED.front,
      back = EXCLUDED.back,
      step = EXCLUDED.step,
      next_review_at = EXCLUDED.next_review_at,
      updated_at = current_ts;
  END LOOP;

  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(changes->'cards'->'updated', '[]'::jsonb))
  LOOP
    UPDATE cards SET
      front = COALESCE(rec->>'front', front),
      back = COALESCE(rec->>'back', back),
      step = COALESCE((rec->>'step')::INT, step),
      next_review_at = COALESCE((rec->>'next_review_at')::BIGINT, next_review_at),
      updated_at = current_ts
    WHERE id = rec->>'id'
      AND EXISTS (SELECT 1 FROM decks WHERE decks.id = cards.deck_id AND decks.user_id = user_uuid);

    IF NOT FOUND AND EXISTS (SELECT 1 FROM decks WHERE id = rec->>'deck_id' AND user_id = user_uuid) THEN
      INSERT INTO cards (id, deck_id, front, back, step, next_review_at, created_at, updated_at)
      VALUES (
        rec->>'id',
        rec->>'deck_id',
        rec->>'front',
        rec->>'back',
        COALESCE((rec->>'step')::INT, 0),
        (rec->>'next_review_at')::BIGINT,
        COALESCE((rec->>'created_at')::BIGINT, current_ts),
        current_ts
      );
    END IF;
  END LOOP;

  FOR del_id IN SELECT * FROM jsonb_array_elements_text(COALESCE(changes->'cards'->'deleted', '[]'::jsonb))
  LOOP
    UPDATE cards SET deleted_at = current_ts, updated_at = current_ts
    WHERE id = del_id
      AND EXISTS (SELECT 1 FROM decks WHERE decks.id = cards.deck_id AND decks.user_id = user_uuid);
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refund_user_credit(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE user_credits 
  SET plan_runs_remaining = plan_runs_remaining + 1,
      updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
  WHERE user_id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_has_credits(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COALESCE(plan_runs_remaining, 0) + COALESCE(extra_credits, 0)
  INTO v_total
  FROM user_credits 
  WHERE user_id = p_user_id;
  
  -- If no record, they get default 10 credits
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;
  
  RETURN v_total > 0;
END;
$function$
;


-- ============================================================================
-- 7. GRANTS
-- ============================================================================
grant delete on table "public"."card_references" to "anon";

grant insert on table "public"."card_references" to "anon";

grant references on table "public"."card_references" to "anon";

grant select on table "public"."card_references" to "anon";

grant trigger on table "public"."card_references" to "anon";

grant truncate on table "public"."card_references" to "anon";

grant update on table "public"."card_references" to "anon";

grant delete on table "public"."card_references" to "authenticated";

grant insert on table "public"."card_references" to "authenticated";

grant references on table "public"."card_references" to "authenticated";

grant select on table "public"."card_references" to "authenticated";

grant trigger on table "public"."card_references" to "authenticated";

grant truncate on table "public"."card_references" to "authenticated";

grant update on table "public"."card_references" to "authenticated";

grant delete on table "public"."card_references" to "service_role";

grant insert on table "public"."card_references" to "service_role";

grant references on table "public"."card_references" to "service_role";

grant select on table "public"."card_references" to "service_role";

grant trigger on table "public"."card_references" to "service_role";

grant truncate on table "public"."card_references" to "service_role";

grant update on table "public"."card_references" to "service_role";

grant delete on table "public"."card_reviews" to "anon";

grant insert on table "public"."card_reviews" to "anon";

grant references on table "public"."card_reviews" to "anon";

grant select on table "public"."card_reviews" to "anon";

grant trigger on table "public"."card_reviews" to "anon";

grant truncate on table "public"."card_reviews" to "anon";

grant update on table "public"."card_reviews" to "anon";

grant delete on table "public"."card_reviews" to "authenticated";

grant insert on table "public"."card_reviews" to "authenticated";

grant references on table "public"."card_reviews" to "authenticated";

grant select on table "public"."card_reviews" to "authenticated";

grant trigger on table "public"."card_reviews" to "authenticated";

grant truncate on table "public"."card_reviews" to "authenticated";

grant update on table "public"."card_reviews" to "authenticated";

grant delete on table "public"."card_reviews" to "service_role";

grant insert on table "public"."card_reviews" to "service_role";

grant references on table "public"."card_reviews" to "service_role";

grant select on table "public"."card_reviews" to "service_role";

grant trigger on table "public"."card_reviews" to "service_role";

grant truncate on table "public"."card_reviews" to "service_role";

grant update on table "public"."card_reviews" to "service_role";

grant delete on table "public"."cards" to "anon";

grant insert on table "public"."cards" to "anon";

grant references on table "public"."cards" to "anon";

grant select on table "public"."cards" to "anon";

grant trigger on table "public"."cards" to "anon";

grant truncate on table "public"."cards" to "anon";

grant update on table "public"."cards" to "anon";

grant delete on table "public"."cards" to "authenticated";

grant insert on table "public"."cards" to "authenticated";

grant references on table "public"."cards" to "authenticated";

grant select on table "public"."cards" to "authenticated";

grant trigger on table "public"."cards" to "authenticated";

grant truncate on table "public"."cards" to "authenticated";

grant update on table "public"."cards" to "authenticated";

grant delete on table "public"."cards" to "service_role";

grant insert on table "public"."cards" to "service_role";

grant references on table "public"."cards" to "service_role";

grant select on table "public"."cards" to "service_role";

grant trigger on table "public"."cards" to "service_role";

grant truncate on table "public"."cards" to "service_role";

grant update on table "public"."cards" to "service_role";

grant delete on table "public"."chunks" to "anon";

grant insert on table "public"."chunks" to "anon";

grant references on table "public"."chunks" to "anon";

grant select on table "public"."chunks" to "anon";

grant trigger on table "public"."chunks" to "anon";

grant truncate on table "public"."chunks" to "anon";

grant update on table "public"."chunks" to "anon";

grant delete on table "public"."chunks" to "authenticated";

grant insert on table "public"."chunks" to "authenticated";

grant references on table "public"."chunks" to "authenticated";

grant select on table "public"."chunks" to "authenticated";

grant trigger on table "public"."chunks" to "authenticated";

grant truncate on table "public"."chunks" to "authenticated";

grant update on table "public"."chunks" to "authenticated";

grant delete on table "public"."chunks" to "service_role";

grant insert on table "public"."chunks" to "service_role";

grant references on table "public"."chunks" to "service_role";

grant select on table "public"."chunks" to "service_role";

grant trigger on table "public"."chunks" to "service_role";

grant truncate on table "public"."chunks" to "service_role";

grant update on table "public"."chunks" to "service_role";

grant delete on table "public"."decks" to "anon";

grant insert on table "public"."decks" to "anon";

grant references on table "public"."decks" to "anon";

grant select on table "public"."decks" to "anon";

grant trigger on table "public"."decks" to "anon";

grant truncate on table "public"."decks" to "anon";

grant update on table "public"."decks" to "anon";

grant delete on table "public"."decks" to "authenticated";

grant insert on table "public"."decks" to "authenticated";

grant references on table "public"."decks" to "authenticated";

grant select on table "public"."decks" to "authenticated";

grant trigger on table "public"."decks" to "authenticated";

grant truncate on table "public"."decks" to "authenticated";

grant update on table "public"."decks" to "authenticated";

grant delete on table "public"."decks" to "service_role";

grant insert on table "public"."decks" to "service_role";

grant references on table "public"."decks" to "service_role";

grant select on table "public"."decks" to "service_role";

grant trigger on table "public"."decks" to "service_role";

grant truncate on table "public"."decks" to "service_role";

grant update on table "public"."decks" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."runs" to "anon";

grant insert on table "public"."runs" to "anon";

grant references on table "public"."runs" to "anon";

grant select on table "public"."runs" to "anon";

grant trigger on table "public"."runs" to "anon";

grant truncate on table "public"."runs" to "anon";

grant update on table "public"."runs" to "anon";

grant delete on table "public"."runs" to "authenticated";

grant insert on table "public"."runs" to "authenticated";

grant references on table "public"."runs" to "authenticated";

grant select on table "public"."runs" to "authenticated";

grant trigger on table "public"."runs" to "authenticated";

grant truncate on table "public"."runs" to "authenticated";

grant update on table "public"."runs" to "authenticated";

grant delete on table "public"."runs" to "service_role";

grant insert on table "public"."runs" to "service_role";

grant references on table "public"."runs" to "service_role";

grant select on table "public"."runs" to "service_role";

grant trigger on table "public"."runs" to "service_role";

grant truncate on table "public"."runs" to "service_role";

grant update on table "public"."runs" to "service_role";

grant delete on table "public"."simulado_questoes" to "anon";

grant insert on table "public"."simulado_questoes" to "anon";

grant references on table "public"."simulado_questoes" to "anon";

grant select on table "public"."simulado_questoes" to "anon";

grant trigger on table "public"."simulado_questoes" to "anon";

grant truncate on table "public"."simulado_questoes" to "anon";

grant update on table "public"."simulado_questoes" to "anon";

grant delete on table "public"."simulado_questoes" to "authenticated";

grant insert on table "public"."simulado_questoes" to "authenticated";

grant references on table "public"."simulado_questoes" to "authenticated";

grant select on table "public"."simulado_questoes" to "authenticated";

grant trigger on table "public"."simulado_questoes" to "authenticated";

grant truncate on table "public"."simulado_questoes" to "authenticated";

grant update on table "public"."simulado_questoes" to "authenticated";

grant delete on table "public"."simulado_questoes" to "service_role";

grant insert on table "public"."simulado_questoes" to "service_role";

grant references on table "public"."simulado_questoes" to "service_role";

grant select on table "public"."simulado_questoes" to "service_role";

grant trigger on table "public"."simulado_questoes" to "service_role";

grant truncate on table "public"."simulado_questoes" to "service_role";

grant update on table "public"."simulado_questoes" to "service_role";

grant delete on table "public"."simulado_respostas" to "anon";

grant insert on table "public"."simulado_respostas" to "anon";

grant references on table "public"."simulado_respostas" to "anon";

grant select on table "public"."simulado_respostas" to "anon";

grant trigger on table "public"."simulado_respostas" to "anon";

grant truncate on table "public"."simulado_respostas" to "anon";

grant update on table "public"."simulado_respostas" to "anon";

grant delete on table "public"."simulado_respostas" to "authenticated";

grant insert on table "public"."simulado_respostas" to "authenticated";

grant references on table "public"."simulado_respostas" to "authenticated";

grant select on table "public"."simulado_respostas" to "authenticated";

grant trigger on table "public"."simulado_respostas" to "authenticated";

grant truncate on table "public"."simulado_respostas" to "authenticated";

grant update on table "public"."simulado_respostas" to "authenticated";

grant delete on table "public"."simulado_respostas" to "service_role";

grant insert on table "public"."simulado_respostas" to "service_role";

grant references on table "public"."simulado_respostas" to "service_role";

grant select on table "public"."simulado_respostas" to "service_role";

grant trigger on table "public"."simulado_respostas" to "service_role";

grant truncate on table "public"."simulado_respostas" to "service_role";

grant update on table "public"."simulado_respostas" to "service_role";

grant delete on table "public"."simulados" to "anon";

grant insert on table "public"."simulados" to "anon";

grant references on table "public"."simulados" to "anon";

grant select on table "public"."simulados" to "anon";

grant trigger on table "public"."simulados" to "anon";

grant truncate on table "public"."simulados" to "anon";

grant update on table "public"."simulados" to "anon";

grant delete on table "public"."simulados" to "authenticated";

grant insert on table "public"."simulados" to "authenticated";

grant references on table "public"."simulados" to "authenticated";

grant select on table "public"."simulados" to "authenticated";

grant trigger on table "public"."simulados" to "authenticated";

grant truncate on table "public"."simulados" to "authenticated";

grant update on table "public"."simulados" to "authenticated";

grant delete on table "public"."simulados" to "service_role";

grant insert on table "public"."simulados" to "service_role";

grant references on table "public"."simulados" to "service_role";

grant select on table "public"."simulados" to "service_role";

grant trigger on table "public"."simulados" to "service_role";

grant truncate on table "public"."simulados" to "service_role";

grant update on table "public"."simulados" to "service_role";

grant delete on table "public"."source_chunks" to "anon";

grant insert on table "public"."source_chunks" to "anon";

grant references on table "public"."source_chunks" to "anon";

grant select on table "public"."source_chunks" to "anon";

grant trigger on table "public"."source_chunks" to "anon";

grant truncate on table "public"."source_chunks" to "anon";

grant update on table "public"."source_chunks" to "anon";

grant delete on table "public"."source_chunks" to "authenticated";

grant insert on table "public"."source_chunks" to "authenticated";

grant references on table "public"."source_chunks" to "authenticated";

grant select on table "public"."source_chunks" to "authenticated";

grant trigger on table "public"."source_chunks" to "authenticated";

grant truncate on table "public"."source_chunks" to "authenticated";

grant update on table "public"."source_chunks" to "authenticated";

grant delete on table "public"."source_chunks" to "service_role";

grant insert on table "public"."source_chunks" to "service_role";

grant references on table "public"."source_chunks" to "service_role";

grant select on table "public"."source_chunks" to "service_role";

grant trigger on table "public"."source_chunks" to "service_role";

grant truncate on table "public"."source_chunks" to "service_role";

grant update on table "public"."source_chunks" to "service_role";

grant delete on table "public"."sources" to "anon";

grant insert on table "public"."sources" to "anon";

grant references on table "public"."sources" to "anon";

grant select on table "public"."sources" to "anon";

grant trigger on table "public"."sources" to "anon";

grant truncate on table "public"."sources" to "anon";

grant update on table "public"."sources" to "anon";

grant delete on table "public"."sources" to "authenticated";

grant insert on table "public"."sources" to "authenticated";

grant references on table "public"."sources" to "authenticated";

grant select on table "public"."sources" to "authenticated";

grant trigger on table "public"."sources" to "authenticated";

grant truncate on table "public"."sources" to "authenticated";

grant update on table "public"."sources" to "authenticated";

grant delete on table "public"."sources" to "service_role";

grant insert on table "public"."sources" to "service_role";

grant references on table "public"."sources" to "service_role";

grant select on table "public"."sources" to "service_role";

grant trigger on table "public"."sources" to "service_role";

grant truncate on table "public"."sources" to "service_role";

grant update on table "public"."sources" to "service_role";

grant delete on table "public"."study_goals" to "anon";

grant insert on table "public"."study_goals" to "anon";

grant references on table "public"."study_goals" to "anon";

grant select on table "public"."study_goals" to "anon";

grant trigger on table "public"."study_goals" to "anon";

grant truncate on table "public"."study_goals" to "anon";

grant update on table "public"."study_goals" to "anon";

grant delete on table "public"."study_goals" to "authenticated";

grant insert on table "public"."study_goals" to "authenticated";

grant references on table "public"."study_goals" to "authenticated";

grant select on table "public"."study_goals" to "authenticated";

grant trigger on table "public"."study_goals" to "authenticated";

grant truncate on table "public"."study_goals" to "authenticated";

grant update on table "public"."study_goals" to "authenticated";

grant delete on table "public"."study_goals" to "service_role";

grant insert on table "public"."study_goals" to "service_role";

grant references on table "public"."study_goals" to "service_role";

grant select on table "public"."study_goals" to "service_role";

grant trigger on table "public"."study_goals" to "service_role";

grant truncate on table "public"."study_goals" to "service_role";

grant update on table "public"."study_goals" to "service_role";

grant delete on table "public"."subscriptions" to "anon";

grant insert on table "public"."subscriptions" to "anon";

grant references on table "public"."subscriptions" to "anon";

grant select on table "public"."subscriptions" to "anon";

grant trigger on table "public"."subscriptions" to "anon";

grant truncate on table "public"."subscriptions" to "anon";

grant update on table "public"."subscriptions" to "anon";

grant delete on table "public"."subscriptions" to "authenticated";

grant insert on table "public"."subscriptions" to "authenticated";

grant references on table "public"."subscriptions" to "authenticated";

grant select on table "public"."subscriptions" to "authenticated";

grant trigger on table "public"."subscriptions" to "authenticated";

grant truncate on table "public"."subscriptions" to "authenticated";

grant update on table "public"."subscriptions" to "authenticated";

grant delete on table "public"."subscriptions" to "service_role";

grant insert on table "public"."subscriptions" to "service_role";

grant references on table "public"."subscriptions" to "service_role";

grant select on table "public"."subscriptions" to "service_role";

grant trigger on table "public"."subscriptions" to "service_role";

grant truncate on table "public"."subscriptions" to "service_role";

grant update on table "public"."subscriptions" to "service_role";

grant delete on table "public"."user_credits" to "anon";

grant insert on table "public"."user_credits" to "anon";

grant references on table "public"."user_credits" to "anon";

grant select on table "public"."user_credits" to "anon";

grant trigger on table "public"."user_credits" to "anon";

grant truncate on table "public"."user_credits" to "anon";

grant update on table "public"."user_credits" to "anon";

grant delete on table "public"."user_credits" to "authenticated";

grant insert on table "public"."user_credits" to "authenticated";

grant references on table "public"."user_credits" to "authenticated";

grant select on table "public"."user_credits" to "authenticated";

grant trigger on table "public"."user_credits" to "authenticated";

grant truncate on table "public"."user_credits" to "authenticated";

grant update on table "public"."user_credits" to "authenticated";

grant delete on table "public"."user_credits" to "service_role";

grant insert on table "public"."user_credits" to "service_role";

grant references on table "public"."user_credits" to "service_role";

grant select on table "public"."user_credits" to "service_role";

grant trigger on table "public"."user_credits" to "service_role";

grant truncate on table "public"."user_credits" to "service_role";

grant update on table "public"."user_credits" to "service_role";

grant delete on table "public"."user_srs_settings" to "anon";

grant insert on table "public"."user_srs_settings" to "anon";

grant references on table "public"."user_srs_settings" to "anon";

grant select on table "public"."user_srs_settings" to "anon";

grant trigger on table "public"."user_srs_settings" to "anon";

grant truncate on table "public"."user_srs_settings" to "anon";

grant update on table "public"."user_srs_settings" to "anon";

grant delete on table "public"."user_srs_settings" to "authenticated";

grant insert on table "public"."user_srs_settings" to "authenticated";

grant references on table "public"."user_srs_settings" to "authenticated";

grant select on table "public"."user_srs_settings" to "authenticated";

grant trigger on table "public"."user_srs_settings" to "authenticated";

grant truncate on table "public"."user_srs_settings" to "authenticated";

grant update on table "public"."user_srs_settings" to "authenticated";

grant delete on table "public"."user_srs_settings" to "service_role";

grant insert on table "public"."user_srs_settings" to "service_role";

grant references on table "public"."user_srs_settings" to "service_role";

grant select on table "public"."user_srs_settings" to "service_role";

grant trigger on table "public"."user_srs_settings" to "service_role";

grant truncate on table "public"."user_srs_settings" to "service_role";

grant update on table "public"."user_srs_settings" to "service_role";

grant delete on table "public"."user_weights" to "anon";

grant insert on table "public"."user_weights" to "anon";

grant references on table "public"."user_weights" to "anon";

grant select on table "public"."user_weights" to "anon";

grant trigger on table "public"."user_weights" to "anon";

grant truncate on table "public"."user_weights" to "anon";

grant update on table "public"."user_weights" to "anon";

grant delete on table "public"."user_weights" to "authenticated";

grant insert on table "public"."user_weights" to "authenticated";

grant references on table "public"."user_weights" to "authenticated";

grant select on table "public"."user_weights" to "authenticated";

grant trigger on table "public"."user_weights" to "authenticated";

grant truncate on table "public"."user_weights" to "authenticated";

grant update on table "public"."user_weights" to "authenticated";

grant delete on table "public"."user_weights" to "service_role";

grant insert on table "public"."user_weights" to "service_role";

grant references on table "public"."user_weights" to "service_role";

grant select on table "public"."user_weights" to "service_role";

grant trigger on table "public"."user_weights" to "service_role";

grant truncate on table "public"."user_weights" to "service_role";

grant update on table "public"."user_weights" to "service_role";

grant delete on table "public"."webhook_logs" to "anon";

grant insert on table "public"."webhook_logs" to "anon";

grant references on table "public"."webhook_logs" to "anon";

grant select on table "public"."webhook_logs" to "anon";

grant trigger on table "public"."webhook_logs" to "anon";

grant truncate on table "public"."webhook_logs" to "anon";

grant update on table "public"."webhook_logs" to "anon";

grant delete on table "public"."webhook_logs" to "authenticated";

grant insert on table "public"."webhook_logs" to "authenticated";

grant references on table "public"."webhook_logs" to "authenticated";

grant select on table "public"."webhook_logs" to "authenticated";

grant trigger on table "public"."webhook_logs" to "authenticated";

grant truncate on table "public"."webhook_logs" to "authenticated";

grant update on table "public"."webhook_logs" to "authenticated";

grant delete on table "public"."webhook_logs" to "service_role";

grant insert on table "public"."webhook_logs" to "service_role";

grant references on table "public"."webhook_logs" to "service_role";

grant select on table "public"."webhook_logs" to "service_role";

grant trigger on table "public"."webhook_logs" to "service_role";

grant truncate on table "public"."webhook_logs" to "service_role";

grant update on table "public"."webhook_logs" to "service_role";



-- ============================================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- 8.1 card_references policies
  create policy "Service role full access card_references"
  on "public"."card_references"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can view own card_references"
  on "public"."card_references"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.cards c
     JOIN public.decks d ON ((c.deck_id = d.id)))
  WHERE ((c.id = card_references.card_id) AND (d.user_id = auth.uid())))));



-- 8.2 card_reviews policies
  create policy "Users can insert their own reviews"
  on "public"."card_reviews"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "Users can view their own reviews"
  on "public"."card_reviews"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



-- 8.3 cards policies
  create policy "Service role full access cards"
  on "public"."cards"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can delete cards in own decks"
  on "public"."cards"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.decks
  WHERE ((decks.id = cards.deck_id) AND (decks.user_id = auth.uid())))));



  create policy "Users can insert cards to own decks"
  on "public"."cards"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.decks
  WHERE ((decks.id = cards.deck_id) AND (decks.user_id = auth.uid())))));



  create policy "Users can update cards in own decks"
  on "public"."cards"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.decks
  WHERE ((decks.id = cards.deck_id) AND (decks.user_id = auth.uid())))));



  create policy "Users can view cards in own decks"
  on "public"."cards"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.decks
  WHERE ((decks.id = cards.deck_id) AND (decks.user_id = auth.uid())))));



  create policy "cards_delete_own"
  on "public"."cards"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.decks
  WHERE ((decks.id = cards.deck_id) AND (decks.user_id = auth.uid())))));



  create policy "cards_insert_own"
  on "public"."cards"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.decks
  WHERE ((decks.id = cards.deck_id) AND (decks.user_id = auth.uid())))));



  create policy "cards_select_own"
  on "public"."cards"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.decks
  WHERE ((decks.id = cards.deck_id) AND (decks.user_id = auth.uid())))));



  create policy "cards_update_own"
  on "public"."cards"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.decks
  WHERE ((decks.id = cards.deck_id) AND (decks.user_id = auth.uid())))));



-- 8.4 chunks policies
  create policy "Authenticated users can view chunks"
  on "public"."chunks"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "Service role can insert chunks"
  on "public"."chunks"
  as permissive
  for insert
  to public
with check ((auth.role() = 'service_role'::text));



  create policy "Service role can update chunks"
  on "public"."chunks"
  as permissive
  for update
  to public
using ((auth.role() = 'service_role'::text));



-- 8.5 decks policies
  create policy "Service role full access decks"
  on "public"."decks"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can delete own decks"
  on "public"."decks"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert own decks"
  on "public"."decks"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update own decks"
  on "public"."decks"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view own decks"
  on "public"."decks"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "decks_delete_own"
  on "public"."decks"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "decks_insert_own"
  on "public"."decks"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "decks_select_own"
  on "public"."decks"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "decks_update_own"
  on "public"."decks"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



-- 8.6 profiles policies
  create policy "profiles_delete_own"
  on "public"."profiles"
  as permissive
  for delete
  to public
using ((auth.uid() = id));



  create policy "profiles_insert_own"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((auth.uid() = id));



  create policy "profiles_select_own"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "profiles_update_own"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((auth.uid() = id));



-- 8.7 runs policies
  create policy "Service role full access runs"
  on "public"."runs"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can insert own runs"
  on "public"."runs"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update own runs"
  on "public"."runs"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view own runs"
  on "public"."runs"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



-- 8.8 simulado_questoes policies
  create policy "Service role can manage all questoes"
  on "public"."simulado_questoes"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'role'::text) = 'service_role'::text));



  create policy "Users can view questions of own simulados"
  on "public"."simulado_questoes"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.simulados s
  WHERE ((s.id = simulado_questoes.simulado_id) AND (s.user_id = auth.uid())))));



-- 8.9 simulado_respostas policies
  create policy "Service role can manage all respostas"
  on "public"."simulado_respostas"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'role'::text) = 'service_role'::text));



  create policy "Users can insert own responses"
  on "public"."simulado_respostas"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.simulados s
  WHERE ((s.id = simulado_respostas.simulado_id) AND (s.user_id = auth.uid())))));



  create policy "Users can update own responses"
  on "public"."simulado_respostas"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.simulados s
  WHERE ((s.id = simulado_respostas.simulado_id) AND (s.user_id = auth.uid())))));



  create policy "Users can view own responses"
  on "public"."simulado_respostas"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.simulados s
  WHERE ((s.id = simulado_respostas.simulado_id) AND (s.user_id = auth.uid())))));



-- 8.10 simulados policies
  create policy "Service role can manage all simulados"
  on "public"."simulados"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'role'::text) = 'service_role'::text));



  create policy "Users can insert own simulados"
  on "public"."simulados"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update own simulados"
  on "public"."simulados"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view own simulados"
  on "public"."simulados"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



-- 8.11 source_chunks policies
  create policy "Service role full access source_chunks"
  on "public"."source_chunks"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can view own source_chunks"
  on "public"."source_chunks"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.sources
  WHERE ((sources.id = source_chunks.source_id) AND (sources.user_id = auth.uid())))));



-- 8.12 sources policies
  create policy "Service role full access"
  on "public"."sources"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can insert own sources"
  on "public"."sources"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update own sources"
  on "public"."sources"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view own sources"
  on "public"."sources"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Users can manage their own goals"
  on "public"."study_goals"
  as permissive
  for all
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Service role full access subscriptions"
  on "public"."subscriptions"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can view own subscriptions"
  on "public"."subscriptions"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Service role full access user_credits"
  on "public"."user_credits"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can view own credits"
  on "public"."user_credits"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Users can manage their own SRS settings"
  on "public"."user_srs_settings"
  as permissive
  for all
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Users can manage their own weights"
  on "public"."user_weights"
  as permissive
  for all
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



-- ============================================================================
-- 9. TRIGGERS
-- ============================================================================
CREATE TRIGGER trigger_increment_review_count AFTER INSERT ON public.card_reviews FOR EACH ROW EXECUTE FUNCTION public.increment_review_count();

CREATE TRIGGER on_run_status_change AFTER UPDATE ON public.runs FOR EACH ROW EXECUTE FUNCTION public.notify_run_status_change();

CREATE TRIGGER on_source_created AFTER INSERT ON public.sources FOR EACH ROW EXECUTE FUNCTION public.notify_new_source();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_created_credits AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_user_credits();



-- ============================================================================
-- 10. STORAGE POLICIES
-- ============================================================================
  create policy "Service role full access PDFs"
  on "storage"."objects"
  as permissive
  for all
  to public
using (((bucket_id = 'pdfs'::text) AND (auth.role() = 'service_role'::text)));



  create policy "Users can delete own PDFs"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'pdfs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload PDFs to own folder"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'pdfs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload sources"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'sources'::text));



  create policy "Users can view own PDFs"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'pdfs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can view their own sources"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'sources'::text));



