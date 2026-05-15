import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  grantBetaTrial,
  hashInviteCode,
  normalizeInviteCode,
  normalizeInviteEmail,
  type BetaInviteRow,
} from '@/lib/beta/invites';
import { trackServer } from '@/lib/analytics/server-tracker';

function getAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Faca login com o email convidado antes de ativar o beta.' },
      { status: 401 }
    );
  }

  const email = normalizeInviteEmail(user.email ?? '');
  if (!email) {
    return NextResponse.json(
      { error: 'Conta sem email associado.' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const code = normalizeInviteCode(String(body.code ?? ''));

  if (code.length < 6) {
    return NextResponse.json(
      { error: 'Codigo invalido.' },
      { status: 400 }
    );
  }

  const admin = getAdmin();
  const now = Date.now();

  const { data: inviteData, error: inviteError } = await admin
    .from('beta_invites')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (inviteError) {
    return NextResponse.json(
      { error: 'Erro ao buscar convite beta.' },
      { status: 500 }
    );
  }

  const invite = inviteData as BetaInviteRow | null;
  if (!invite) {
    return NextResponse.json(
      { error: 'Este email nao esta na lista do beta.' },
      { status: 403 }
    );
  }

  if (invite.status === 'redeemed') {
    return NextResponse.json(
      {
        ok: true,
        message: 'Acesso beta ja esta ativo.',
        trialEndsAt: invite.trial_ends_at,
      },
      { status: 200 }
    );
  }

  if (invite.status === 'revoked') {
    return NextResponse.json(
      { error: 'Este convite foi revogado.' },
      { status: 403 }
    );
  }

  const expectedHash = hashInviteCode(email, code);
  if (expectedHash !== invite.code_hash) {
    return NextResponse.json(
      { error: 'Codigo incorreto.' },
      { status: 400 }
    );
  }

  try {
    const result = await grantBetaTrial({
      admin,
      userId: user.id,
      email,
      inviteId: invite.id,
      nowMs: now,
    });

    trackServer('beta_invite_redeemed', user.id, {
      inviteId: invite.id,
      trialEndsAt: result.periodEnd,
    });

    return NextResponse.json({
      ok: true,
      trialEndsAt: result.periodEnd,
    });
  } catch (error) {
    console.error('[Beta Redeem] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao ativar beta.' },
      { status: 500 }
    );
  }
}
