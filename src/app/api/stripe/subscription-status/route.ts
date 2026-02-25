import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasProAccess } from '@/lib/billing/pro-access';

export async function GET() {
  try {
    // ================================================================
    // 1. AUTHENTICATE USER
    // ================================================================
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    // ================================================================
    // 2. GET SUBSCRIPTION STATUS FROM PROFILE
    // ================================================================
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, subscription_status, subscription_tier, subscription_period_end')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({
        isPro: false,
        status: 'free',
        tier: 'free',
        periodEnd: null,
        periodStart: null,
        cancelAtPeriodEnd: false,
        isActive: false,
      });
    }

    const { data: subscriptionRow, error: subscriptionRowError } = await supabase
      .from('subscriptions')
      .select('status, cancel_at_period_end, current_period_start, current_period_end')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionRowError) {
      console.warn('[Subscription Status] Unable to read subscriptions row:', subscriptionRowError);
    }

    const periodStart = subscriptionRow?.current_period_start ?? null;
    const periodEnd = profile.subscription_period_end
      || subscriptionRow?.current_period_end
      || null;
    const status = profile.subscription_status
      || subscriptionRow?.status
      || 'free';
    const cancelAtPeriodEnd = Boolean(subscriptionRow?.cancel_at_period_end);

    // ================================================================
    // 3. CALCULATE IF SUBSCRIPTION IS ACTIVE
    // ================================================================
    const isActive = hasProAccess(profile);

    // ================================================================
    // 4. RETURN SUBSCRIPTION STATUS
    // ================================================================
    return NextResponse.json({
      isPro: isActive,
      status,
      tier: profile.subscription_tier || 'free',
      periodStart,
      periodEnd,
      cancelAtPeriodEnd,
      isActive,
    });

  } catch (error) {
    console.error('[Subscription Status] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar status da assinatura' },
      { status: 500 }
    );
  }
}
