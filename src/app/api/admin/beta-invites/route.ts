import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin, isAdminSuccess } from '@/lib/auth/admin-guard';
import {
  activateBetaInviteForUser,
  countActiveBetaInvites,
  generateInviteCode,
  getBetaInviteLimit,
  hashInviteCode,
  inviteExpiresAt,
  isActiveBetaInviteStatus,
  normalizeInviteEmail,
  normalizeInviteName,
  revokeBetaProAccess,
  sendBetaInviteEmail,
  type BetaInviteRow,
} from '@/lib/beta/invites';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findAuthUserByEmail(admin: ReturnType<typeof getAdmin>, email: string) {
  const target = normalizeInviteEmail(email);
  const perPage = 1000;

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Erro ao buscar usuario existente: ${error.message}`);
    }

    const user = (data.users ?? []).find((item) => normalizeInviteEmail(item.email ?? '') === target);
    if (user) return user;
    if ((data.users ?? []).length < perPage) return null;
  }

  return null;
}

function serializeInvite(row: BetaInviteRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    userId: row.user_id,
    status: row.status,
    sendCount: row.send_count,
    emailDeliveryStatus: row.email_delivery_status,
    emailDeliveryError: row.email_delivery_error,
    expiresAt: row.expires_at,
    sentAt: row.sent_at,
    redeemedAt: row.redeemed_at,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const admin = getAdmin();
  const { data, error } = await admin
    .from('beta_invites')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: 'Erro ao carregar convites beta.' },
      { status: 500 }
    );
  }

  const invites = ((data ?? []) as BetaInviteRow[]).map(serializeInvite);
  const activeCount = invites.filter((invite) =>
    ['pending', 'sent', 'redeemed'].includes(invite.status)
  ).length;

  return NextResponse.json({
    invites,
    activeCount,
    limit: getBetaInviteLimit(),
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const body = await request.json().catch(() => ({}));
  const name = normalizeInviteName(String(body.name ?? ''));
  const email = normalizeInviteEmail(String(body.email ?? ''));

  if (!name) {
    return NextResponse.json(
      { error: 'Nome e obrigatorio.' },
      { status: 400 }
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: 'Email invalido.' },
      { status: 400 }
    );
  }

  const admin = getAdmin();
  const now = Date.now();
  const limit = getBetaInviteLimit();
  const code = generateInviteCode();
  const codeHash = hashInviteCode(email, code);

  const { data: existing, error: existingError } = await admin
    .from('beta_invites')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { error: 'Erro ao verificar convite existente.' },
      { status: 500 }
    );
  }

  const existingInvite = existing as BetaInviteRow | null;

  if (!existingInvite || !isActiveBetaInviteStatus(existingInvite.status)) {
    const activeCount = await countActiveBetaInvites(admin);
    if (activeCount >= limit) {
      return NextResponse.json(
        { error: `Limite de ${limit} convites beta atingido.` },
        { status: 409 }
      );
    }
  }

  const delivery = await sendBetaInviteEmail(email, code, name);
  const status = existingInvite?.status === 'redeemed'
    ? 'redeemed'
    : delivery.status === 'sent' ? 'sent' : 'pending';

  const payload = {
    name,
    email,
    code_hash: codeHash,
    status,
    invited_by: authResult.userId,
    send_count: (existingInvite?.send_count ?? 0) + 1,
    email_delivery_status: delivery.status,
    email_delivery_error: delivery.reason ?? null,
    expires_at: inviteExpiresAt(now),
    sent_at: delivery.status === 'sent' ? now : existingInvite?.sent_at ?? null,
    updated_at: now,
  };

  const query = existingInvite
    ? admin.from('beta_invites').update(payload).eq('id', existingInvite.id).select('*').single()
    : admin.from('beta_invites').insert({ ...payload, created_at: now }).select('*').single();

  const { data: saved, error: saveError } = await query;

  if (saveError) {
    return NextResponse.json(
      { error: saveError.message },
      { status: 500 }
    );
  }

  let betaAccessActivated = false;
  try {
    const existingUser = await findAuthUserByEmail(admin, email);
    if (existingUser?.id) {
      await activateBetaInviteForUser({
        admin,
        userId: existingUser.id,
        email,
        nowMs: now,
      });
      betaAccessActivated = true;
    }
  } catch (activationError) {
    console.error('[Admin Beta Invites] Auto activation failed:', activationError);
    return NextResponse.json(
      { error: activationError instanceof Error ? activationError.message : 'Convite salvo, mas falhou ao liberar Pro.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    invite: serializeInvite(saved as BetaInviteRow),
    emailStatus: delivery.status,
    manualCode: delivery.status === 'sent' ? null : code,
    betaAccessActivated,
    message: betaAccessActivated
      ? 'Pessoa adicionada ao beta e Pro liberado para a conta existente.'
      : delivery.status === 'sent'
        ? 'Pessoa adicionada ao beta. O Pro sera liberado quando ela entrar com este email.'
        : 'Pessoa adicionada ao beta, mas o email nao foi enviado. Use o codigo manual se precisar.',
  });
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const body = await request.json().catch(() => ({}));
  const inviteId = String(body.inviteId ?? '');
  const action = String(body.action ?? '');

  if (!inviteId || !['revoke'].includes(action)) {
    return NextResponse.json(
      { error: 'Acao invalida.' },
      { status: 400 }
    );
  }

  const admin = getAdmin();
  const now = Date.now();
  const { data, error } = await admin
    .from('beta_invites')
    .update({
      status: 'revoked',
      updated_at: now,
    })
    .eq('id', inviteId)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Erro ao revogar convite.' },
      { status: 500 }
    );
  }

  try {
    await revokeBetaProAccess({
      admin,
      userId: (data as BetaInviteRow).user_id,
      nowMs: now,
    });
  } catch (revokeError) {
    console.error('[Admin Beta Invites] Revoke access failed:', revokeError);
    return NextResponse.json(
      { error: revokeError instanceof Error ? revokeError.message : 'Convite revogado, mas falhou ao remover acesso beta.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ invite: serializeInvite(data as BetaInviteRow) });
}
