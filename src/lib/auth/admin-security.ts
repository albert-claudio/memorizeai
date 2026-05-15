import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/auth/rbac';

export type AdminAccessFailureCode = 'unauthenticated' | 'jwt_role' | 'db_role' | 'mfa_required' | 'mfa_error';

export interface AdminAccessSuccess {
  ok: true;
  userId: string;
  email: string;
  appRole: 'admin';
  aal: 'aal2';
}

export interface AdminAccessFailure {
  ok: false;
  code: AdminAccessFailureCode;
  status: number;
  error: string;
  redirectTo?: string;
}

export type AdminAccessResult = AdminAccessSuccess | AdminAccessFailure;

function getJwtAppRole(user: User): unknown {
  return user.app_metadata?.app_role ?? user.app_metadata?.role;
}

export function hasAdminRoleInJwt(user: User): boolean {
  return isAdminRole(getJwtAppRole(user));
}

export async function getAdminAccessState(requireMfa = true): Promise<AdminAccessResult> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      code: 'unauthenticated',
      status: 401,
      error: 'Nao autorizado. Faca login para continuar.',
      redirectTo: '/login',
    };
  }

  const email = user.email?.trim().toLowerCase();
  if (!email) {
    return {
      ok: false,
      code: 'unauthenticated',
      status: 403,
      error: 'Conta sem email associado.',
    };
  }

  if (!hasAdminRoleInJwt(user)) {
    return {
      ok: false,
      code: 'jwt_role',
      status: 403,
      error: 'JWT sem permissao administrativa.',
      redirectTo: '/dashboard',
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('app_role')
    .eq('id', user.id)
    .single();

  if (profileError || !isAdminRole(profile?.app_role)) {
    console.warn(
      `[Admin Guard] Non-admin access attempt: ${email}${profileError ? ` (${profileError.message})` : ''}`
    );
    return {
      ok: false,
      code: 'db_role',
      status: 403,
      error: 'Acesso restrito a administradores.',
      redirectTo: '/dashboard',
    };
  }

  if (requireMfa) {
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) {
      return {
        ok: false,
        code: 'mfa_error',
        status: 403,
        error: 'Nao foi possivel validar MFA.',
        redirectTo: '/admin/mfa',
      };
    }

    if (aal?.currentLevel !== 'aal2') {
      return {
        ok: false,
        code: 'mfa_required',
        status: 403,
        error: 'MFA obrigatorio para acessar o admin.',
        redirectTo: '/admin/mfa',
      };
    }
  }

  return {
    ok: true,
    userId: user.id,
    email,
    appRole: 'admin',
    aal: 'aal2',
  };
}

export function adminFailureResponse(result: AdminAccessFailure): NextResponse {
  return NextResponse.json(
    {
      error: result.error,
      code: result.code,
      redirectTo: result.redirectTo,
    },
    { status: result.status }
  );
}
