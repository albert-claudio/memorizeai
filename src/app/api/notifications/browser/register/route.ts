import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  registerBrowserNotificationDevice,
  validateBrowserPermissionState,
} from '@/lib/notifications/service';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const deviceKey = String(body?.deviceKey ?? '').trim();
    const permission = validateBrowserPermissionState(String(body?.permission ?? 'default'));
    const userAgent = typeof body?.userAgent === 'string' ? body.userAgent.slice(0, 500) : null;

    if (!deviceKey) {
      return NextResponse.json({ error: 'deviceKey é obrigatório' }, { status: 400 });
    }

    await registerBrowserNotificationDevice({
      userId: user.id,
      deviceKey,
      permission,
      userAgent,
    });

    return NextResponse.json({ ok: true });
  } catch (registerError) {
    return NextResponse.json({
      error: registerError instanceof Error ? registerError.message : 'Erro ao registrar navegador',
    }, { status: 400 });
  }
}
