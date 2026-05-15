import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listPendingBrowserNotifications } from '@/lib/notifications/service';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '5'), 1), 20);

  try {
    const items = await listPendingBrowserNotifications(user.id, limit);
    return NextResponse.json({ items });
  } catch (loadError) {
    return NextResponse.json({
      error: loadError instanceof Error ? loadError.message : 'Erro ao buscar fila do navegador',
    }, { status: 500 });
  }
}
