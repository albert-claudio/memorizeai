import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe, getOrCreateCustomer, PRO_PRICE_ID } from '@/lib/billing/stripe';

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
    // 2. GET PRICE ID - Only allow configured PRO_PRICE_ID
    // ================================================================
    const body = await request.json().catch(() => ({}));
    const requestedPriceId = body.priceId;
    
    // SECURITY: Only allow the configured PRO_PRICE_ID, not arbitrary price IDs
    if (!PRO_PRICE_ID) {
      return NextResponse.json(
        { error: 'Price ID não configurado' },
        { status: 500 }
      );
    }
    
    // If client sends a priceId, it MUST match our configured PRO_PRICE_ID
    if (requestedPriceId && requestedPriceId !== PRO_PRICE_ID) {
      console.warn(`[Stripe] Rejected invalid priceId: ${requestedPriceId}`);
      return NextResponse.json(
        { error: 'Invalid price ID' },
        { status: 400 }
      );
    }
    
    const priceId = PRO_PRICE_ID;

    // ================================================================
    // 3. GET OR CREATE STRIPE CUSTOMER
    // ================================================================
    const customerId = await getOrCreateCustomer(
      user.id,
      user.email || '',
      user.user_metadata?.name
    );

    // ================================================================
    // 4. SECURITY: Use allowlisted origin only (never trust Origin header)
    // ================================================================
    const ALLOWED_ORIGINS = [
      process.env.NEXT_PUBLIC_APP_URL,
      'https://memoriza.app',
      'https://www.memoriza.app',
    ].filter(Boolean);

    const requestOrigin = request.headers.get('origin');
    // Only use request origin if it's in our allowlist, otherwise use env default
    const origin = (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin))
      ? requestOrigin
      : (process.env.NEXT_PUBLIC_APP_URL || 'https://memoriza.app');

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      // URLs de callback
      success_url: `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard?checkout=canceled`,
      // Metadata para rastreamento
      metadata: {
        user_id: user.id,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
        },
      },
      // Configurações brasileiras
      locale: 'pt-BR',
      allow_promotion_codes: true,
    });

    // ================================================================
    // 5. RETURN SESSION URL FOR REDIRECT
    // ================================================================
    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });

  } catch (error) {
    console.error('[Stripe Checkout] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao criar sessão de checkout' },
      { status: 500 }
    );
  }
}
