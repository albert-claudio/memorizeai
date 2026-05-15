import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listNotificationInbox, markNotificationsRead } from '@/lib/notifications/service';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '12'), 1), 50);

  try {
    const items = await listNotificationInbox(user.id, limit);
    return NextResponse.json({ items });
  } catch (loadError) {
    return NextResponse.json({
      error: loadError instanceof Error ? loadError.message : 'Erro ao carregar notificações',
    }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids.filter((value: unknown): value is string => typeof value === 'string') : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Nenhuma notificação enviada' }, { status: 400 });
    }

    await markNotificationsRead(user.id, ids);
    return NextResponse.json({ ok: true });
  } catch (saveError) {
    return NextResponse.json({
      error: saveError instanceof Error ? saveError.message : 'Erro ao marcar notificações',
    }, { status: 400 });
  }
}
