import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTierLimits } from '@/lib/billing/tier-limits';

/**
 * GET /api/user/tier-limits
 * Returns the current user's tier and limits
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const limits = await getUserTierLimits(user.id);

    return NextResponse.json(limits);

  } catch (error) {
    console.error('[Tier Limits API] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar limites' },
      { status: 500 }
    );
  }
}
