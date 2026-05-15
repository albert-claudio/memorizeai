
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { createRun } from '@/app/actions/createRun';
import type { Run, RunObjective, Banca, Dificuldade } from '@/lib/types';
import { runService } from '../services/runService';

export type RunWithExtras = Run & {
  simulado_id?: string | null;
};

interface UseRunCreationProps {
  userId: string | undefined;
  onRunCompleted?: (run: RunWithExtras) => void;
  deductCredit?: () => void;
}

export function useRunCreation({ userId, onRunCompleted, deductCredit }: UseRunCreationProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [activeRun, setActiveRun] = useState<RunWithExtras | null>(null);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const startPolling = useCallback((runId: string) => {
    console.log('[Hook] Starting polling for run:', runId);
    stopPolling();

    pollingInterval.current = setInterval(async () => {
      try {
        const run = await runService.getRun(runId);
        
        if (run) {
          console.log('[Hook] Poll update:', run.status);
          setActiveRun(run as RunWithExtras);

          if (run.status === 'concluido') {
            stopPolling();
            if (onRunCompleted) {
              onRunCompleted(run as RunWithExtras);
            } else {
              // Default redirect behavior if no callback provided
              setTimeout(() => {
                if (run.objective === 'questoes_banca' && (run as RunWithExtras).simulado_id) {
                   router.push(`/simulado/${(run as RunWithExtras).simulado_id}`);
                } else if (run.deck_id) {
                   router.push(`/deck/${run.deck_id}`);
                } else {
                   router.push('/dashboard');
                }
              }, 1500);
            }
          } else if (run.status === 'erro' || run.status === 'base_insuficiente') {
            stopPolling();
            setCreating(false);
          }
        }
      } catch (error) {
        console.error('[Hook] Polling error:', error);
        Sentry.captureException(error, { tags: { hook: 'useRunCreation', action: 'polling', runId } });
      }
    }, 2000);
  }, [router, onRunCompleted, stopPolling]);

  const handleCreateRun = async (
    sourceId: string, 
    objective: RunObjective, 
    targetCount: number,
    requiresCredits: boolean,
    hasCredits: boolean,
    banca?: Banca | null,
    dificuldade?: Dificuldade | null,
  ) => {
    if (!userId || !sourceId || !objective) return;
    if (requiresCredits && !hasCredits) return;

    setCreating(true);
    
    try {
      const result = await createRun(sourceId, objective, 'auto', targetCount, undefined, banca, dificuldade);

      if (result.success && result.runId) {
        startPolling(result.runId);
        
        // Optimistic update
        setActiveRun({
          id: result.runId,
          user_id: userId,
          source_id: sourceId,
          deck_id: null,
          objective: objective,
          model_preference: 'auto',
          target_count: targetCount,
          status: 'queued',
          model_used: null,
          attempt_count: 0,
          provider_attempt_count: 0,
          items_generated: 0,
          error_message: null,
          started_at: null,
          completed_at: null,
          next_attempt_at: Date.now(),
          lease_expires_at: null,
          processing_node: null,
          last_error_code: null,
          last_error_provider: null,
          last_error_at: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          deleted_at: null,
        } as RunWithExtras);

        if (requiresCredits && deductCredit) {
          deductCredit();
        }
      } else {
        alert(result.error || 'Erro ao criar run');
        setCreating(false);
      }
    } catch (error: unknown) {
      console.error('Error creating run:', error);
      Sentry.captureException(error, { tags: { hook: 'useRunCreation', action: 'createRun', sourceId, objective } });
      alert('Erro ao criar run');
      setCreating(false);
    }
  };

  const resetRun = () => {
    stopPolling();
    setActiveRun(null);
    setCreating(false);
  };

  return {
    creating,
    activeRun,
    handleCreateRun,
    resetRun
  };
}
