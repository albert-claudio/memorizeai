
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Source, RunObjective } from '@/lib/types';
import { useSources } from '@/features/runs/hooks/useSources';
import { useCredits } from '@/features/runs/hooks/useCredits';
import { useRunCreation } from '@/features/runs/hooks/useRunCreation';
import { useTierLimits } from '@/features/dashboard/hooks/useTierLimits';
import {
  Icons,
  RunsHeader,
  ActiveRunProgress,
  SourceStep,
  ObjectiveStep,
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
    credits, 
    deductCredit 
  } = useCredits();

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
    deductCredit 
    // Default redirect logic inside hook handles navigation
  });

  // Local Selection State
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedObjective, setSelectedObjective] = useState<RunObjective | null>(null);
  const [targetCount, setTargetCount] = useState(10);

  // Wrapper for run creation
  const onCreateRunQuery = () => {
    if (!selectedSource || !selectedObjective) return;
    const requiresCredits = selectedObjective !== 'flashcards';
    const hasCredits = (credits?.totalCredits ?? 0) > 0;
    
    handleCreateRun(
      selectedSource.id, 
      selectedObjective, 
      targetCount, 
      requiresCredits, 
      hasCredits
    );
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

      <RunsHeader credits={credits} />

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
              onSelectObjective={setSelectedObjective}
              onRequireUpgrade={() => router.push('/upgrade')}
            />

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
              credits={credits}
              onCreateRun={onCreateRunQuery}
            />
          </>
        )}
      </main>
    </div>
  );
}
