import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveProAccess } from '@/lib/billing/effective-pro-access';
import { checkRunEntitlement } from '@/lib/billing/run-entitlement';
import { authorizeCardCreation, authorizeDeckCreation } from '@/lib/billing/tier-limits';
import { getStudyGoalProfile } from '@/lib/study-goal-profiles';
import { getStudyGoalByUserId } from '@/lib/study-goal/get-study-goal';
import { isSafeEntityId } from '@/lib/security/input-validation';
import { captureApiError, setSentryUser } from '@/lib/sentry';
import type { RunObjective, ModelPreference } from '@/lib/types';
import { triggerRunDispatch } from '@/lib/queue/trigger-run-dispatch';
import { VALID_BANCAS, VALID_DIFICULDADES } from '@/lib/runs/process/prompts/banca';

// ============================================================================
// SHARED RUN-CREATION LOGIC
// ============================================================================
// This is the same pipeline used by the createRun server action.
// The POST handler below delegates to it directly so there is ONE code path.
// ============================================================================

function generateId() {
  return crypto.randomUUID();
}

/**
 * POST /api/runs
 *
 * REST-compatible run creation endpoint.
 * Delegates to the SAME pipeline as the createRun server action:
 *   insert row as 'queued' → try immediate dispatch → cron acts as backstop.
 *
 * Kept for REST API compatibility. The UI uses the server action directly.
 */
