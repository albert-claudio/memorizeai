import { NextRequest, NextResponse } from 'next/server';
import { stripe, getSubscriptionTier } from '@/lib/billing/stripe';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import {
  runSecurityChecks,
  getClientIP,
  isStripeIP,
  logWebhookAttempt,
  recordFailedAttempt,
  checkEventIdempotencyAtomic,
  finalizeEvent,
} from '@/lib/security/webhook-security';
import type { WebhookOutcome } from '@/lib/security/webhook-security';
import { emitPlanRenewalNotification } from '@/lib/notifications/emitters';
import { captureApiError, captureWarning } from '@/lib/sentry';

// ============================================================================
// WEBHOOK HANDLER - Secure Backend Processing
// ============================================================================
// All Stripe events are processed server-side with signature verification.
// No sensitive data is exposed to the client.
//
// SECURITY LAYERS:
// 1. Rate limiting with IP blocking
// 2. HMAC signature verification (Stripe native)
// 3. Timestamp verification (replay attack protection)
// 4. Event idempotency (duplicate detection)
// 5. Audit logging

// Use service role for database operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function toUnixMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value * 1000;
}

function getPeriodBounds(
  subscription: Stripe.Subscription
): { periodStart: number | null; periodEnd: number | null } {
  const rootStart = toUnixMs(
    (subscription as unknown as { current_period_start?: number }).current_period_start
  );
  const rootEnd = toUnixMs(
    (subscription as unknown as { current_period_end?: number }).current_period_end
  );

  const firstItem = subscription.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;

  const itemStart = toUnixMs(firstItem?.current_period_start);
  const itemEnd = toUnixMs(firstItem?.current_period_end);

  return {
    periodStart: rootStart ?? itemStart,
    periodEnd: rootEnd ?? itemEnd,
  };
}

function getInvoicePriceId(invoice: Stripe.Invoice): string | null {
  const primaryLine = getPrimaryInvoiceLine(invoice);
  return primaryLine?.price?.id ?? null;
}

function getPrimaryInvoiceLine(invoice: Stripe.Invoice): (Stripe.InvoiceLineItem & {
  price?: { id?: string | null; recurring?: unknown } | null;
  period?: { start?: number; end?: number };
  subscription_item?: string | null;
  proration?: boolean;
  type?: string;
}) | null {
  const lines = (invoice.lines?.data ?? []) as Array<
    | (Stripe.InvoiceLineItem & {
        price?: { id?: string | null; recurring?: unknown } | null;
        period?: { start?: number; end?: number };
        subscription_item?: string | null;
        proration?: boolean;
        type?: string;
      })
  >;

  if (!lines.length) {
    return null;
  }

  const nonProrationSubscriptionLine = lines.find((line) => (
    line.type === 'subscription' &&
    !line.proration &&
    Boolean(line.price?.id)
  ));
  if (nonProrationSubscriptionLine) {
    return nonProrationSubscriptionLine;
  }

  const subscriptionItemLine = lines.find((line) => (
    Boolean(line.subscription_item) &&
    !line.proration &&
    Boolean(line.price?.id)
  ));
  if (subscriptionItemLine) {
    return subscriptionItemLine;
  }

  const recurringLine = lines.find((line) => (
    Boolean(line.price?.recurring) &&
    Boolean(line.price?.id)
  ));
  if (recurringLine) {
    return recurringLine;
  }

  const firstLineWithPrice = lines.find((line) => Boolean(line.price?.id));
  return firstLineWithPrice ?? lines[0];
}

