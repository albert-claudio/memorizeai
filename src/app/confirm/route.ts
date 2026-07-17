import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ensureFreeTrialForUser } from '@/lib/billing/free-trial'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

async function ensureProfileExists(userId: string) {
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
    console.log('[Auth] Profile criado para novo usuario:', userId);
  }

  try {
    await ensureFreeTrialForUser({
      admin: getSupabaseAdmin(),
      userId,
    });
  } catch (error) {
    console.error('[Auth] Falha ao sincronizar trial gratuito:', error);
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as 'signup' | 'email' | 'recovery' | 'invite' | null;
  const code = requestUrl.searchParams.get('code');

  if (token_hash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    if (!error && data.user) {
      if (type === 'recovery') {
        return NextResponse.redirect(new URL('/redefinir-senha', request.url));
      }

      await ensureProfileExists(data.user.id);
      return NextResponse.redirect(new URL('/email-confirmado', request.url));
    }

    console.error('[Auth] Erro na confirmacao de email:', error?.message);
    return NextResponse.redirect(new URL('/login?error=confirmation_failed', request.url));
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (type === 'recovery') {
        return NextResponse.redirect(new URL('/redefinir-senha', request.url));
      }

      await ensureProfileExists(data.user.id);
      return NextResponse.redirect(new URL('/email-confirmado', request.url));
    }

    console.error('[Auth] Erro no callback:', error?.message);
  }

  return NextResponse.redirect(new URL('/login?error=invalid_link', request.url));
}
