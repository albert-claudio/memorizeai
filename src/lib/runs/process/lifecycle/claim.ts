export interface ClaimableRun {
  status: string;
  attempt_count?: number | null;
  next_attempt_at?: number | null;
}

export function getClaimRejection(run: ClaimableRun, maxAttempts: number, now = Date.now()): string | null {
  if (run.status === 'concluido') return 'Run already concluido';
  if (run.status === 'base_insuficiente') return 'Run already marked as base_insuficiente';
  if (run.status === 'erro' && (run.attempt_count ?? 0) >= maxAttempts) return 'Run permanently failed';
  if ((run.status === 'queued' || run.status === 'retry_wait') && typeof run.next_attempt_at === 'number' && run.next_attempt_at > now) return 'Run not ready yet';
  return null;
}
