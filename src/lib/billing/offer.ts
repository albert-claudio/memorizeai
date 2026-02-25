import type Stripe from 'stripe';
import { getStripeClient, PRO_PRICE_ID } from '@/lib/billing/stripe';

const OFFER_CACHE_TTL_MS = 5 * 60 * 1000;

interface OfferCache {
  expiresAt: number;
  value: PublicProOffer;
}

let offerCache: OfferCache | null = null;

export interface PublicProOffer {
  priceId: string;
  formattedPrice: string;
  periodLabel: string;
  currency: string;
  unitAmount: number | null;
  interval: Stripe.Price.Recurring.Interval | null;
  intervalCount: number | null;
  allowPromotionCodes: boolean;
}

function formatCurrency(unitAmount: number | null, currency: string): string {
  if (unitAmount === null) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(unitAmount / 100);
}

function formatPeriodLabel(
  interval: Stripe.Price.Recurring.Interval | null,
  intervalCount: number | null
): string {
  if (!interval) return '';

  const count = intervalCount ?? 1;
  if (count === 1) {
    if (interval === 'day') return '/dia';
    if (interval === 'week') return '/semana';
    if (interval === 'month') return '/mes';
    if (interval === 'year') return '/ano';
    return '';
  }

  if (interval === 'day') return `/${count} dias`;
  if (interval === 'week') return `/${count} semanas`;
  if (interval === 'month') return `/${count} meses`;
  if (interval === 'year') return `/${count} anos`;
  return '';
}

export async function getPublicProOffer(forceRefresh = false): Promise<PublicProOffer> {
  const now = Date.now();

  if (!forceRefresh && offerCache && offerCache.expiresAt > now) {
    return offerCache.value;
  }

  if (!PRO_PRICE_ID) {
    throw new Error('STRIPE_PRO_PRICE_ID is not configured');
  }

  const stripe = getStripeClient();
  const price = await stripe.prices.retrieve(PRO_PRICE_ID);

  const interval = price.recurring?.interval ?? null;
  const intervalCount = price.recurring?.interval_count ?? null;
  const unitAmount = price.unit_amount ?? null;
  const currency = (price.currency || 'BRL').toUpperCase();

  const offer: PublicProOffer = {
    priceId: price.id,
    formattedPrice: formatCurrency(unitAmount, currency),
    periodLabel: formatPeriodLabel(interval, intervalCount),
    currency,
    unitAmount,
    interval,
    intervalCount,
    allowPromotionCodes: true,
  };

  offerCache = {
    value: offer,
    expiresAt: now + OFFER_CACHE_TTL_MS,
  };

  return offer;
}
