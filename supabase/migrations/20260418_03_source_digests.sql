-- ============================================================================
-- Source digests
-- Structured, versioned digests derived from a source so downstream runs can
-- reuse condensed context instead of re-sending large raw chunks every time.
-- ============================================================================

create table if not exists "public"."source_digests" (
  "id" text not null,
  "source_id" text not null,
  "version" text not null,
  "provider" text,
  "model_used" text,
  "content_json" jsonb not null,
  "token_count" bigint,
  "estimated_cost_usd" numeric(12,6),
  "created_at" bigint not null default ((extract(epoch from now()) * (1000)::numeric))::bigint,
  "updated_at" bigint not null default ((extract(epoch from now()) * (1000)::numeric))::bigint
);

alter table "public"."source_digests" enable row level security;

alter table "public"."source_digests"
  add constraint "source_digests_pkey" primary key ("id");

alter table "public"."source_digests"
  add constraint "source_digests_source_id_fkey"
  foreign key ("source_id")
  references "public"."sources"("id")
  on delete cascade;

alter table "public"."source_digests"
  add constraint "source_digests_source_id_version_key"
  unique ("source_id", "version");

alter table "public"."source_digests"
  add constraint "source_digests_provider_check"
  check (
    "provider" is null
    or "provider" = any (array['groq'::text, 'gemini'::text, 'openai'::text])
  );

create index if not exists "idx_source_digests_source_lookup"
on "public"."source_digests" ("source_id", "updated_at" desc);

comment on table "public"."source_digests" is
  'Versioned structured digests generated from a source for cheaper downstream AI runs.';
comment on column "public"."source_digests"."version" is
  'Digest schema/prompt version, e.g. v1.';
comment on column "public"."source_digests"."content_json" is
  'Structured digest payload used as compact context in later generations.';
comment on column "public"."source_digests"."token_count" is
  'Total tokens spent generating this digest when usage is available.';
comment on column "public"."source_digests"."estimated_cost_usd" is
  'Estimated USD cost to generate the digest when provider pricing is known.';

create policy "Service role full access source_digests"
on "public"."source_digests"
as permissive
for all
to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));

create policy "Users can view own source_digests"
on "public"."source_digests"
as permissive
for select
to public
using (
  exists (
    select 1
    from "public"."sources"
    where "sources"."id" = "source_digests"."source_id"
      and "sources"."user_id" = auth.uid()
  )
);

grant select on table "public"."source_digests" to "authenticated";
grant all on table "public"."source_digests" to "service_role";