function getInvoicePeriodBounds(invoice: Stripe.Invoice): {
  periodStart: number | null;
  periodEnd: number | null;
} {
  const primaryLine = getPrimaryInvoiceLine(invoice);

  return {
    periodStart: toUnixMs(primaryLine?.period?.start),
    periodEnd: toUnixMs(primaryLine?.period?.end),
  };
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // Stripe API (current): subscription lives under parent.subscription_details.subscription
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  if (typeof parentSubscription === 'string') {
    return parentSubscription;
  }
  if (parentSubscription && typeof parentSubscription === 'object') {
    return parentSubscription.id ?? null;
  }

  // Backward compatibility for legacy payloads/tests that still use invoice.subscription
  const legacyInvoice = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  const legacySubscription = legacyInvoice.subscription;
  if (typeof legacySubscription === 'string') {
    return legacySubscription;
  }
  if (legacySubscription && typeof legacySubscription === 'object') {
    return legacySubscription.id ?? null;
  }

  return null;
}

function getStripeId(
  value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    return value.id ?? null;
  }
  return null;
}

function buildSubscriptionRowId(stripeSubscriptionId: string): string {
  return `sub_${stripeSubscriptionId.slice(-24)}`;
}

async function findUserIdByCustomerId(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  return profile?.id ?? null;
}

async function findSubscriptionIdentityById(subscriptionId: string | null): Promise<{
  userId: string | null;
  customerId: string | null;
}> {
  if (!subscriptionId) {
    return { userId: null, customerId: null };
  }

  const { data: subscriptionRow } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id, stripe_customer_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  return {
    userId: subscriptionRow?.user_id ?? null,
    customerId: subscriptionRow?.stripe_customer_id ?? null,
  };
}

