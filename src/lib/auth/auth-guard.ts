import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import { hasProAccess } from '@/lib/billing/pro-access';

// ============================================================================
// TYPES
// ============================================================================

export interface AuthResult {
  user: User;
  isPro: boolean;
}

export interface AuthError {
  error: string;
  status: number;
}

// ============================================================================
// AUTH GUARD - Central security helper for API routes
// ============================================================================

/**
 * Require authenticated user
 * Returns user if authenticated, error response if not
 */
export async function requireAuth(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _request?: NextRequest
): Promise<AuthResult | NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { error: 'Não autorizado. Faça login para continuar.' },
      { status: 401 }
    );
  }

  // Get Pro status
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro, subscription_status, subscription_period_end, admin_override_pro')
    .eq('id', user.id)
    .single();

  const isPro = hasProAccess(profile);

  return { user, isPro };
}

/**
 * Require authenticated PRO user
 * Returns user if authenticated AND has active Pro subscription
 * Returns 401 if not authenticated, 403 if not Pro
 */
export async function requirePro(
  _request?: NextRequest
): Promise<AuthResult | NextResponse> {
  const authResult = await requireAuth(_request);

  // If it's a NextResponse, it's an error
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  // Check if Pro
  if (!authResult.isPro) {
    return NextResponse.json(
      { 
        error: 'Recurso exclusivo para assinantes Pro. Faça upgrade para continuar.',
        code: 'PRO_REQUIRED',
        upgradeUrl: '/upgrade'
      },
      { status: 403 }
    );
  }

  return authResult;
}

/**
 * Validate resource ownership (IDOR protection)
 * Ensures the authenticated user owns the requested resource
 */
export async function requireOwnership(
  userId: string,
  resourceId: string,
  table: 'decks' | 'cards' | 'sources' | 'runs' | 'simulados'
): Promise<boolean | NextResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(table)
    .select('id, user_id')
    .eq('id', resourceId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Recurso não encontrado.' },
      { status: 404 }
    );
  }

  if (data.user_id !== userId) {
    console.warn(`[Security] IDOR attempt: User ${userId} tried to access ${table}/${resourceId} owned by ${data.user_id}`);
    return NextResponse.json(
      { error: 'Acesso negado. Você não tem permissão para acessar este recurso.' },
      { status: 403 }
    );
  }

  return true;
}

/**
 * Combined auth + ownership check
 * Useful for routes that need both authentication and resource ownership validation
 */
export async function requireAuthAndOwnership(
  resourceId: string,
  table: 'decks' | 'cards' | 'sources' | 'runs' | 'simulados',
  _request?: NextRequest
): Promise<AuthResult | NextResponse> {
  const authResult = await requireAuth(_request);

  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const ownershipResult = await requireOwnership(authResult.user.id, resourceId, table);

  if (ownershipResult instanceof NextResponse) {
    return ownershipResult;
  }

  return authResult;
}

/**
 * Combined Pro + ownership check
 * For Pro-only resources that also require ownership validation
 */
export async function requireProAndOwnership(
  resourceId: string,
  table: 'decks' | 'cards' | 'sources' | 'runs' | 'simulados',
  _request?: NextRequest
): Promise<AuthResult | NextResponse> {
  const authResult = await requirePro(_request);

  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const ownershipResult = await requireOwnership(authResult.user.id, resourceId, table);

  if (ownershipResult instanceof NextResponse) {
    return ownershipResult;
  }

  return authResult;
}

// ============================================================================
// HELPER TYPE GUARD
// ============================================================================

/**
 * Type guard to check if result is AuthResult (success) vs NextResponse (error)
 */
export function isAuthSuccess(result: AuthResult | NextResponse): result is AuthResult {
  return !(result instanceof NextResponse);
}
