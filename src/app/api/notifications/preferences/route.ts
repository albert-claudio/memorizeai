import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  listNotificationPreferences,
  mapPreferenceToLegacyField,
  updateNotificationPreference,
  validateNotificationType,
  validateNotificationUpdates,
} from '@/lib/notifications/service';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const items = await listNotificationPreferences(user.id);
    return NextResponse.json({ items });
  } catch (loadError) {
    return NextResponse.json({
      error: loadError instanceof Error ? loadError.message : 'Erro ao carregar preferências',
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const type = validateNotificationType(String(body?.type ?? ''));
    const updates = validateNotificationUpdates(body?.updates ?? {});

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhuma alteração válida enviada' }, { status: 400 });
    }

    const updated = await updateNotificationPreference(user.id, type, updates);

    const legacyField = mapPreferenceToLegacyField(type);
    if (legacyField && typeof updates.enabled === 'boolean') {
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          [legacyField]: updates.enabled,
          updated_at: Date.now(),
        }, { onConflict: 'user_id' });
    }

    if (type === 'marketing' && typeof updates.email_enabled === 'boolean') {
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          email_marketing: updates.email_enabled,
          updated_at: Date.now(),
        }, { onConflict: 'user_id' });
    }

    return NextResponse.json(updated);
  } catch (saveError) {
    return NextResponse.json({
      error: saveError instanceof Error ? saveError.message : 'Erro ao salvar preferências',
    }, { status: 400 });
  }
}
