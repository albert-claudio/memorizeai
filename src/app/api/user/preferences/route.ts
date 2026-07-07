import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectiveProAccess } from '@/lib/billing/effective-pro-access';

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

const PREMIUM_COLUMNS = new Set([
  'prioritize_weak',
  'prioritize_near_exam',
  'fsrs_enabled',
  'interval_limit_days',
  'daily_load_tolerance',
  'auto_reschedule_missed',
  'bury_siblings',
]);

const FREE_LIMITED_VALUES = {
  prioritize_weak: false,
  prioritize_near_exam: false,
  fsrs_enabled: false,
  interval_limit_days: 365,
  daily_load_tolerance: 100,
  auto_reschedule_missed: false,
  bury_siblings: false,
};

const BOOLEAN_COLUMNS = new Set([
  'review_overdue_first',
  'mix_new_and_review',
  'prioritize_weak',
  'prioritize_near_exam',
  'simple_mode',
  'fsrs_enabled',
  'auto_reschedule_missed',
  'bury_siblings',
  'notify_review',
  'notify_daily_goal',
  'notify_streak',
  'notify_content_ready',
  'notify_plan_renewal',
  'email_marketing',
  'push_enabled',
  'animations_enabled',
  'show_streak',
  'show_study_time',
  'sound_vibration',
  'focus_mode',
  'hide_distractions',
  'pomodoro_enabled',
  'auto_breaks',
  'sound_on_complete',
  'open_on_review',
]);

const INTEGER_COLUMNS: Record<string, { min: number; max: number }> = {
  daily_reviews: { min: 1, max: 500 },
  daily_new_cards: { min: 0, max: 200 },
  daily_study_minutes: { min: 5, max: 720 },
  interval_limit_days: { min: 1, max: 3650 },
  daily_load_tolerance: { min: 10, max: 1000 },
};

const ENUM_COLUMNS: Record<string, Set<string>> = {
  study_goal: new Set(['concurso', 'oab', 'enem', 'faculdade']),
  study_period: new Set(['manha', 'tarde', 'noite']),
  review_intensity: new Set(['leve', 'normal', 'pesada']),
  theme: new Set(['light', 'dark', 'system']),
  font_size: new Set(['small', 'medium', 'large']),
  app_language: new Set(['pt-BR']),
  date_format: new Set(['DD/MM/YYYY']),
};

function sanitizePreferenceValue(key: string, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (BOOLEAN_COLUMNS.has(key)) {
    return typeof value === 'boolean'
      ? { ok: true, value }
      : { ok: false, error: `${key} deve ser booleano` };
  }

  const integerBounds = INTEGER_COLUMNS[key];
  if (integerBounds) {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < integerBounds.min || numeric > integerBounds.max) {
      return { ok: false, error: `${key} deve estar entre ${integerBounds.min} e ${integerBounds.max}` };
    }

    return { ok: true, value: numeric };
  }

  const enumValues = ENUM_COLUMNS[key];
  if (enumValues) {
    if (typeof value !== 'string' || !enumValues.has(value)) {
      return { ok: false, error: `${key} invalido` };
    }

    return { ok: true, value };
  }

  if (key === 'reminder_time') {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      return { ok: false, error: 'reminder_time deve estar no formato HH:mm' };
    }

    return { ok: true, value };
  }

  if (key === 'study_days') {
    if (typeof value !== 'string') {
      return { ok: false, error: 'study_days invalido' };
    }

    const allowedDays = new Set(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']);
    const normalized = value === 'all'
      ? 'all'
      : value
          .split(',')
          .map((day) => day.trim())
          .filter(Boolean)
          .join(',');

    if (
      normalized !== 'all' &&
      (!normalized || normalized.split(',').some((day) => !allowedDays.has(day)))
    ) {
      return { ok: false, error: 'study_days invalido' };
    }

    return { ok: true, value: normalized };
  }

  return { ok: false, error: `${key} nao pode ser atualizado` };
}

function applyFreePlanPreferenceLimits<T extends Record<string, unknown> | null>(preferences: T, isPro: boolean): T {
  if (!preferences || isPro) return preferences;
  return {
    ...preferences,
    ...FREE_LIMITED_VALUES,
  };
}

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

      const isPro = await getEffectiveProAccess(supabase, user.id);
      return NextResponse.json(applyFreePlanPreferenceLimits(newRow, isPro));
    }

    if (error) {
      console.error('[Preferences API] Fetch error:', error);
      return NextResponse.json({ error: 'Erro ao buscar preferências' }, { status: 500 });
    }

    const isPro = await getEffectiveProAccess(supabase, user.id);
    return NextResponse.json(applyFreePlanPreferenceLimits(data, isPro));
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
        const sanitized = sanitizePreferenceValue(key, value);
        if (!sanitized.ok) {
          return NextResponse.json({ error: sanitized.error }, { status: 400 });
        }

        updates[key] = sanitized.value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo válido enviado' }, { status: 400 });
    }

    const touchesPremiumColumn = Object.keys(updates).some((key) => PREMIUM_COLUMNS.has(key));
    if (touchesPremiumColumn) {
      const isPro = await getEffectiveProAccess(supabase, user.id);
      if (!isPro) {
        return NextResponse.json(
          {
            error: 'Recurso exclusivo para planos Pro e Premium.',
            code: 'PRO_REQUIRED',
            upgradeUrl: '/upgrade',
          },
          { status: 403 },
        );
      }
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

    const isPro = await getEffectiveProAccess(supabase, user.id);
    return NextResponse.json(applyFreePlanPreferenceLimits(data, isPro));
  } catch (error) {
    console.error('[Preferences API] Unexpected error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
