import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe, getOrCreateCustomer, getSubscriptionStatus } from '@/lib/billing/stripe';
import { getCheckoutPlan } from '@/lib/billing/plans';
import { getAllowedRequestOrigins, getRequestOrigin } from '@/lib/security/request-origin';

const ALLOWED_REQUEST_KEYS = new Set(['planKey']);
const FORBIDDEN_CLIENT_PRICING_KEYS = [
  'priceId',
  'price_id',
  'price',
  'amount',
  'discount_value',
  'plan_price',
  'coupon',
  'promotion_code',
  'trial_period_days',
  'duration',
  'billing_cycle',
] as const;

function parseBody(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

function validateOrigin(request: NextRequest): { valid: true; origin: string } | { valid: false } {
  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin) {
    return { valid: false };
  }

  const allowedOrigins = getAllowedRequestOrigins(request);

  if (!allowedOrigins.has(requestOrigin)) {
    return { valid: false };
  }

  return { valid: true, origin: requestOrigin };
}

function buildCheckoutIdempotencyKey(userId: string, planKey: string): string {
  // Prevent duplicate sessions caused by repeated clicks in a short window.
  const bucket = Math.floor(Date.now() / 20_000);
  return `checkout:${userId}:${planKey}:${bucket}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = parseBody(await request.json().catch(() => ({})));

    const forbiddenKey = FORBIDDEN_CLIENT_PRICING_KEYS.find((key) =>
      Object.prototype.hasOwnProperty.call(body, key)
    );
    if (forbiddenKey) {
      return NextResponse.json(
        { error: `Campo não permitido no checkout: ${forbiddenKey}` },
        { status: 400 }
      );
    }

    const unexpectedKeys = Object.keys(body).filter((key) => !ALLOWED_REQUEST_KEYS.has(key));
    if (unexpectedKeys.length > 0) {
      return NextResponse.json(
        { error: `Payload inválido. Campos não aceitos: ${unexpectedKeys.join(', ')}` },
        { status: 400 }
      );
    }

    const planKey = typeof body.planKey === 'string' ? body.planKey.trim() : '';
    if (!planKey) {
      return NextResponse.json(
        { error: 'planKey é obrigatório' },
        { status: 400 }
      );
    }

    const plan = getCheckoutPlan(planKey);
    if (!plan) {
      return NextResponse.json(
        { error: 'Plano inválido ou indisponível' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const subscriptionStatus = await getSubscriptionStatus(user.id);
    const isSameTierActive =
      subscriptionStatus.isPro &&
      subscriptionStatus.tier === plan.tier &&
      (subscriptionStatus.status === 'active' || subscriptionStatus.status === 'past_due');

    if (isSameTierActive) {
      return NextResponse.json(
        { error: 'Plano já está ativo para este usuário' },
        { status: 409 }
      );
    }

    const customerId = await getOrCreateCustomer(
      user.id,
      user.email || '',
      user.user_metadata?.name
    );

    const originCheck = validateOrigin(request);
    if (!originCheck.valid) {
      return NextResponse.json(
        { error: 'Origem não autorizada' },
        { status: 403 }
      );
    }

    const origin = originCheck.origin;
    const idempotencyKey = buildCheckoutIdempotencyKey(user.id, plan.planKey);

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan.stripePriceId,
            quantity: 1,
          },
        ],
        success_url: `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/dashboard?checkout=canceled`,
        metadata: {
          user_id: user.id,
          plan_key: plan.planKey,
        },
        subscription_data: {
          metadata: {
            user_id: user.id,
            plan_key: plan.planKey,
          },
        },
        locale: 'pt-BR',
        allow_promotion_codes: false,
      },
      {
        idempotencyKey,
      }
    );

    if (!session.url) {
      return NextResponse.json(
        { error: 'Checkout indisponível no momento' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[Stripe Checkout] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao criar sessão de checkout' },
      { status: 500 }
    );
  }
}
