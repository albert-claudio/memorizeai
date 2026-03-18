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
  return process.env.BILLING_E2E_ENABLED === 'true' && process.env.NODE_ENV !== 'production';
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

function toMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value * 1000;
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

    const email = `billing-e2e+${runId}@vimens.app`;
    const tempPassword = `${crypto.randomUUID()}Aa1!`;
    const now = Date.now();

    // Create an isolated auth user for this integration run.
    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name: `Billing E2E ${runId}`,
        billing_e2e: true,
      },
    });

    if (createUserError || !createdUser.user) {
      console.error('[Billing E2E] Failed to create user:', createUserError);
      return NextResponse.json(
        { error: 'Failed to create integration user' },
        { status: 500 }
      );
    }

    const userId = createdUser.user.id;

    const customer = await stripe.customers.create({
      email,
      name: `Billing E2E ${runId}`,
      metadata: {
        user_id: userId,
        billing_e2e: 'true',
        run_id: runId,
      },
    });

    const attachedPaymentMethod = await stripe.paymentMethods.attach('pm_card_visa', {
      customer: customer.id,
    });

    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: attachedPaymentMethod.id,
      },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRO_PRICE_ID }],
      default_payment_method: attachedPaymentMethod.id,
      metadata: {
        user_id: userId,
        billing_e2e: 'true',
        run_id: runId,
      },
    });

    const rootPeriodStart = toMs(
      (subscription as unknown as { current_period_start?: number }).current_period_start
    );
    const rootPeriodEnd = toMs(
      (subscription as unknown as { current_period_end?: number }).current_period_end
    );
    const itemPeriodStart = toMs(
      (subscription.items?.data?.[0] as { current_period_start?: number } | undefined)
        ?.current_period_start
    );
    const itemPeriodEnd = toMs(
      (subscription.items?.data?.[0] as { current_period_end?: number } | undefined)
        ?.current_period_end
    );
    const periodStart = rootPeriodStart ?? itemPeriodStart;
    const periodEnd = rootPeriodEnd ?? itemPeriodEnd;

    const { error: profileError } = await supabaseAdmin
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

    if (profileError) {
      console.error('[Billing E2E] Failed to seed profile:', profileError);
      return NextResponse.json(
        { error: 'Failed to seed profile for integration user' },
        { status: 500 }
      );
    }

    const { error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .upsert(
        {
          id: `sub_${subscription.id.slice(-24)}`,
          user_id: userId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: customer.id,
          price_id: subscription.items.data[0]?.price?.id ?? PRO_PRICE_ID,
          status: subscription.status,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          cancel_at_period_end: subscription.cancel_at_period_end,
          created_at: now,
          updated_at: now,
        },
        {
          onConflict: 'stripe_subscription_id',
        }
      );

    if (subscriptionError) {
      console.error('[Billing E2E] Failed to seed subscription row:', subscriptionError);
      return NextResponse.json(
        { error: 'Failed to seed subscription row' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      runId,
      userId,
      email,
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      stripePaymentMethodId: attachedPaymentMethod.id,
    });
  } catch (error) {
    console.error('[Billing E2E] Bootstrap failed:', error);
    return NextResponse.json(
      { error: 'Billing E2E bootstrap failed' },
      { status: 500 }
    );
  }
}
