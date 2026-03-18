import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin, isAdminSuccess } from '@/lib/auth/admin-guard';

// Service role client (bypasses RLS, allows auth.admin API)
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  // 1. Admin guard
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const search = searchParams.get('search')?.trim().toLowerCase() ?? '';

  const supabase = getAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    // 2. Get profiles with pagination
    const { data: profiles, count: totalProfiles } = await supabase
      .from('profiles')
      .select('id, is_pro, admin_override_pro, subscription_status, subscription_tier, created_at', {
        count: 'exact',
      })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!profiles) {
      return NextResponse.json({ users: [], total: 0, page, limit });
    }

    // 3. Fetch user emails via auth admin API
    //    We get all users and build a map. For large user bases this should be paginated too.
    const { data: authData } = await supabase.auth.admin.listUsers({
      page,
      perPage: limit,
    });

    const emailMap = new Map<string, string>();
    for (const u of authData?.users ?? []) {
      emailMap.set(u.id, u.email ?? '');
    }

    // If auth pagination doesn't match profiles (e.g. different page boundaries),
    // fetch specific users we need
    const missingIds = profiles.filter((p) => !emailMap.has(p.id)).map((p) => p.id);
    if (missingIds.length > 0) {
      // Fetch individually for missing ones (fallback)
      for (const id of missingIds) {
        const { data: userData } = await supabase.auth.admin.getUserById(id);
        if (userData?.user?.email) {
          emailMap.set(id, userData.user.email);
        }
      }
    }

    // 4. Merge and filter by search
    let users = profiles.map((p) => ({
      id: p.id,
      email: emailMap.get(p.id) ?? '',
      isPro: p.is_pro || false,
      adminOverridePro: p.admin_override_pro || false,
      subscriptionStatus: p.subscription_status ?? 'free',
      subscriptionTier: p.subscription_tier ?? 'free',
      createdAt: p.created_at,
    }));

    // Server-side search filtering by email
    if (search) {
      users = users.filter((u) => u.email.toLowerCase().includes(search));
    }

    return NextResponse.json({
      users,
      total: totalProfiles ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('[Admin Users] Error:', err);
    return NextResponse.json(
      { error: 'Erro ao carregar usuários.' },
      { status: 500 }
    );
  }
}
