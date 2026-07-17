import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSafeEntityId } from '@/lib/security/input-validation';
import { internalServerErrorResponse } from '@/lib/security/api-error';

export const dynamic = 'force-dynamic';

/**
 * @deprecated Use POST /api/process-source instead.
 * Legacy edge-function trigger removed for security (anon key misuse).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const { sourceId } = await request.json();

    if (!sourceId) {
      return NextResponse.json(
        { error: 'sourceId is required' },
        { status: 400 },
      );
    }

    if (!isSafeEntityId(sourceId)) {
      return NextResponse.json(
        { error: 'Invalid sourceId format' },
        { status: 400 },
      );
    }

    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('user_id')
      .eq('id', sourceId)
      .single();

    if (sourceError || !source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 },
      );
    }

    if (source.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden - you do not own this source' },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        error: 'Esta rota foi descontinuada. Use /api/process-source.',
        code: 'ROUTE_DEPRECATED',
        migration: '/api/process-source',
      },
      { status: 410 },
    );
  } catch (error) {
    console.error('Error in deprecated trigger-processing route:', error);
    return internalServerErrorResponse();
  }
}
