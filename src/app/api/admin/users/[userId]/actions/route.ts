import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminSuccess } from '@/lib/auth/admin-guard';
import { writeAdminAction } from '@/lib/admin/service';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

type ActionBody = {
  action?: 'ban' | 'unban' | 'soft_delete' | 'impersonate';
};

function getOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(request.url).origin;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const { userId } = await context.params;
  if (userId === authResult.userId) {
    return NextResponse.json(
      { error: 'Voce nao pode executar esta acao na propria conta admin.' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({})) as ActionBody;
  const action = body.action;
  if (!action) {
    return NextResponse.json({ error: 'Acao obrigatoria.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: target, error: targetError } = await supabase.auth.admin.getUserById(userId);
  if (targetError || !target.user) {
    return NextResponse.json({ error: 'Usuario nao encontrado.' }, { status: 404 });
  }

  if (action === 'ban') {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: '876000h',
    } as never);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAdminAction({
      adminUserId: authResult.userId,
      action: 'ban_user',
      targetUserId: userId,
      details: { admin_email: authResult.email },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'unban') {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    } as never);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeAdminAction({
      adminUserId: authResult.userId,
      action: 'unban_user',
      targetUserId: userId,
      details: { admin_email: authResult.email },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'soft_delete') {
    const now = Date.now();
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ deleted_at: now, updated_at: now } as never)
      .eq('id', userId);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId, true);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    await writeAdminAction({
      adminUserId: authResult.userId,
      action: 'soft_delete_user',
      targetUserId: userId,
      details: { admin_email: authResult.email },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'impersonate') {
    const email = target.user.email;
    if (!email) {
      return NextResponse.json({ error: 'Usuario alvo nao tem email.' }, { status: 400 });
    }

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${getOrigin(request)}/dashboard`,
      },
    });
    if (error || !data.properties?.action_link) {
      return NextResponse.json(
        { error: error?.message ?? 'Nao foi possivel gerar link de impersonacao.' },
        { status: 500 }
      );
    }

    await writeAdminAction({
      adminUserId: authResult.userId,
      action: 'impersonate_link',
      targetUserId: userId,
      details: { admin_email: authResult.email, target_email: email },
    });

    return NextResponse.json({
      ok: true,
      url: data.properties.action_link,
      warning: 'Abrir este link substitui a sessao atual do navegador pelo usuario alvo.',
    });
  }

  return NextResponse.json({ error: 'Acao invalida.' }, { status: 400 });
}
