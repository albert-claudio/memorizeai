import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe, PRO_PRICE_ID } from '@/lib/billing/stripe';
import { timingSafeEqual } from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function isBillingE2EEnabled(): boolean {
  return process.env.BILLING_E2E_ENABLED === 'true';
}

function hasValidKey(request: NextRequest): boolean {
  const expectedKey = process.env.BILLING_E2E_SECRET;
  const providedKey = request.headers.get('x-billing-e2e-key');
  if (!expectedKey || !providedKey) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedKey, 'utf8');
  const providedBuffer = Buffer.from(providedKey, 'utf8');
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function getBaseUrl(request: NextRequest): string {
  const configured = process.env.BILLING_E2E_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  return request.nextUrl.origin.replace(/\/+$/, '');
}

export async function POST(request: NextRequest) {
  try {
    if (!isBillingE2EEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!hasValidKey(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!PRO_PRICE_ID) {
      return NextResponse.json(
        { error: 'STRIPE_PRO_PRICE_ID is not configured' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const runId =
      typeof body?.runId === 'string' && body.runId.trim().length > 0
        ? body.runId.trim()
        : crypto.randomUUID().replace(/-/g, '').slice(0, 16);

    const email = `billing-checkout-e2e+${runId}@vimens.app`;
    const tempPassword = `${crypto.randomUUID()}Aa1!`;
    const now = Date.now();

    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name: `Billing Checkout E2E ${runId}`,
        billing_e2e_checkout: true,
      },
    });

    if (createUserError || !createdUser.user) {
      console.error('[Billing Checkout E2E] Failed to create user:', createUserError);
      return NextResponse.json(
        { error: 'Failed to create integration user' },
        { status: 500 }
      );
    }

    const userId = createdUser.user.id;
    const customer = await stripe.customers.create({
      email,
      name: `Billing Checkout E2E ${runId}`,
      metadata: {
        user_id: userId,
        billing_e2e: 'true',
        checkout_e2e: 'true',
        run_id: runId,
      },
    });

    const profileUpdate = await supabaseAdmin
      .from('profiles')
      .update({
        stripe_customer_id: customer.id,
        is_pro: false,
        subscription_status: 'free',
        subscription_tier: 'free',
        subscription_period_end: null,
        updated_at: now,
      })
      .eq('id', userId);

    if (profileUpdate.error) {
      console.error('[Billing Checkout E2E] Failed to seed profile:', profileUpdate.error);
      return NextResponse.json(
        { error: 'Failed to seed profile for integration user' },
        { status: 500 }
      );
    }

    const baseUrl = getBaseUrl(request);
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: PRO_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/confirm?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/confirm?checkout=canceled`,
      metadata: {
        user_id: userId,
        billing_e2e: 'true',
        checkout_e2e: 'true',
        run_id: runId,
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          billing_e2e: 'true',
          checkout_e2e: 'true',
          run_id: runId,
        },
      },
      allow_promotion_codes: false,
    });

    return NextResponse.json({
      runId,
      userId,
      email,
      stripeCustomerId: customer.id,
      checkoutSessionId: checkoutSession.id,
      checkoutUrl: checkoutSession.url,
    });
  } catch (error) {
    console.error('[Billing Checkout E2E] Failed:', error);
    return NextResponse.json(
      { error: 'Billing checkout E2E setup failed' },
      { status: 500 }
    );
  }
}
