import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/billing/stripe';
import { getBaseUrl } from '@/lib/url';

function normalizeOrigin(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(request: NextRequest): string | null {
  const originHeader = request.headers.get('origin');
  if (originHeader) {
    return normalizeOrigin(originHeader);
  }

  return normalizeOrigin(request.headers.get('referer'));
}

function getAllowedOrigins(request: NextRequest): Set<string> {
  return new Set(
    [
      request.nextUrl.origin,
      getBaseUrl(),
      'https://memoriza.app',
      'https://www.memoriza.app',
      'http://localhost:3000',
    ]
      .map((origin) => normalizeOrigin(origin ?? null))
      .filter((origin): origin is string => Boolean(origin))
  );
}

export async function POST(request: NextRequest) {
  try {
    // ================================================================
    // 1. AUTHENTICATE USER
    // ================================================================
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Nao autorizado' },
        { status: 401 }
      );
    }

    // ================================================================
    // 2. GET STRIPE CUSTOMER ID FROM PROFILE
    // ================================================================
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Nenhuma assinatura encontrada' },
        { status: 400 }
      );
    }

    // ================================================================
    // 3. SECURITY: Validate Origin (CSRF protection)
    // ================================================================
    const allowedOrigins = getAllowedOrigins(request);
    const requestOrigin = getRequestOrigin(request);

    if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
      return NextResponse.json(
        { error: 'Origem nao autorizada' },
        { status: 403 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${requestOrigin}/dashboard`,
    });

    // ================================================================
    // 4. RETURN PORTAL URL FOR REDIRECT
    // ================================================================
    return NextResponse.json({
      url: session.url,
    });

  } catch (error) {
    console.error('[Stripe Portal] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao criar portal de gerenciamento' },
      { status: 500 }
    );
  }
}
