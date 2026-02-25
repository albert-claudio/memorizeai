import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  
  // Get the token_hash and type from Supabase email confirmation link
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as 'signup' | 'email' | 'recovery' | 'invite' | null
  
  if (token_hash && type) {
    const supabase = await createClient()
    
    // Verify the OTP token
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    })
    
    if (!error && data.user) {
      // Create profile if it doesn't exist (first time confirmation)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single()
      
      if (!existingProfile) {
        const now = Date.now()
        await supabase.from('profiles').insert({
          id: data.user.id,
          is_pro: false,
          created_at: now,
          updated_at: now,
        })
        console.log('[Auth] Profile criado para novo usuário:', data.user.email)
      }
      
      // Redirect to email confirmed page
      return NextResponse.redirect(new URL('/email-confirmado', request.url))
    }
    
    console.error('[Auth] Erro na confirmação de email:', error?.message)
    return NextResponse.redirect(new URL('/login?error=confirmation_failed', request.url))
  }
  
  // If no token_hash, check for code (PKCE flow)
  const code = requestUrl.searchParams.get('code')
  
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      return NextResponse.redirect(new URL('/email-confirmado', request.url))
    }
    
    console.error('[Auth] Erro no callback:', error?.message)
  }
  
  // If something went wrong, redirect to login with error
  return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
}
