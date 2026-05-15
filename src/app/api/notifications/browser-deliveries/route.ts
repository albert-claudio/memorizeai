import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { markBrowserNotificationsDelivered } from '@/lib/notifications/service';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const notificationIds = Array.isArray(body?.notificationIds)
      ? body.notificationIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];

    await markBrowserNotificationsDelivered(user.id, notificationIds);
    return NextResponse.json({ ok: true });
  } catch (deliveryError) {
    return NextResponse.json({
      error: deliveryError instanceof Error ? deliveryError.message : 'Erro ao confirmar entregas',
    }, { status: 400 });
  }
}
