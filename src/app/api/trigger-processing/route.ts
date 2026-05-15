import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSafeEntityId } from '@/lib/security/input-validation';

export const dynamic = 'force-dynamic';

/**
 * API Route to trigger processing of an uploaded source
 * POST /api/trigger-processing
 * Body: { sourceId: string }
 * 
 * SECURITY: Requires authentication + source ownership
 */
export async function POST(request: NextRequest) {
  try {
    // ================================================================
    // 1. AUTHENTICATION CHECK
    // ================================================================
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { sourceId } = await request.json();
    
    if (!sourceId) {
      return NextResponse.json(
        { error: 'sourceId is required' },
        { status: 400 }
      );
    }

    if (!isSafeEntityId(sourceId)) {
      return NextResponse.json(
        { error: 'Invalid sourceId format' },
        { status: 400 }
      );
    }

    // ================================================================
    // 2. SOURCE OWNERSHIP CHECK (IDOR Prevention)
    // ================================================================
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('user_id')
      .eq('id', sourceId)
      .single();

    if (sourceError || !source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    if (source.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden - you do not own this source' },
        { status: 403 }
      );
    }

    // Get Supabase Edge Function URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Supabase configuration missing' },
        { status: 500 }
      );
    }

    // Call Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/process-source`;
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ sourceId }),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result.error || 'Processing failed' },
        { status: response.status }
      );
    }

    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Error triggering processing:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
