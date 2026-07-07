import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin, type SupabaseClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/billing/stripe';
import { getAllowedRequestOrigins, getRequestOrigin } from '@/lib/security/request-origin';

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function resolveStripeCustomerId(
  supabaseAdminClient: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: profile, error: profileError } = await supabaseAdminClient
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.warn('[Stripe Portal] Unable to read profile stripe_customer_id:', profileError);
  }

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  const { data: latestSubscription, error: subscriptionError } = await supabaseAdminClient
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    console.warn('[Stripe Portal] Unable to read active subscription row:', subscriptionError);
    return null;
  }

  return latestSubscription?.stripe_customer_id ?? null;
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
    // 2. GET STRIPE CUSTOMER ID (admin client bypasses RLS on profiles)
    // ================================================================
    const stripeCustomerId = await resolveStripeCustomerId(supabaseAdmin, user.id);

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'Nenhuma assinatura encontrada' },
        { status: 400 }
      );
    }

    // ================================================================
    // 3. SECURITY: Validate Origin (CSRF protection)
    // ================================================================
    const allowedOrigins = getAllowedRequestOrigins(request);
    const requestOrigin = getRequestOrigin(request);

    if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
      return NextResponse.json(
        { error: 'Origem nao autorizada' },
        { status: 403 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
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
