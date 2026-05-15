import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminSuccess } from '@/lib/auth/admin-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getAdminStripeCustomerUrl } from '@/lib/admin/service';

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
  deleted_at?: number | null;
};

type AdminAuthUser = {
  email?: string;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
};

function parseDateMs(value: string | null, endOfDay = false): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date.getTime();
}

async function countUserRows(table: string, column: string, userIds: string[]) {
  const supabase = getSupabaseAdmin();
  const out = new Map<string, number>();
  await Promise.all(userIds.map(async (userId) => {
    const { count } = await supabase
      .from(table)
      .select(column, { count: 'exact', head: true })
      .eq(column, userId);
    out.set(userId, count ?? 0);
  }));
  return out;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const search = searchParams.get('search')?.trim().toLowerCase() ?? '';
  const plan = searchParams.get('plan')?.trim().toLowerCase() ?? 'all';
  const fromDate = parseDateMs(searchParams.get('from'));
  const toDate = parseDateMs(searchParams.get('to'), true);

  const supabase = getSupabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let emailMap = new Map<string, string>();
  let searchedUserIds: string[] | null = null;

  if (search) {
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const matched = (authData?.users ?? []).filter((user) =>
      user.email?.toLowerCase().includes(search)
    );
    searchedUserIds = matched.map((user) => user.id);
    emailMap = new Map(matched.map((user) => [user.id, user.email ?? '']));

    if (searchedUserIds.length === 0) {
      return NextResponse.json({ users: [], total: 0, page, limit });
    }
  }

  let query = supabase
    .from('profiles')
    .select(
      'id, is_pro, admin_override_pro, subscription_status, subscription_tier, subscription_period_end, stripe_customer_id, created_at, updated_at, deleted_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (searchedUserIds) query = query.in('id', searchedUserIds);
  if (plan !== 'all') {
    if (plan === 'pro') query = query.or('is_pro.eq.true,admin_override_pro.eq.true');
    else query = query.eq('subscription_status', plan);
  }
  if (fromDate) query = query.gte('created_at', fromDate);
  if (toDate) query = query.lte('created_at', toDate);

  const { data: profiles, count: totalProfiles, error } = await query.range(from, to);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (profiles ?? []) as ProfileRow[];
  const userIds = rows.map((profile) => profile.id);

  if (!search && userIds.length > 0) {
    const { data: authData } = await supabase.auth.admin.listUsers({ page, perPage: limit });
    emailMap = new Map((authData?.users ?? []).map((user) => [user.id, user.email ?? '']));

    const missingIds = userIds.filter((id) => !emailMap.has(id));
    await Promise.all(missingIds.map(async (id) => {
      const { data } = await supabase.auth.admin.getUserById(id);
      if (data.user?.email) emailMap.set(id, data.user.email);
    }));
  }

  const [deckCounts, runCounts, reviewCounts] = await Promise.all([
    countUserRows('decks', 'user_id', userIds),
    countUserRows('runs', 'user_id', userIds),
    countUserRows('card_reviews', 'user_id', userIds),
  ]);

  const users = await Promise.all(rows.map(async (profile) => {
    const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
    const user = authUser.user as AdminAuthUser | null;
    return {
      id: profile.id,
      email: emailMap.get(profile.id) ?? user?.email ?? '',
      isPro: profile.is_pro || profile.admin_override_pro,
      adminOverridePro: profile.admin_override_pro,
      subscriptionStatus: profile.subscription_status ?? 'free',
      subscriptionTier: profile.subscription_tier ?? 'free',
      subscriptionPeriodEnd: profile.subscription_period_end,
      stripeCustomerId: profile.stripe_customer_id,
      stripeCustomerUrl: getAdminStripeCustomerUrl(profile.stripe_customer_id),
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
      deletedAt: profile.deleted_at ?? null,
      lastSignInAt: user?.last_sign_in_at ?? null,
      bannedUntil: user?.banned_until ?? null,
      counts: {
        decks: deckCounts.get(profile.id) ?? 0,
        runs: runCounts.get(profile.id) ?? 0,
        reviews: reviewCounts.get(profile.id) ?? 0,
      },
    };
  }));

  return NextResponse.json({
    users,
    total: totalProfiles ?? 0,
    page,
    limit,
  });
}
