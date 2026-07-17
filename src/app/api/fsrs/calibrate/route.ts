import { NextRequest, NextResponse } from 'next/server';
import { requirePro, isAuthSuccess } from '@/lib/auth/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { calibrateUserFsrsWeights } from '@/lib/fsrs/user-calibration';

async function readJsonBody(request: NextRequest): Promise<{ force?: unknown } | null> {
  const raw = await request.text();
  if (!raw.trim()) return null;

  try {
    return JSON.parse(raw) as { force?: unknown };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePro(request);
    if (!isAuthSuccess(authResult)) return authResult;

    const body = await readJsonBody(request);
    const force = body?.force === true;
    const supabase = await createClient();

    const result = await calibrateUserFsrsWeights(supabase, authResult.user.id, { force });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[FSRS calibration] unexpected error:', error);
    return NextResponse.json(
      { error: 'Erro ao calibrar FSRS' },
      { status: 500 },
    );
  }
}
