import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// All allowed columns (prevents injection of arbitrary fields)
const ALLOWED_COLUMNS = new Set([
  'study_goal',
  'daily_reviews',
  'daily_new_cards',
  'daily_study_minutes',
  'study_period',
  'reminder_time',
  'study_days',
  'review_overdue_first',
  'mix_new_and_review',
  'prioritize_weak',
  'prioritize_near_exam',
  'simple_mode',
  'review_intensity',
  'fsrs_enabled',
  'interval_limit_days',
  'daily_load_tolerance',
  'auto_reschedule_missed',
  'bury_siblings',
  'notify_review',
  'notify_daily_goal',
  'notify_streak',
  'notify_content_ready',
  'notify_plan_renewal',
  'email_marketing',
  'push_enabled',
  'theme',
  'font_size',
  'animations_enabled',
  'show_streak',
  'show_study_time',
  'sound_vibration',
  'app_language',
  'date_format',
  'focus_mode',
  'hide_distractions',
  'pomodoro_enabled',
  'auto_breaks',
  'sound_on_complete',
  'open_on_review',
]);

/**
 * GET /api/user/preferences
 * Returns the current user's preferences (creates default row if missing)
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Try to fetch existing
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // No row found — create default
      const { data: newRow, error: insertError } = await supabase
        .from('user_preferences')
        .insert({ user_id: user.id })
        .select('*')
        .single();

      if (insertError) {
        console.error('[Preferences API] Insert error:', insertError);
        return NextResponse.json({ error: 'Erro ao criar preferências' }, { status: 500 });
      }

      return NextResponse.json(newRow);
    }

    if (error) {
      console.error('[Preferences API] Fetch error:', error);
      return NextResponse.json({ error: 'Erro ao buscar preferências' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Preferences API] Unexpected error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * PUT /api/user/preferences
 * Partial update — accepts any subset of allowed columns
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();

    // Filter to only allowed columns
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_COLUMNS.has(key)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo válido enviado' }, { status: 400 });
    }

    updates.updated_at = Date.now();

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(
        { user_id: user.id, ...updates },
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();

    if (error) {
      console.error('[Preferences API] Update error:', error);
      return NextResponse.json({ error: 'Erro ao salvar preferências' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Preferences API] Unexpected error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
