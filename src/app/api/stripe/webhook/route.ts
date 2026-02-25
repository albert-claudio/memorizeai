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
  markEventProcessed,
} from '@/lib/security/webhook-security';

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
    console.error('[Stripe Webhook] Timestamp verification failed:', preCheck.timestampResult.reason);
    await recordFailedAttempt(clientIP);
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
      { error: `Signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  // ================================================================
  // 6. ATOMIC IDEMPOTENCY CHECK (Race-condition safe via INSERT conflict)
  // ================================================================
  const idempotencyCheck = await checkEventIdempotencyAtomic(event.id, clientIP, event.type);
  if (!idempotencyCheck.isNew) {
    console.log(`[Stripe Webhook] Duplicate event ignored: ${event.id}`);
    // Note: logWebhookAttempt not needed here - atomic insert already logged
    return NextResponse.json({ received: true, duplicate: true });
  }

  // ================================================================
  // 7. PROCESS EVENT
  // ================================================================
  const now = Date.now();

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
            console.error('[Stripe Webhook] Unable to resolve user_id for checkout.session.completed');
            break;
          }

          if (!customerId) {
            console.error('[Stripe Webhook] Missing customer id for checkout.session.completed');
            break;
          }

          const tier = getSubscriptionTier(subItems.data[0]?.price?.id || null);
          
          // SECURITY: is_pro must be based on tier, not just subscription existence
          // Unknown/unmapped prices result in 'free' tier, so is_pro = false
          const isPro = tier === 'pro' || tier === 'enterprise';

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
            console.error('[Stripe Webhook] Profile update error:', profileError);
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
            console.error('[Stripe Webhook] Subscription insert error:', subError);
          }

          console.log(`[Stripe Webhook] User ${userId} upgraded to ${tier}`);
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
          console.error('[Stripe Webhook] Unable to resolve identity for customer.subscription.updated:', subUpdated.id);
          break;
        }

        const tier = getSubscriptionTier(subUpdated.items.data[0]?.price?.id || null);
        const { periodStart: updatedPeriodStart, periodEnd: updatedPeriodEnd } = getPeriodBounds(subUpdated);
        const updatedPriceId = subUpdated.items.data[0]?.price?.id || null;
        const isPaidTier = tier === 'pro' || tier === 'enterprise';
        const isPro = isPaidTier && (
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
          subscription_tier: isPaidTier && (subUpdated.status === 'active' || subUpdated.status === 'past_due')
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
          console.error('[Stripe Webhook] Profile update error:', profileError);
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
          console.error('[Stripe Webhook] Subscription upsert error:', subError);
        }

        console.log(`[Stripe Webhook] Subscription ${subUpdated.id} updated to ${subUpdated.status}`);
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
          console.error('[Stripe Webhook] Unable to resolve identity for customer.subscription.deleted:', subscription.id);
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
          console.error('[Stripe Webhook] Profile downgrade error:', profileError);
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
          })

        if (subError) {
          console.error('[Stripe Webhook] Subscription cancel upsert error:', subError);
        }

        console.log(`[Stripe Webhook] User ${resolvedIdentity.userId} downgraded to free`);
        break;
      }

      // --------------------------------------------------------
      // INVOICE PAID - Renewal/payment confirmed
      // --------------------------------------------------------
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const paidSubscriptionId = getInvoiceSubscriptionId(invoice);
        if (!paidSubscriptionId) {
          console.warn('[Stripe Webhook] invoice.paid without subscription id, ignoring');
          break;
        }

        const resolvedIdentity = await resolveBillingIdentity({
          customerId: getStripeId(invoice.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null),
          metadataUserId: null,
          subscriptionId: paidSubscriptionId,
        });

        if (!resolvedIdentity.userId || !resolvedIdentity.customerId) {
          console.error('[Stripe Webhook] Unable to resolve identity for invoice.paid:', paidSubscriptionId);
          break;
        }

        const paidPriceId = getInvoicePriceId(invoice);
        const { periodStart: paidPeriodStart, periodEnd: paidPeriodEnd } = getInvoicePeriodBounds(invoice);
        const tier = getSubscriptionTier(paidPriceId);
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
          console.error('[Stripe Webhook] Invoice paid profile update error:', profileError);
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
          console.error('[Stripe Webhook] Invoice paid subscription upsert error:', subError);
        }

        console.log(`[Stripe Webhook] Invoice paid processed for user ${resolvedIdentity.userId}`);
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
          console.error('[Stripe Webhook] Unable to resolve identity for invoice.payment_failed:', failedSubscriptionId);
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
          console.error('[Stripe Webhook] Past due update error:', error);
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
            console.error('[Stripe Webhook] Past due subscription upsert error:', subError);
          }
        }

        console.log(`[Stripe Webhook] User ${resolvedIdentity.userId} marked as past_due`);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    // ================================================================
    // 8. LOG SUCCESS AND ACKNOWLEDGE WEBHOOK
    // ================================================================
    await logWebhookAttempt({
      ip: clientIP,
      eventId: event.id,
      eventType: event.type,
      success: true,
      signatureValid: true,
      timestampValid: true,
      processingTimeMs: Date.now() - startTime,
    });

    // Mark event as successfully processed (prevents future duplicates)
    await markEventProcessed(event.id, Date.now() - startTime);
    
    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('[Stripe Webhook] Processing error:', error);
    
    await logWebhookAttempt({
      ip: clientIP,
      eventId: event.id,
      eventType: event.type,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown processing error',
      signatureValid: true,
      timestampValid: true,
      processingTimeMs: Date.now() - startTime,
    });
    
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
