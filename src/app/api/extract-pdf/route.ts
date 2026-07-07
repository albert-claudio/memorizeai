import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * @deprecated Use POST /api/extract-document instead.
 * Kept only to return a clear migration response for legacy clients.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Esta rota foi descontinuada. Use /api/extract-document.',
      code: 'ROUTE_DEPRECATED',
      migration: '/api/extract-document',
    },
    { status: 410 },
  );
}
