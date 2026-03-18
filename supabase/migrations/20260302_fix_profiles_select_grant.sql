-- ============================================================================
-- FIX: Add admin_override_pro to column-level SELECT grant on profiles
-- 
-- The column-level GRANT SELECT from 20260211200000_security_audit_fixes.sql
-- excluded admin_override_pro. This causes PostgreSQL to deny any query
-- that selects admin_override_pro, breaking hasProAccess() in tier-limits
-- and subscription-status APIs (they get "permission denied" and return
-- the user as Free even when they have Pro access).
-- ============================================================================

-- Revoke and re-grant with admin_override_pro included
REVOKE SELECT ON TABLE "public"."profiles" FROM "authenticated";
GRANT SELECT (id, is_pro, subscription_status, subscription_tier, subscription_period_end, admin_override_pro, created_at, updated_at) ON TABLE "public"."profiles" TO "authenticated";