export async function POST(request: NextRequest) {
  try {
    // ================================================================
    // SECURITY: Auth check FIRST — before any body validation
    // ================================================================
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    // Create Supabase client with user's token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    setSentryUser({ id: user.id, email: user.email });

    // Now parse and validate body
    const body = await request.json();
    const {
      sourceId,
      objective,
      modelPreference = 'auto',
      targetCount = 10,
      deckId,
      banca,
      dificuldade,
    } = body;

    // Validate required fields
    if (!sourceId || !objective) {
      return NextResponse.json(
        { error: 'sourceId and objective are required' },
        { status: 400 }
      );
    }

    if (!isSafeEntityId(sourceId)) {
      return NextResponse.json(
        { error: 'Invalid sourceId format' },
        { status: 400 }
      );
    }

    if (deckId != null && !isSafeEntityId(deckId)) {
      return NextResponse.json(
        { error: 'Invalid deckId format' },
        { status: 400 }
      );
    }

    // Validate objective
    const validObjectives: RunObjective[] = ['flashcards', 'questoes_banca', 'exercicios_aplicados'];
    if (!validObjectives.includes(objective)) {
      return NextResponse.json(
        { error: 'Invalid objective. Must be: flashcards, questoes_banca, or exercicios_aplicados' },
        { status: 400 }
      );
    }

    // ================================================================
    // ENTITLEMENT CHECK (public launch quotas and target-size limits)
    // ================================================================
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const isPro = await getEffectiveProAccess(adminSupabase, user.id);

    const studyGoal = await getStudyGoalByUserId(adminSupabase, user.id);
    const studyProfile = getStudyGoalProfile(studyGoal);
    if (!studyProfile.allowedObjectives.includes(objective)) {
      return NextResponse.json(
        { error: `Objective "${objective}" not allowed for study goal ${studyGoal}` },
        { status: 400 },
      );
    }

    const entitlement = await checkRunEntitlement(
      adminSupabase, user.id, isPro, objective, targetCount,
    );

    if (!entitlement.allowed) {
      return NextResponse.json(
        { error: entitlement.reason },
        { status: 403 },
      );
    }

    const validatedTargetCount = entitlement.validatedTargetCount;

    // Validate source exists and belongs to user
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('id, status')
      .eq('id', sourceId)
      .eq('user_id', user.id)
      .single();

    if (sourceError || !source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    if (source.status !== 'concluido') {
      return NextResponse.json(
        { error: 'Source is still processing' },
        { status: 400 }
      );
    }

    // ================================================================
    // DECK OWNERSHIP VALIDATION (IDOR Prevention)
    // ================================================================
    let validatedDeckId = null;
    if (deckId) {
      const { data: deck, error: deckError } = await supabase
        .from('decks')
        .select('id')
        .eq('id', deckId)
        .eq('user_id', user.id)
        .single();

      if (deckError || !deck) {
        return NextResponse.json(
          { error: 'Deck not found or access denied' },
          { status: 403 }
        );
      }
      validatedDeckId = deck.id;

      const cardCapacity = await authorizeCardCreation(
        adminSupabase,
        validatedDeckId,
        user.id,
        validatedTargetCount,
      );
      if (!cardCapacity.allowed) {
        return NextResponse.json(
          { error: cardCapacity.reason },
          { status: 403 },
        );
      }
    } else if (objective === 'flashcards') {
      const deckCapacity = await authorizeDeckCreation(adminSupabase, user.id);
      if (!deckCapacity.allowed) {
        return NextResponse.json(
          { error: deckCapacity.reason },
          { status: 403 },
        );
      }
    }

    // ================================================================
    // BANCA / DIFICULDADE VALIDATION (same as createRun server action)
    // ================================================================
    const safeBanca = typeof banca === 'string' ? banca : null;
    const safeDificuldade = typeof dificuldade === 'string' ? dificuldade : null;

    if (objective === 'questoes_banca') {
      if (!safeBanca || !VALID_BANCAS.includes(safeBanca)) {
        return NextResponse.json(
          { error: `Invalid banca. Must be: ${VALID_BANCAS.join(', ')}` },
          { status: 400 },
        );
      }

      if (!safeDificuldade || !VALID_DIFICULDADES.includes(safeDificuldade)) {
        return NextResponse.json(
          { error: `Invalid dificuldade. Must be: ${VALID_DIFICULDADES.join(', ')}` },
          { status: 400 },
        );
      }
    }

    // ================================================================
    // CREATE RUN — enqueue as 'queued', dispatcher handles processing
    // ================================================================
    const now = Date.now();
    const runId = generateId();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runPayload: Record<string, any> = {
      id: runId,
      user_id: user.id,
      source_id: sourceId,
      deck_id: validatedDeckId,
      objective,
      model_preference: modelPreference as ModelPreference,
      target_count: validatedTargetCount,
      status: 'queued',
      attempt_count: 0,
      provider_attempt_count: 0,
      items_generated: 0,
      next_attempt_at: now,
      created_at: now,
      updated_at: now,
    };
    if (objective === 'questoes_banca') {
      runPayload.banca = safeBanca;
      runPayload.dificuldade = safeDificuldade;
    }

    const { error: insertError } = await adminSupabase
      .from('runs')
      .insert(runPayload);

    if (insertError) {
      captureApiError(insertError, { route: '/api/runs', userId: user.id, tags: { action: 'insert_run' } });
      return NextResponse.json(
        { error: 'Failed to create run' },
        { status: 500 }
      );
    }

    console.log(`[/api/runs POST] Run ${runId} enqueued (status=queued)`);
    triggerRunDispatch(runId);

    return NextResponse.json({
      success: true,
      runId,
      message: 'Run created and dispatched for processing',
    });

  } catch (error) {
    captureApiError(error, { route: '/api/runs', tags: { method: 'POST' } });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/runs
 * Get user's runs
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    const active = searchParams.get('active') === 'true' || searchParams.get('active') === '1';

    if (runId) {
      if (!isSafeEntityId(runId)) {
        return NextResponse.json(
          { error: 'Invalid runId format' },
          { status: 400 }
        );
      }

      const { data: run, error } = await supabase
        .from('runs')
        .select(`
          *,
          source:sources(id, filename),
          deck:decks(id, title)
        `)
        .eq('id', runId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();

      if (error) {
        captureApiError(error, { route: '/api/runs', userId: user.id, tags: { method: 'GET', action: 'get_run' } });
        return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      }

      return NextResponse.json({ run });
    }

    if (active) {
      const { data: runs, error } = await supabase
        .from('runs')
        .select(`
          *,
          source:sources(id, filename),
          deck:decks(id, title)
        `)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('status', ['pendente', 'queued', 'retry_wait', 'processando'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        captureApiError(error, { route: '/api/runs', userId: user.id, tags: { method: 'GET', action: 'get_active_run' } });
        return NextResponse.json({ error: 'Failed to fetch active run' }, { status: 500 });
      }

      return NextResponse.json({ run: runs?.[0] ?? null });
    }

    const MAX_LIMIT = 100;
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20') || 20), MAX_LIMIT);

    const { data: runs, error } = await supabase
      .from('runs')
      .select(`
        *,
        source:sources(id, filename),
        deck:decks(id, title)
      `)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      captureApiError(error, { route: '/api/runs', userId: user.id, tags: { method: 'GET' } });
      return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 });
    }

    return NextResponse.json({ runs: runs || [] });

  } catch (error) {
    captureApiError(error, { route: '/api/runs', tags: { method: 'GET' } });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
