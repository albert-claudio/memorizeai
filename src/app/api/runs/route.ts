import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hasProAccess } from '@/lib/billing/pro-access';
import { checkRunEntitlement } from '@/lib/billing/run-entitlement';

// Generate cryptographically secure random ID
function generateId() {
  return crypto.randomUUID();
}

/**
 * POST /api/runs
 * Create a new AI generation run and trigger the orchestrator
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

    // Now parse and validate body
    const body = await request.json();
    const { sourceId, objective, modelPreference = 'auto', targetCount = 10, deckId } = body;

    // Validate required fields
    if (!sourceId || !objective) {
      return NextResponse.json(
        { error: 'sourceId and objective are required' },
        { status: 400 }
      );
    }

    // Validate objective
    const validObjectives = ['flashcards', 'questoes_banca', 'logica_juridica'];
    if (!validObjectives.includes(objective)) {
      return NextResponse.json(
        { error: 'Invalid objective. Must be: flashcards, questoes_banca, or logica_juridica' },
        { status: 400 }
      );
    }

    // ================================================================
    // ENTITLEMENT CHECK (tier + monthly limits)
    // ================================================================
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, subscription_status, subscription_period_end, admin_override_pro')
      .eq('id', user.id)
      .single();

    const isPro = hasProAccess(profile);

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

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
    }

    // Create the run using service role client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = Date.now();
    const runId = generateId();

    const { error: insertError } = await supabaseAdmin
      .from('runs')
      .insert({
        id: runId,
        user_id: user.id,
        source_id: sourceId,
        deck_id: validatedDeckId,
        objective,
        model_preference: modelPreference,
        target_count: validatedTargetCount,
        status: 'pendente',
        attempt_count: 0,
        items_generated: 0,
        created_at: now,
        updated_at: now,
      });

    if (insertError) {
      console.error('[API /runs] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create run' },
        { status: 500 }
      );
    }

    // Trigger the Edge Function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Fire and forget - don't wait for the edge function
    fetch(`${supabaseUrl}/functions/v1/run-orchestrator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ runId }),
    }).catch(err => {
      console.error('[API /runs] Failed to trigger edge function:', err);
    });

    return NextResponse.json({
      success: true,
      runId,
      message: 'Run created and processing started',
    });

  } catch (error) {
    console.error('[API /runs] Error:', error);
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
      console.error('[API /runs GET] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 });
    }

    return NextResponse.json({ runs: runs || [] });

  } catch (error) {
    console.error('[API /runs GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
