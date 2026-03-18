import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin, isAdminSuccess } from '@/lib/auth/admin-guard';

// Service role client (bypasses RLS)
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  // 1. Admin guard
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  // 2. Parse body
  let body: { userId?: string; grantPro?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const { userId, grantPro } = body;
  if (!userId || typeof grantPro !== 'boolean') {
    return NextResponse.json(
      { error: 'Campos obrigatórios: userId (string), grantPro (boolean).' },
      { status: 400 }
    );
  }

  const supabase = getAdmin();

  try {
    // 3. Update admin_override_pro (does NOT touch is_pro or subscription_status)
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        admin_override_pro: grantPro,
        updated_at: Date.now(),
      })
      .eq('id', userId)
      .select('id, is_pro, admin_override_pro, subscription_status')
      .single();

    if (updateError) {
      console.error('[Admin Toggle Pro] Update error:', updateError);
      return NextResponse.json(
        { error: 'Erro ao atualizar perfil.' },
        { status: 500 }
      );
    }

    // 4. Audit log
    const { error: auditError } = await supabase.from('admin_actions').insert({
      admin_user_id: authResult.userId,
      action: grantPro ? 'grant_pro' : 'revoke_pro',
      target_user_id: userId,
      details: {
        admin_email: authResult.email,
        previous_admin_override: !grantPro,
      },
    });

    if (auditError) {
      // Non-blocking: log but don't fail the request
      console.error('[Admin Toggle Pro] Audit log error:', auditError);
    }

    console.log(
      `[Admin] ${authResult.email} ${grantPro ? 'granted' : 'revoked'} Pro for user ${userId}`
    );

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
    });
  } catch (err) {
    console.error('[Admin Toggle Pro] Error:', err);
    return NextResponse.json(
      { error: 'Erro interno ao processar ação.' },
      { status: 500 }
    );
  }
}
