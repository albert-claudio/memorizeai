import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { emitTestNotification } from '@/lib/notifications/emitters';

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  try {
    const notification = await emitTestNotification({
      userId: user.id,
      type: 'content_ready',
      title: 'Teste de notificacao',
      body: 'Seu sistema de notificacoes do navegador esta ativo e pronto para uso.',
      importance: 'medium',
      ctaLabel: 'Abrir settings',
      ctaUrl: '/dashboard/settings',
      metadata: { source: 'manual_test' },
    });

    return NextResponse.json({ ok: true, notificationId: notification?.id ?? null });
  } catch (createError) {
    return NextResponse.json({
      error: createError instanceof Error ? createError.message : 'Erro ao criar teste',
    }, { status: 500 });
  }
}