async function resolveBillingIdentity(params: {
  customerId: string | null;
  metadataUserId: string | null;
  subscriptionId: string | null;
}): Promise<{ userId: string | null; customerId: string | null }> {
  let resolvedUserId: string | null = null;
  let resolvedCustomerId: string | null = params.customerId;

  resolvedUserId = await findUserIdByCustomerId(resolvedCustomerId);
  if (!resolvedUserId && params.metadataUserId) {
    resolvedUserId = params.metadataUserId;
  }

  const mapped = await findSubscriptionIdentityById(params.subscriptionId);
  if (!resolvedUserId && mapped.userId) {
    resolvedUserId = mapped.userId;
  }
  if (mapped.customerId && (!resolvedCustomerId || resolvedUserId === mapped.userId)) {
    resolvedCustomerId = mapped.customerId;
  }

  if (!resolvedUserId && params.subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(params.subscriptionId);
      const metadataUserId = subscription.metadata?.user_id ?? null;
      const subscriptionCustomerId = getStripeId(subscription.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);

      if (!resolvedCustomerId && subscriptionCustomerId) {
        resolvedCustomerId = subscriptionCustomerId;
      }
      if (metadataUserId) {
        resolvedUserId = metadataUserId;
      }

      if (!resolvedUserId && resolvedCustomerId) {
        resolvedUserId = await findUserIdByCustomerId(resolvedCustomerId);
      }
    } catch (error) {
      console.warn('[Stripe Webhook] Unable to retrieve subscription for identity fallback:', error);
    }
  }

  return { userId: resolvedUserId, customerId: resolvedCustomerId };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIP = getClientIP(request.headers);

  // Defense-in-depth: warn if request doesn't come from a known Stripe IP
  if (!isStripeIP(clientIP)) {
    console.warn(`[Stripe Webhook] Request from non-Stripe IP: ${clientIP}`);
  }

  const signature = request.headers.get('stripe-signature');

  // ================================================================
  // 1. PRE-SIGNATURE SECURITY CHECKS (Rate limiting, IP blocking)
  // ================================================================
  const preCheck = await runSecurityChecks(clientIP, signature);
  
  if (!preCheck.passed && preCheck.rateLimitResult.blocked) {
    console.warn(`[Stripe Webhook] Blocked IP attempted access: ${clientIP}`);
    await logWebhookAttempt({
      ip: clientIP,
      eventId: null,
      eventType: null,
      success: false,
      error: 'IP blocked',
      signatureValid: false,
      timestampValid: false,
      processingTimeMs: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: 'Too many requests. IP temporarily blocked.' },
      { status: 429 }
    );
  }

  if (!preCheck.rateLimitResult.allowed) {
    await logWebhookAttempt({
      ip: clientIP,
      eventId: null,
      eventType: null,
      success: false,
      error: 'Rate limit exceeded',
      signatureValid: false,
      timestampValid: false,
      processingTimeMs: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: preCheck.rateLimitResult.retryAfterMs },
      { status: 429 }
    );
  }

  // ================================================================
  // 2. VERIFY SIGNATURE HEADER EXISTS
  // ================================================================
  if (!signature) {
    console.error('[Stripe Webhook] Missing signature header');
    await recordFailedAttempt(clientIP);
    await logWebhookAttempt({
      ip: clientIP,
      eventId: null,
      eventType: null,
      success: false,
      error: 'Missing signature header',
      signatureValid: false,
      timestampValid: false,
      processingTimeMs: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 401 }
    );
  }

  // ================================================================
  // 3. VERIFY TIMESTAMP (Replay attack protection)
  // ================================================================
  if (preCheck.timestampResult && !preCheck.timestampResult.valid) {
    // Skip in development: stripe listen CLI causes clock-skew false positives.
    // HMAC signature verification below is the primary security gate.
    if (process.env.NODE_ENV === 'production') {
      console.error('[Stripe Webhook] Timestamp verification failed:', preCheck.timestampResult.reason);
      await logWebhookAttempt({
        ip: clientIP,
        eventId: null,
        eventType: null,
        success: false,
        error: preCheck.timestampResult.reason,
        signatureValid: false,
        timestampValid: false,
        processingTimeMs: Date.now() - startTime,
      });
      return NextResponse.json(
        { error: 'Event too old or invalid timestamp' },
        { status: 400 }
      );
    }
    console.warn('[Stripe Webhook] Timestamp check skipped in dev:', preCheck.timestampResult.reason);
  }

  // ================================================================
  // 4. WEBHOOK SECRET CHECK
  // ================================================================
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Stripe Webhook] Webhook secret not configured');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    );
  }

  // ================================================================
  // 5. VERIFY HMAC SIGNATURE (Stripe native verification)
  // ================================================================
  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stripe Webhook] Signature verification failed:', message);
    
    // Record failed attempt for potential IP blocking
    const { blocked, failCount } = await recordFailedAttempt(clientIP);
    
    await logWebhookAttempt({
      ip: clientIP,
      eventId: null,
      eventType: null,
      success: false,
      error: `Signature verification failed: ${message} (attempt ${failCount})`,
      signatureValid: false,
      timestampValid: preCheck.timestampResult?.valid || false,
      processingTimeMs: Date.now() - startTime,
    });
    
    if (blocked) {
      console.warn(`[Stripe Webhook] IP ${clientIP} blocked after repeated failures`);
    }
    
    return NextResponse.json(
      { error: 'Assinatura do webhook invalida.' },
      { status: 400 }
    );
  }

  // ================================================================
  // 6. ATOMIC IDEMPOTENCY CHECK (Race-condition safe via INSERT conflict)
  // ================================================================
  const idempotencyCheck = await checkEventIdempotencyAtomic(event.id, clientIP, event.type);
  if (idempotencyCheck.unavailable) {
    console.error('[Stripe Webhook] Idempotency unavailable — failing closed for retry:', event.id);
    return NextResponse.json(
      { error: 'Idempotency check unavailable' },
      { status: 500 },
    );
  }
  if (!idempotencyCheck.isNew) {
    console.log(`[Stripe Webhook] Duplicate event ignored: ${event.id}`);
    // Note: logWebhookAttempt not needed here - atomic insert already logged
    return NextResponse.json({ received: true, duplicate: true });
  }

  // ================================================================
  // 7. PROCESS EVENT — each branch sets outcome explicitly
  // ================================================================
  const now = Date.now();
  let outcome: WebhookOutcome = 'ignored';
  let outcomeReason = '';

  try {
    switch (event.type) {
      // --------------------------------------------------------
      // CHECKOUT COMPLETED - User completed payment
      // --------------------------------------------------------
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        if (session.mode === 'subscription' && session.subscription) {
          // Fetch subscription details
          const subscriptionResponse = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          const { periodStart, periodEnd } = getPeriodBounds(subscriptionResponse as Stripe.Subscription);
          const subId = subscriptionResponse.id;
          const subItems = subscriptionResponse.items;
          const cancelAtEnd = subscriptionResponse.cancel_at_period_end;
          const customerId = getStripeId(session.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);
          const userId = session.metadata?.user_id ?? subscriptionResponse.metadata?.user_id ?? null;

          if (!userId) {
            outcome = 'permanent_failure';
            outcomeReason = `Unable to resolve user_id for checkout.session.completed (session ${session.id})`;
            console.error(`[Stripe Webhook] ${outcomeReason}`);
            break;
          }

          if (!customerId) {
            outcome = 'permanent_failure';
            outcomeReason = `Missing customer id for checkout.session.completed (session ${session.id})`;
            console.error(`[Stripe Webhook] ${outcomeReason}`);
            break;
          }

          const tier = getSubscriptionTier(subItems.data[0]?.price?.id || null);

          if (tier === 'free') {
            outcome = 'transient_failure';
            outcomeReason = `Unmapped paid price in checkout.session.completed (session ${session.id}, sub ${subId})`;
            console.error(`[Stripe Webhook] ${outcomeReason}`);
            break;
          }
          
          // Paid tier already validated above (unknown paid prices trigger transient failure).
          const isPro = true;

          // Update profile to premium
          const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({
              is_pro: isPro,
              subscription_status: 'active',
              subscription_tier: tier,
              subscription_period_end: periodEnd,
              stripe_customer_id: customerId,
              updated_at: now,
            })
            .eq('id', userId);

          if (profileError) {
            outcome = 'transient_failure';
            outcomeReason = `Profile update failed for user ${userId}: ${profileError.message}`;
            console.error(`[Stripe Webhook] ${outcomeReason}`);
            break;
          }

          // Create subscription record
          const { error: subError } = await supabaseAdmin
            .from('subscriptions')
            .upsert({
              id: buildSubscriptionRowId(subId),
              user_id: userId,
              stripe_subscription_id: subId,
              stripe_customer_id: customerId,
              price_id: subItems.data[0]?.price?.id || null,
              status: 'active',
              current_period_start: periodStart,
              current_period_end: periodEnd,
              cancel_at_period_end: cancelAtEnd,
              created_at: now,
              updated_at: now,
            }, {
              onConflict: 'stripe_subscription_id',
            });

          if (subError) {
            outcome = 'transient_failure';
            outcomeReason = `Subscription upsert failed for user ${userId}: ${subError.message}`;
            console.error(`[Stripe Webhook] ${outcomeReason}`);
            break;
          }

          outcome = 'applied';
          outcomeReason = `User ${userId} upgraded to ${tier}`;
          console.log(`[Stripe Webhook] ${outcomeReason}`);
        } else {
          // Non-subscription checkout (e.g. one-time payment) — not relevant
          outcome = 'ignored';
          outcomeReason = `checkout.session.completed with mode=${session.mode}, not a subscription`;
        }
        break;
      }

      // --------------------------------------------------------
      // SUBSCRIPTION UPDATED - Sync plan/status/period with Stripe source of truth
      // --------------------------------------------------------
      case 'customer.subscription.updated': {
        const subUpdated = event.data.object as Stripe.Subscription;
        const resolvedIdentity = await resolveBillingIdentity({
          customerId: getStripeId(subUpdated.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null),
          metadataUserId: subUpdated.metadata?.user_id ?? null,
          subscriptionId: subUpdated.id,
        });

        if (!resolvedIdentity.userId || !resolvedIdentity.customerId) {
          outcome = 'permanent_failure';
          outcomeReason = `Unable to resolve identity for customer.subscription.updated (sub ${subUpdated.id})`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        const tier = getSubscriptionTier(subUpdated.items.data[0]?.price?.id || null);
        if (
          tier === 'free' &&
          (subUpdated.status === 'active' || subUpdated.status === 'past_due')
        ) {
          outcome = 'transient_failure';
          outcomeReason = `Unmapped paid price in customer.subscription.updated (sub ${subUpdated.id})`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }
        const { periodStart: updatedPeriodStart, periodEnd: updatedPeriodEnd } = getPeriodBounds(subUpdated);
        const updatedPriceId = subUpdated.items.data[0]?.price?.id || null;
        const isPaidTier = tier === 'pro' || tier === 'enterprise';
        const isRenewing = !subUpdated.cancel_at_period_end;
        const isPro = isPaidTier && isRenewing && (
          subUpdated.status === 'active' ||
          (subUpdated.status === 'past_due' && updatedPeriodEnd !== null && updatedPeriodEnd > now)
        );

        const profileUpdatePayload: {
          is_pro: boolean;
          subscription_status: string;
          subscription_tier: string;
          stripe_customer_id: string;
          updated_at: number;
          subscription_period_end?: number;
        } = {
          is_pro: isPro,
          subscription_status: subUpdated.status,
          subscription_tier: isPro
            ? tier
            : 'free',
          stripe_customer_id: resolvedIdentity.customerId,
          updated_at: now,
        };

        if (updatedPeriodEnd !== null) {
          profileUpdatePayload.subscription_period_end = updatedPeriodEnd;
        }

        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update(profileUpdatePayload)
          .eq('id', resolvedIdentity.userId);

        if (profileError) {
          outcome = 'transient_failure';
          outcomeReason = `Profile update failed for user ${resolvedIdentity.userId}: ${profileError.message}`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        const subscriptionPayload: {
          id: string;
          user_id: string;
          stripe_subscription_id: string;
          stripe_customer_id: string;
          status: string;
          price_id: string | null;
          cancel_at_period_end: boolean;
          created_at: number;
          updated_at: number;
          current_period_start?: number;
          current_period_end?: number;
        } = {
          id: buildSubscriptionRowId(subUpdated.id),
          user_id: resolvedIdentity.userId,
          stripe_subscription_id: subUpdated.id,
          stripe_customer_id: resolvedIdentity.customerId,
          status: subUpdated.status,
          price_id: updatedPriceId,
          cancel_at_period_end: subUpdated.cancel_at_period_end,
          created_at: now,
          updated_at: now,
        };

        if (updatedPeriodStart !== null) {
          subscriptionPayload.current_period_start = updatedPeriodStart;
        }

        if (updatedPeriodEnd !== null) {
          subscriptionPayload.current_period_end = updatedPeriodEnd;
        }

        const { error: subError } = await supabaseAdmin
          .from('subscriptions')
          .upsert(subscriptionPayload, {
            onConflict: 'stripe_subscription_id',
          });

        if (subError) {
          outcome = 'transient_failure';
          outcomeReason = `Subscription upsert failed for sub ${subUpdated.id}: ${subError.message}`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        outcome = 'applied';
        outcomeReason = `Subscription ${subUpdated.id} updated to ${subUpdated.status}`;
        console.log(`[Stripe Webhook] ${outcomeReason}`);
        break;
      }

      // --------------------------------------------------------
      // SUBSCRIPTION DELETED - Canceled or expired
      // --------------------------------------------------------
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const resolvedIdentity = await resolveBillingIdentity({
          customerId: getStripeId(subscription.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null),
          metadataUserId: subscription.metadata?.user_id ?? null,
          subscriptionId: subscription.id,
        });

        if (!resolvedIdentity.userId || !resolvedIdentity.customerId) {
          outcome = 'permanent_failure';
          outcomeReason = `Unable to resolve identity for customer.subscription.deleted (sub ${subscription.id})`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        // Downgrade to free
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update({
            is_pro: false,
            subscription_status: 'canceled',
            subscription_tier: 'free',
            stripe_customer_id: resolvedIdentity.customerId,
            updated_at: now,
          })
          .eq('id', resolvedIdentity.userId);

        if (profileError) {
          outcome = 'transient_failure';
          outcomeReason = `Profile downgrade failed for user ${resolvedIdentity.userId}: ${profileError.message}`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        const canceledPeriod = toUnixMs(subscription.ended_at);
        const { error: subError } = await supabaseAdmin
          .from('subscriptions')
          .upsert({
            id: buildSubscriptionRowId(subscription.id),
            user_id: resolvedIdentity.userId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: resolvedIdentity.customerId,
            status: 'canceled',
            cancel_at_period_end: true,
            current_period_end: canceledPeriod,
            created_at: now,
            updated_at: now,
          }, {
            onConflict: 'stripe_subscription_id',
          });

        if (subError) {
          outcome = 'transient_failure';
          outcomeReason = `Subscription cancel upsert failed for sub ${subscription.id}: ${subError.message}`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        outcome = 'applied';
        outcomeReason = `User ${resolvedIdentity.userId} downgraded to free`;
        console.log(`[Stripe Webhook] ${outcomeReason}`);
        break;
      }

      // --------------------------------------------------------
      // INVOICE PAID - Renewal/payment confirmed
      // --------------------------------------------------------
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const paidSubscriptionId = getInvoiceSubscriptionId(invoice);
        if (!paidSubscriptionId) {
          // Legitimately not subscription-related (e.g. one-time invoice)
          outcome = 'ignored';
          outcomeReason = 'invoice.paid without subscription id';
          console.warn(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        const resolvedIdentity = await resolveBillingIdentity({
          customerId: getStripeId(invoice.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null),
          metadataUserId: null,
          subscriptionId: paidSubscriptionId,
        });

        if (!resolvedIdentity.userId || !resolvedIdentity.customerId) {
          outcome = 'permanent_failure';
          outcomeReason = `Unable to resolve identity for invoice.paid (sub ${paidSubscriptionId})`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        const paidPriceId = getInvoicePriceId(invoice);
        const { periodStart: paidPeriodStart, periodEnd: paidPeriodEnd } = getInvoicePeriodBounds(invoice);
        const tier = getSubscriptionTier(paidPriceId);
        if (tier === 'free') {
          outcome = 'transient_failure';
          outcomeReason = `Unmapped paid price in invoice.paid (sub ${paidSubscriptionId})`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }
        const isPro = tier === 'pro' || tier === 'enterprise';

        // Payment confirmed -> active subscription state
        const profileUpdatePayload: {
          is_pro: boolean;
          subscription_status: string;
          subscription_tier: string;
          stripe_customer_id: string;
          updated_at: number;
          subscription_period_end?: number;
        } = {
          is_pro: isPro,
          subscription_status: 'active',
          subscription_tier: tier,
          stripe_customer_id: resolvedIdentity.customerId,
          updated_at: now,
        };

        if (paidPeriodEnd !== null) {
          profileUpdatePayload.subscription_period_end = paidPeriodEnd;
        }

        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update(profileUpdatePayload)
          .eq('id', resolvedIdentity.userId);

        if (profileError) {
          outcome = 'transient_failure';
          outcomeReason = `Invoice paid profile update failed for user ${resolvedIdentity.userId}: ${profileError.message}`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        const subscriptionPayload: {
          id: string;
          user_id: string;
          stripe_subscription_id: string;
          stripe_customer_id: string;
          status: string;
          price_id: string | null;
          created_at: number;
          updated_at: number;
          current_period_start?: number;
          current_period_end?: number;
        } = {
          id: buildSubscriptionRowId(paidSubscriptionId),
          user_id: resolvedIdentity.userId,
          stripe_subscription_id: paidSubscriptionId,
          stripe_customer_id: resolvedIdentity.customerId,
          status: 'active',
          price_id: paidPriceId,
          created_at: now,
          updated_at: now,
        };

        if (paidPeriodStart !== null) {
          subscriptionPayload.current_period_start = paidPeriodStart;
        }

        if (paidPeriodEnd !== null) {
          subscriptionPayload.current_period_end = paidPeriodEnd;
        }

        const { error: subError } = await supabaseAdmin
          .from('subscriptions')
          .upsert(subscriptionPayload, {
            onConflict: 'stripe_subscription_id',
          });

        if (subError) {
          outcome = 'transient_failure';
          outcomeReason = `Invoice paid subscription upsert failed for sub ${paidSubscriptionId}: ${subError.message}`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        await emitPlanRenewalNotification({
          userId: resolvedIdentity.userId,
          type: 'plan_renewal',
          title: invoice.billing_reason === 'subscription_cycle'
            ? 'Plano renovado com sucesso'
            : 'Pagamento do plano confirmado',
          body: paidPeriodEnd
            ? `Seu plano ${tier} está ativo até ${new Date(paidPeriodEnd).toLocaleDateString('pt-BR')}.`
            : `Seu pagamento do plano ${tier} foi confirmado com sucesso.`,
          importance: 'high',
          ctaLabel: 'Ver assinatura',
          ctaUrl: '/dashboard/settings',
          metadata: {
            invoiceId: invoice.id,
            subscriptionId: paidSubscriptionId,
            billingReason: invoice.billing_reason ?? null,
            tier,
          },
          dedupeKey: `plan-renewal:${invoice.id}`,
        }).catch((notificationError) => {
          console.error('[Stripe Webhook] Notification error:', notificationError);
        });

        outcome = 'applied';
        outcomeReason = `Invoice paid processed for user ${resolvedIdentity.userId}`;
        console.log(`[Stripe Webhook] ${outcomeReason}`);
        break;
      }

      // --------------------------------------------------------
      // PAYMENT FAILED - Mark as past_due
      // --------------------------------------------------------
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const failedSubscriptionId = getInvoiceSubscriptionId(invoice);
        const resolvedIdentity = await resolveBillingIdentity({
          customerId: getStripeId(invoice.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null),
          metadataUserId: null,
          subscriptionId: failedSubscriptionId,
        });

        if (!resolvedIdentity.userId || !resolvedIdentity.customerId) {
          outcome = 'permanent_failure';
          outcomeReason = `Unable to resolve identity for invoice.payment_failed (sub ${failedSubscriptionId})`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        const { periodEnd: failedPeriodEnd } = getInvoicePeriodBounds(invoice);
        const failedPriceId = getInvoicePriceId(invoice);

        // Mark as past_due but keep pro access for grace period
        const profileUpdatePayload: {
          subscription_status: string;
          stripe_customer_id: string;
          updated_at: number;
          subscription_period_end?: number;
        } = {
          subscription_status: 'past_due',
          stripe_customer_id: resolvedIdentity.customerId,
          updated_at: now,
        };

        if (failedPeriodEnd !== null) {
          profileUpdatePayload.subscription_period_end = failedPeriodEnd;
        }

        const { error } = await supabaseAdmin
          .from('profiles')
          .update(profileUpdatePayload)
          .eq('id', resolvedIdentity.userId);

        if (error) {
          outcome = 'transient_failure';
          outcomeReason = `Past due profile update failed for user ${resolvedIdentity.userId}: ${error.message}`;
          console.error(`[Stripe Webhook] ${outcomeReason}`);
          break;
        }

        if (failedSubscriptionId) {
          const subscriptionPayload: {
            id: string;
            user_id: string;
            stripe_subscription_id: string;
            stripe_customer_id: string;
            status: string;
            price_id: string | null;
            created_at: number;
            updated_at: number;
            current_period_end?: number;
          } = {
            id: buildSubscriptionRowId(failedSubscriptionId),
            user_id: resolvedIdentity.userId,
            stripe_subscription_id: failedSubscriptionId,
            stripe_customer_id: resolvedIdentity.customerId,
            status: 'past_due',
            price_id: failedPriceId,
            created_at: now,
            updated_at: now,
          };

          if (failedPeriodEnd !== null) {
            subscriptionPayload.current_period_end = failedPeriodEnd;
          }

          const { error: subError } = await supabaseAdmin
            .from('subscriptions')
            .upsert(subscriptionPayload, {
              onConflict: 'stripe_subscription_id',
            });

          if (subError) {
            outcome = 'transient_failure';
            outcomeReason = `Past due subscription upsert failed for sub ${failedSubscriptionId}: ${subError.message}`;
            console.error(`[Stripe Webhook] ${outcomeReason}`);
            break;
          }
        }

        outcome = 'applied';
        outcomeReason = `User ${resolvedIdentity.userId} marked as past_due`;
        console.log(`[Stripe Webhook] ${outcomeReason}`);
        break;
      }

      default:
        outcome = 'ignored';
        outcomeReason = `Unhandled event type: ${event.type}`;
        console.log(`[Stripe Webhook] ${outcomeReason}`);
    }

    // ================================================================
    // 8. FINALIZE EVENT BASED ON OUTCOME
    // ================================================================
    const processingTimeMs = Date.now() - startTime;

    await finalizeEvent(event.id, outcome, outcomeReason, processingTimeMs);

    await logWebhookAttempt({
      ip: clientIP,
      eventId: event.id,
      eventType: event.type,
      success: outcome === 'applied' || outcome === 'ignored' || outcome === 'permanent_failure',
      error: (outcome === 'transient_failure' || outcome === 'permanent_failure')
        ? outcomeReason
        : undefined,
      signatureValid: true,
      timestampValid: true,
      processingTimeMs,
    });

    // applied / ignored → 200, event is done
    if (outcome === 'applied' || outcome === 'ignored') {
      return NextResponse.json({ received: true, outcome });
    }

    // permanent_failure → 200 to stop Stripe retries (manual review needed)
    if (outcome === 'permanent_failure') {
      captureApiError(new Error(outcomeReason), {
        route: 'stripe/webhook',
        tags: { eventType: event.type, outcome: 'permanent_failure', eventId: event.id },
        extra: { outcomeReason },
      });
      return NextResponse.json({ received: true, outcome, reason: outcomeReason });
    }

    // transient_failure → 500 so Stripe retries delivery
    captureWarning(`Webhook transient failure: ${outcomeReason}`, {
      route: 'stripe/webhook',
      tags: { eventType: event.type, outcome: 'transient_failure', eventId: event.id },
      extra: { outcomeReason },
    });
    return NextResponse.json(
      { error: 'Transient processing failure', outcome, reason: outcomeReason },
      { status: 500 }
    );

  } catch (error) {
    // Unhandled exception → transient failure (Stripe retries)
    const processingTimeMs = Date.now() - startTime;

    console.error('[Stripe Webhook] Unhandled processing error:', error);
    captureApiError(error, {
      route: 'stripe/webhook',
      tags: { eventType: event.type, eventId: event.id },
    });

    await finalizeEvent(event.id, 'transient_failure',
      error instanceof Error ? error.message : 'Unknown processing error',
      processingTimeMs,
    );

    await logWebhookAttempt({
      ip: clientIP,
      eventId: event.id,
      eventType: event.type,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown processing error',
      signatureValid: true,
      timestampValid: true,
      processingTimeMs,
    });
    
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
