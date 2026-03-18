import { ENTERPRISE_PRICE_ID, PRO_PRICE_ID } from '@/lib/billing/stripe';

export type CheckoutPlanKey = 'pro_monthly' | 'enterprise_monthly';
export type CheckoutPlanTier = 'pro' | 'enterprise';

export interface CheckoutPlan {
  planKey: CheckoutPlanKey;
  tier: CheckoutPlanTier;
  stripePriceId: string;
  billingCycle: 'monthly';
}

const PLAN_CATALOG: Record<CheckoutPlanKey, Omit<CheckoutPlan, 'stripePriceId'> & { stripePriceId: string }> = {
  pro_monthly: {
    planKey: 'pro_monthly',
    tier: 'pro',
    stripePriceId: PRO_PRICE_ID,
    billingCycle: 'monthly',
  },
  enterprise_monthly: {
    planKey: 'enterprise_monthly',
    tier: 'enterprise',
    stripePriceId: ENTERPRISE_PRICE_ID,
    billingCycle: 'monthly',
  },
};

export function getCheckoutPlan(planKey: string): CheckoutPlan | null {
  if (!planKey) return null;
  if (!Object.prototype.hasOwnProperty.call(PLAN_CATALOG, planKey)) return null;

  const plan = PLAN_CATALOG[planKey as CheckoutPlanKey];
  if (!plan.stripePriceId) return null;

  return {
    planKey: plan.planKey,
    tier: plan.tier,
    stripePriceId: plan.stripePriceId,
    billingCycle: plan.billingCycle,
  };
}

