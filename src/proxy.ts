import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  applyRateLimit,
  getClientIP,
  getRateLimitError,
} from '@/lib/security/rate-limiter'
import { hasProAccess } from '@/lib/billing/pro-access'

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // ============================================================
  // RATE LIMITING (executa antes de qualquer outra coisa)
  // Uses Redis when available, falls back to in-memory otherwise.
  // ============================================================
  const ip = getClientIP(request)
  const rateLimitResult = await applyRateLimit(pathname, ip, request.method)

  if (rateLimitResult) {
    const { success, limit, remaining, reset, mode } = rateLimitResult

    // Se limite excedido, retorna 429
    if (!success) {
      const { error, retryAfter } = getRateLimitError(reset)
      return NextResponse.json(
        { error, retryAfter },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': reset.toString(),
            'X-RateLimit-Mode': mode,
            'Retry-After': retryAfter.toString(),
          },
        }
      )
    }

    // Adiciona headers de rate limit na resposta bem-sucedida
    request.headers.set('X-RateLimit-Limit', limit.toString())
    request.headers.set('X-RateLimit-Remaining', remaining.toString())
    request.headers.set('X-RateLimit-Reset', reset.toString())
    request.headers.set('X-RateLimit-Mode', mode)
  }

  // ============================================================
  // SUPABASE AUTH (código existente)
  // ============================================================
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes that require authentication
  const protectedRoutes = ['/admin', '/dashboard', '/deck', '/estudar', '/simulado', '/upgrade', '/settings']
  const isProtectedRoute = protectedRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  )

  // Auth routes (login, signup) - redirect to dashboard if already logged in
  const authRoutes = ['/login', '/cadastro']
  const isAuthRoute = authRoutes.some(route => 
    request.nextUrl.pathname === route
  )

  // If user is NOT logged in and trying to access protected route -> redirect to login
  if (!user && isProtectedRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // If user IS logged in and trying to access auth pages -> redirect to dashboard
  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ============================================================
  // PREMIUM ROUTE PROTECTION (Pro users only)
  // ============================================================
  // Define routes that require active premium subscription
  const premiumRoutes = [
    // '/dashboard/runs',      // AI generation (Pro only) -> REMOVED: Free users have quota
    // '/dashboard/upload',    // Document upload (Pro only) -> REMOVED: Free users have quota
    '/simulado/pro', 
    '/estudar/ilimitado'
  ]
  const isPremiumRoute = premiumRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  )

  if (isPremiumRoute && user) {
    // Check if user has active subscription
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, subscription_status, subscription_period_end, admin_override_pro')
      .eq('id', user.id)
      .single()
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, cancel_at_period_end, current_period_end')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const isActive = hasProAccess({
      ...profile,
      subscription_status: subscription?.status ?? profile?.subscription_status,
      subscription_period_end: subscription?.current_period_end ?? profile?.subscription_period_end,
      cancel_at_period_end: subscription?.cancel_at_period_end,
    })

    if (!isActive) {
      // Redirect to upgrade page
      return NextResponse.redirect(new URL('/upgrade', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     * 
     * NOTA: API routes são incluídas para rate limiting
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
