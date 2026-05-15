-- ============================================================================
-- Change prioritize_weak default from false to true
-- So new users get weak-first ordering out of the box
-- ============================================================================

ALTER TABLE "public"."user_preferences"
  ALTER COLUMN "prioritize_weak" SET DEFAULT true;
