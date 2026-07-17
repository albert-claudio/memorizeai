
import { createClient } from '@/lib/supabase/client';
import type { Run } from '@/lib/types';

export class RunServiceError extends Error {
  status: number;
  retryAfter?: number;

  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = 'RunServiceError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function getAuthHeaders() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Usuario nao autenticado');
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

export const runService = {
  async getRun(runId: string) {
    const response = await fetch(`/api/runs?runId=${encodeURIComponent(runId)}`, {
      headers: await getAuthHeaders(),
      cache: 'no-store',
    });

    const data = await response.json();
    if (!response.ok) {
      const retryAfterHeader = Number(response.headers.get('Retry-After'));
      const retryAfter = Number.isFinite(data.retryAfter)
        ? Number(data.retryAfter)
        : Number.isFinite(retryAfterHeader)
          ? retryAfterHeader
          : undefined;
      throw new RunServiceError(data.error || 'Falha ao buscar run', response.status, retryAfter);
    }

    return data.run as Run;
  },

  async getLatestActiveRun() {
    const response = await fetch('/api/runs?active=1', {
      headers: await getAuthHeaders(),
      cache: 'no-store',
    });

    const data = await response.json();
    if (!response.ok) {
      const retryAfterHeader = Number(response.headers.get('Retry-After'));
      const retryAfter = Number.isFinite(data.retryAfter)
        ? Number(data.retryAfter)
        : Number.isFinite(retryAfterHeader)
          ? retryAfterHeader
          : undefined;
      throw new RunServiceError(data.error || 'Falha ao buscar run ativa', response.status, retryAfter);
    }

    return (data.run ?? null) as Run | null;
  }
};
