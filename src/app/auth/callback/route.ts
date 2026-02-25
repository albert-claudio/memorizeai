import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ============================================================================
// SECURITY: Safe redirect validation to prevent open redirect attacks
// ============================================================================
const SAFE_REDIRECT_PREFIXES = [
  '/dashboard',
  '/estudar',
  '/decks',
  '/simulado',
  '/upgrade',
  '/email-confirmado',
  '/settings',
];

function isSafeRedirect(url: string): boolean {
  // Must be a relative path starting with /
  if (!url.startsWith('/')) return false;
  // Must not be a protocol-relative URL (//evil.com)
  if (url.startsWith('//')) return false;
  // Must match one of the allowed prefixes
  return SAFE_REDIRECT_PREFIXES.some(prefix => url.startsWith(prefix));
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const nextParam = requestUrl.searchParams.get('next') ?? '/dashboard'
  
  // SECURITY: Validate redirect to prevent open redirect attacks
  const next = isSafeRedirect(nextParam) ? nextParam : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      // Para login com OAuth (Google), verifica/cria profile
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single()
      
      // Se não tem profile, cria um novo (primeiro login com Google)
      if (!existingProfile) {
        const now = Date.now()
        await supabase.from('profiles').insert({
          id: data.user.id,
          is_pro: false,
          created_at: now,
          updated_at: now,
        })
        console.log('[Auth] Profile criado para usuário Google:', data.user.email)
      }
      
      // If this was an email confirmation, redirect to confirmation success page
      if (type === 'signup' || type === 'email') {
        return NextResponse.redirect(new URL('/email-confirmado', request.url))
      }
      
      // Otherwise redirect to dashboard or next page
      return NextResponse.redirect(new URL(next, request.url))
    }
    
    console.error('[Auth] Erro no callback:', error?.message)
  }

  // If something went wrong, redirect to login with error
  return NextResponse.redirect(new URL('/login?error=callback', request.url))
}

