import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminSuccess } from '@/lib/auth/admin-guard';
import { getAdminStripeCustomerUrl } from '@/lib/admin/service';
import { getStripeClient } from '@/lib/billing/stripe';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type ProfileRow = {
  id: string;
  is_pro: boolean;
  admin_override_pro: boolean;
  subscription_status: string | null;
  subscription_tier: string | null;
  subscription_period_end: number | null;
  stripe_customer_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

type AdminAuthUser = {
  email?: string;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type RouteContext = {
  params: Promise<{ userId: string }>;
};

async function safeCount(table: string, column: string, userId: string) {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from(table)
    .select(column, { count: 'exact', head: true })
    .eq(column, userId);
  return count ?? 0;
}

async function countCardsForUser(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data: decks } = await supabase.from('decks').select('id').eq('user_id', userId);
  const deckIds = ((decks ?? []) as Array<{ id: string }>).map((deck) => deck.id);
  if (deckIds.length === 0) return 0;
  const { count } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .in('deck_id', deckIds);
  return count ?? 0;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const { userId } = await context.params;
  const supabase = getSupabaseAdmin();

  const [{ data: authData }, { data: profile, error: profileError }] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase
      .from('profiles')
      .select('id, is_pro, admin_override_pro, subscription_status, subscription_tier, subscription_period_end, stripe_customer_id, created_at, updated_at, deleted_at')
      .eq('id', userId)
      .single(),
  ]);

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Usuario nao encontrado.' }, { status: 404 });
  }
  const profileRow = profile as ProfileRow;
  const authUser = authData.user as AdminAuthUser | null;

  const [
    decks,
    runs,
    sources,
    subscriptions,
    deckCount,
    cardCount,
    reviewCount,
    runCount,
  ] = await Promise.all([
    supabase
      .from('decks')
      .select('id, title, created_at, updated_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(10),
    supabase
      .from('runs')
      .select('id, objective, status, model_used, token_count, items_generated, error_message, last_error_code, created_at, updated_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('sources')
      .select('id, filename, status, progress, total_pages, error_message, created_at, updated_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, price_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    safeCount('decks', 'user_id', userId),
    countCardsForUser(userId),
    safeCount('card_reviews', 'user_id', userId),
    safeCount('runs', 'user_id', userId),
  ]);

  let payments: Array<Record<string, unknown>> = [];
  if (profileRow.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = getStripeClient();
      const invoices = await stripe.invoices.list({
        customer: profileRow.stripe_customer_id,
        limit: 10,
      });
      payments = invoices.data.map((invoice) => ({
        id: invoice.id,
        status: invoice.status,
        amountPaid: invoice.amount_paid,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        created: invoice.created,
      }));
    } catch (error) {
      console.warn('[Admin User Detail] Stripe invoices failed:', error);
    }
  }

  return NextResponse.json({
    user: {
      id: profileRow.id,
      email: authUser?.email ?? '',
      createdAt: profileRow.created_at,
      updatedAt: profileRow.updated_at,
      deletedAt: profileRow.deleted_at ?? null,
      lastSignInAt: authUser?.last_sign_in_at ?? null,
      bannedUntil: authUser?.banned_until ?? null,
      appMetadata: authUser?.app_metadata ?? {},
      userMetadata: authUser?.user_metadata ?? {},
    },
    billing: {
      isPro: profileRow.is_pro || profileRow.admin_override_pro,
      adminOverridePro: profileRow.admin_override_pro,
      status: profileRow.subscription_status ?? 'free',
      tier: profileRow.subscription_tier ?? 'free',
      periodEnd: profileRow.subscription_period_end,
      stripeCustomerId: profileRow.stripe_customer_id,
      stripeCustomerUrl: getAdminStripeCustomerUrl(profileRow.stripe_customer_id),
      subscriptions: subscriptions.data ?? [],
      payments,
    },
    usage: {
      counts: {
        decks: deckCount,
        cards: cardCount,
        reviews: reviewCount,
        runs: runCount,
      },
      decks: decks.data ?? [],
      runs: runs.data ?? [],
      sources: sources.data ?? [],
    },
  });
}
