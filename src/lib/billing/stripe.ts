import Stripe from 'stripe';

// ============================================================================
// STRIPE CLIENT (Server-side only)
// ============================================================================

let stripeInstance: Stripe | null = null;

/**
 * Get Stripe client instance (lazy initialization)
 * This allows the build to succeed without STRIPE_SECRET_KEY set
 */
export function getStripeClient(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables');
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover',
      typescript: true,
    });
  }
  return stripeInstance;
}

// Backwards compatible export (will throw at runtime if not configured)
export const stripe = {
  get customers() { return getStripeClient().customers; },
  get subscriptions() { return getStripeClient().subscriptions; },
  get invoices() { return getStripeClient().invoices; },
  get refunds() { return getStripeClient().refunds; },
  get paymentMethods() { return getStripeClient().paymentMethods; },
  get checkout() { return getStripeClient().checkout; },
  get billingPortal() { return getStripeClient().billingPortal; },
  get webhooks() { return getStripeClient().webhooks; },
};

// ============================================================================
// PRICE CONFIGURATION
// ============================================================================

// Price IDs configured in environment variables.
export const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || '';
export const ENTERPRISE_PRICE_ID = process.env.STRIPE_ENTERPRISE_PRICE_ID || '';

// Build mapping from env so webhook tier detection matches configured prices.
export const PRICE_TO_TIER: Record<string, 'free' | 'pro' | 'enterprise'> = {
  ...(PRO_PRICE_ID ? { [PRO_PRICE_ID]: 'pro' as const } : {}),
  ...(ENTERPRISE_PRICE_ID ? { [ENTERPRISE_PRICE_ID]: 'enterprise' as const } : {}),
};

/**
 * Get subscription tier from Price ID
 * SECURITY: Unknown prices default to 'free' to prevent tier escalation attacks
 */
export function getSubscriptionTier(priceId: string | null): 'free' | 'pro' | 'enterprise' {
  if (!priceId) return 'free';
  
  // Only grant tier if explicitly mapped - unknown prices are treated as free
  const tier = PRICE_TO_TIER[priceId];
  if (!tier) {
    console.warn(`[Stripe] Unknown price ID: ${priceId} - treating as free`);
    return 'free';
  }
  return tier;
}

// ============================================================================
// CUSTOMER MANAGEMENT
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { hasProAccess } from '@/lib/billing/pro-access';

/**
 * Get or create a Stripe customer for a user
 * Returns the Stripe customer ID
 */
export async function getOrCreateCustomer(
  userId: string,
  email: string,
  name?: string
): Promise<string> {
  const supabase = await createClient();

  // Check if user already has a Stripe customer ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: {
      supabase_user_id: userId,
    },
  });

  // Save customer ID to profile
  await supabase
    .from('profiles')
    .update({
      stripe_customer_id: customer.id,
      updated_at: Date.now(),
    })
    .eq('id', userId);

  return customer.id;
}

// ============================================================================
// SUBSCRIPTION HELPERS
// ============================================================================

/**
 * Check if user has an active subscription
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro, subscription_status, subscription_period_end, admin_override_pro')
    .eq('id', userId)
    .single();

  return hasProAccess(profile);
}

/**
 * Get full subscription status for a user
 */
export async function getSubscriptionStatus(userId: string): Promise<{
  isPro: boolean;
  status: string;
  tier: string;
  periodEnd: number | null;
}> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro, subscription_status, subscription_tier, subscription_period_end, admin_override_pro')
    .eq('id', userId)
    .single();

  if (!profile) {
    return {
      isPro: false,
      status: 'free',
      tier: 'free',
      periodEnd: null,
    };
  }

  return {
    isPro: hasProAccess(profile),
    status: profile.subscription_status || 'free',
    tier: profile.subscription_tier || 'free',
    periodEnd: profile.subscription_period_end || null,
  };
}

// ============================================================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================================================

/**
 * Verify Stripe webhook signature
 * Returns the verified event or throws an error
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
