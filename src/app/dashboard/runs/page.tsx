
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Source, RunObjective, Banca, Dificuldade } from '@/lib/types';
import { useSources } from '@/features/runs/hooks/useSources';
import { useMonthlyUsage } from '@/features/runs/hooks/useMonthlyUsage';
import { useRunCreation } from '@/features/runs/hooks/useRunCreation';
import { useTierLimits } from '@/features/dashboard/hooks/useTierLimits';
import {
  Icons,
  RunsHeader,
  ActiveRunProgress,
  SourceStep,
  ObjectiveStep,
  BancaStep,
  DifficultyStep,
  QuantityStep,
  GenerateRunButton,
} from '@/features/runs/components';

export default function RunsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Initial User Check
  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setUser(user);
      setLoadingUser(false);
    };

    checkUser();
  }, [router]);

  // Hooks
  const { 
    sources, 
    loading: loadingSources 
  } = useSources(user?.id);

  const { 
    usage,
    refreshUsage,
  } = useMonthlyUsage();

  const { 
    tierLimits 
  } = useTierLimits();

  const { 
    creating, 
    activeRun, 
    handleCreateRun, 
    resetRun 
  } = useRunCreation({ 
    userId: user?.id,
    // Default redirect logic inside hook handles navigation
  });

  // Local Selection State
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedObjective, setSelectedObjective] = useState<RunObjective | null>(null);
  const [selectedBanca, setSelectedBanca] = useState<Banca | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Dificuldade | null>(null);
  const [targetCount, setTargetCount] = useState(10);

  // Reset banca/difficulty when objective changes away from questoes_banca
  const handleSelectObjective = (obj: RunObjective) => {
    setSelectedObjective(obj);
    if (obj !== 'questoes_banca') {
      setSelectedBanca(null);
      setSelectedDifficulty(null);
    }
  };

  // Wrapper for run creation
  const onCreateRunQuery = () => {
    if (!selectedSource || !selectedObjective) return;

    handleCreateRun(
      selectedSource.id, 
      selectedObjective, 
      targetCount, 
      false,  // requiresCredits — no longer used, kept for hook compat
      true,   // hasCredits — no longer used, kept for hook compat
      selectedObjective === 'questoes_banca' ? selectedBanca : null,
      selectedObjective === 'questoes_banca' ? selectedDifficulty : null,
    );

    // Refresh usage after run is created to update counts
    setTimeout(() => refreshUsage(), 2000);
  };

  // Loading Screen
  if (loadingUser) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-base)',
        }}
      >
        <Icons.Loader />
        <style jsx global>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <RunsHeader usage={usage} />

      <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        {activeRun && (
          <ActiveRunProgress
            activeRun={activeRun}
            onRetry={resetRun}
          />
        )}

        {!activeRun && (
          <>
            <SourceStep
              loadingSources={loadingSources}
              sources={sources}
              selectedSource={selectedSource}
              onSelectSource={setSelectedSource}
            />

            <ObjectiveStep
              isPro={tierLimits?.isPro ?? null}
              selectedObjective={selectedObjective}
              onSelectObjective={handleSelectObjective}
              onRequireUpgrade={() => router.push('/upgrade')}
            />

            {selectedObjective === 'questoes_banca' && (
              <>
                <BancaStep
                  selectedBanca={selectedBanca}
                  onSelectBanca={setSelectedBanca}
                />

                <DifficultyStep
                  selectedDifficulty={selectedDifficulty}
                  onSelectDifficulty={setSelectedDifficulty}
                />
              </>
            )}

            <QuantityStep
              isPro={tierLimits?.isPro ?? null}
              targetCount={targetCount}
              onSetTargetCount={setTargetCount}
              onRequireUpgrade={() => router.push('/upgrade')}
            />

            <GenerateRunButton
              selectedSource={selectedSource}
              selectedObjective={selectedObjective}
              creating={creating}
              targetCount={targetCount}
              usage={usage}
              onCreateRun={onCreateRunQuery}
            />
          </>
        )}
      </main>
    </div>
  );
}
