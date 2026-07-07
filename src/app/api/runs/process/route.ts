import type { NextRequest } from 'next/server';
import { processRun } from '@/lib/runs/process/process-run';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  return processRun(request);
}
