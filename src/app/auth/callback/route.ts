import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { trackServer } from '@/lib/analytics/server-tracker'
import { activateBetaInviteForUser } from '@/lib/beta/invites'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const SAFE_REDIRECT_PREFIXES = [
  '/admin',
  '/dashboard',
  '/estudar',
  '/decks',
  '/redefinir-senha',
  '/simulado',
  '/upgrade',
  '/email-confirmado',
  '/settings',
];

function isSafeRedirect(url: string): boolean {
  if (!url.startsWith('/')) return false;
  if (url.startsWith('//')) return false;
  return SAFE_REDIRECT_PREFIXES.some(prefix => url.startsWith(prefix));
}

function resolveNextPath(requestUrl: URL, type: 'signup' | 'email' | 'recovery' | 'invite' | null) {
  const flow = requestUrl.searchParams.get('flow');
  const requestedNext = requestUrl.searchParams.get('next');
  const defaultNext = type === 'recovery' || flow === 'recovery'
    ? '/redefinir-senha'
    : '/dashboard';
  const next = requestedNext ?? defaultNext;

  return isSafeRedirect(next) ? next : defaultNext;
}

function getErrorRedirectPath(requestUrl: URL, type: 'signup' | 'email' | 'recovery' | 'invite' | null) {
  const flow = requestUrl.searchParams.get('flow');

  if (type === 'recovery' || flow === 'recovery') {
    return '/redefinir-senha?error=reset_link_invalid';
  }

  return '/login?error=callback';
}

async function ensureProfileExists(userId: string, email?: string | null) {
  const supabase = await createClient();
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single();

  if (!existingProfile) {
    const now = Date.now();
    await supabase.from('profiles').insert({
      id: userId,
      is_pro: false,
      created_at: now,
      updated_at: now,
    });
    console.log('[Auth] Profile criado para usuario:', email);
  }

  if (email) {
    try {
      await activateBetaInviteForUser({
        admin: getSupabaseAdmin(),
        userId,
        email,
      });
    } catch (error) {
      console.error('[Auth] Falha ao sincronizar acesso beta:', error);
    }
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type') as 'signup' | 'email' | 'recovery' | 'invite' | null;
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const next = resolveNextPath(requestUrl, type);
  const errorRedirect = getErrorRedirectPath(requestUrl, type);

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error && data.user) {
      if (type === 'signup' || type === 'email') {
        await ensureProfileExists(data.user.id, data.user.email);
        trackServer('email_confirmed', data.user.id, { method: type });
        return NextResponse.redirect(new URL('/email-confirmado', request.url));
      }

      await ensureProfileExists(data.user.id, data.user.email);
      return NextResponse.redirect(new URL(next, request.url));
    }

    console.error('[Auth] Erro ao verificar token:', error?.message);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (type === 'signup' || type === 'email') {
        await ensureProfileExists(data.user.id, data.user.email);
        trackServer('email_confirmed', data.user.id, { method: type });
        return NextResponse.redirect(new URL('/email-confirmado', request.url));
      }

      await ensureProfileExists(data.user.id, data.user.email);
      return NextResponse.redirect(new URL(next, request.url));
    }

    console.error('[Auth] Erro no callback:', error?.message);
  }

  return NextResponse.redirect(new URL(errorRedirect, request.url));
}
