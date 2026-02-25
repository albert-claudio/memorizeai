import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/billing/stripe';

export async function POST(request: NextRequest) {
  try {
    // ================================================================
    // 1. AUTHENTICATE USER
    // ================================================================
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
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
    // 3. SECURITY: Use allowlisted origin only (never trust Origin header)
    // ================================================================
    const ALLOWED_ORIGINS = [
      process.env.NEXT_PUBLIC_APP_URL,
      'https://memoriza.app',
      'https://www.memoriza.app',
    ].filter(Boolean);

    const requestOrigin = request.headers.get('origin');
    const origin = (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin))
      ? requestOrigin
      : (process.env.NEXT_PUBLIC_APP_URL || 'https://memoriza.app');

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/dashboard`,
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
