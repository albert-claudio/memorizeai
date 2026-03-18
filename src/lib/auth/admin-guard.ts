import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as crypto from 'crypto';

// ============================================================================
// ADMIN GUARD — Maximum security for admin routes
// ============================================================================
// Protection layers:
// 1. Session authentication (Supabase)
// 2. Email allowlist (ADMIN_EMAILS env var)
// 3. Admin password (ADMIN_PASSWORD env var)
// 4. Timing-safe comparison for password

/**
 * Parses ADMIN_EMAILS env var into a normalized Set of lowercase trimmed emails.
 */
function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against itself to maintain constant time but always return false
    const buf = Buffer.from(a);
    crypto.timingSafeEqual(buf, buf);
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export interface AdminAuthResult {
  userId: string;
  email: string;
}

/**
 * Require that the current session belongs to an admin user.
 * 
 * Security layers:
 * 1. Valid Supabase session
 * 2. Email is in ADMIN_EMAILS
 * 3. x-admin-password header matches ADMIN_PASSWORD
 * 
 * Returns admin info on success, or a NextResponse error on failure.
 */
export async function requireAdmin(
  request?: Request | null
): Promise<AdminAuthResult | NextResponse> {
  // ── Layer 0: ADMIN_PASSWORD must be configured ────────────────────────
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 8) {
    console.error('[Admin Guard] ADMIN_PASSWORD not configured or too short');
    return NextResponse.json(
      { error: 'Admin não configurado.' },
      { status: 500 }
    );
  }

  // ── Layer 1: Session authentication ───────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { error: 'Não autorizado. Faça login para continuar.' },
      { status: 401 }
    );
  }

  // ── Layer 2: Email allowlist ──────────────────────────────────────────
  const email = user.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: 'Conta sem email associado.' },
      { status: 403 }
    );
  }

  const admins = getAdminEmails();
  if (!admins.has(email)) {
    console.warn(`[Admin Guard] Non-admin access attempt: ${email}`);
    return NextResponse.json(
      { error: 'Acesso restrito a administradores.' },
      { status: 403 }
    );
  }

  // ── Layer 3: Admin password ───────────────────────────────────────────
  const providedPassword = request?.headers?.get('x-admin-password') ?? '';
  if (!providedPassword || !timingSafeEqual(providedPassword, adminPassword)) {
    console.warn(`[Admin Guard] Invalid admin password from: ${email}`);
    return NextResponse.json(
      { error: 'Senha administrativa inválida.' },
      { status: 403 }
    );
  }

  return { userId: user.id, email };
}

/**
 * Type guard to check if requireAdmin() returned success.
 */
export function isAdminSuccess(
  result: AdminAuthResult | NextResponse
): result is AdminAuthResult {
  return !(result instanceof NextResponse);
}
