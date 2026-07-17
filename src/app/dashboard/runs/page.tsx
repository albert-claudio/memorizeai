'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Banca, Dificuldade, RunObjective, Source } from '@/lib/types';
import { getStudyGoalProfile, type StudyGoal } from '@/lib/study-goal-profiles';
import { getObjectives } from '@/features/runs/constants';
import { useSources } from '@/features/runs/hooks/useSources';
import { useRunCreation } from '@/features/runs/hooks/useRunCreation';
import { useTierLimits } from '@/features/dashboard/hooks/useTierLimits';
import {
  ActiveRunProgress,
  BancaStep,
  DifficultyStep,
  GenerateRunButton,
  Icons,
  ObjectiveStep,
  QuantityStep,
  RunsHeader,
  SourceStep,
} from '@/features/runs/components';

const STUDY_GOALS: Array<{
  id: StudyGoal;
  title: string;
  description: string;
}> = [
  { id: 'concurso', title: 'Concurso', description: 'Banca, edital e questoes objetivas' },
  { id: 'oab', title: 'OAB', description: 'FGV, casos e Exame de Ordem' },
  { id: 'enem', title: 'ENEM', description: 'Competencias e interpretacao' },
  { id: 'faculdade', title: 'Faculdade', description: 'Provas a partir da sua materia' },
];

export default function RunsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [studyGoal, setStudyGoal] = useState<StudyGoal>('concurso');

  const profile = useMemo(() => getStudyGoalProfile(studyGoal), [studyGoal]);
  const objectives = useMemo(() => getObjectives(profile), [profile]);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setUser(user);

      try {
        const res = await fetch('/api/user/preferences');
        if (res.ok) {
          const data = await res.json();
          if (data?.study_goal) {
            setStudyGoal(data.study_goal as StudyGoal);
          }
        }
      } catch {
        // Keep default goal.
      }

      setLoadingUser(false);
    };

    init();
  }, [router]);

  const { sources, loading: loadingSources } = useSources(user?.id);
  const { tierLimits } = useTierLimits();
  const { creating, activeRun, canceling, handleCreateRun, resetRun, cancelActiveRun, resumeActiveRun } = useRunCreation({
    userId: user?.id,
  });

  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedObjective, setSelectedObjective] = useState<RunObjective | null>('questoes_banca');
  const [selectedBanca, setSelectedBanca] = useState<Banca | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Dificuldade | null>(null);
  const [targetCount, setTargetCount] = useState(10);
  const [sourceIdFromUpload] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('sourceId');
  });

  const defaultSource = useMemo(() => {
    if (!user || loadingSources || sources.length === 0) return null;

    if (sourceIdFromUpload) {
      return sources.find(source => source.id === sourceIdFromUpload) ?? sources[0];
    }

    return sources[0];
  }, [loadingSources, sourceIdFromUpload, sources, user]);

  const effectiveSelectedSource = selectedSource ?? defaultSource;

  useEffect(() => {
    if (!user) return;
    void resumeActiveRun();
  }, [resumeActiveRun, user]);

  const isQuestoesBanca = selectedObjective === 'questoes_banca';
  const showBancaSelector = profile.supportsBanca && isQuestoesBanca;
  const fixedExamLabel = profile.defaultBanca;
  const showDifficulty = isQuestoesBanca && profile.difficultyMode !== 'none';
  const needsRightScroll = isQuestoesBanca;

  const handleSelectObjective = (objective: RunObjective) => {
    setSelectedObjective(objective);
    if (objective !== 'questoes_banca') {
      setSelectedBanca(null);
      setSelectedDifficulty(null);
    }
  };

  const handleSelectStudyGoal = async (goal: StudyGoal) => {
    setStudyGoal(goal);
    setSelectedObjective('questoes_banca');
    setSelectedBanca(null);
    setSelectedDifficulty(null);

    try {
      await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ study_goal: goal }),
      });
    } catch {
      // Local selection still works for this run.
    }
  };

  const onCreateRunQuery = () => {
    if (!effectiveSelectedSource || !selectedObjective) return;

    let effectiveBanca: Banca | null = null;
    if (selectedObjective === 'questoes_banca') {
      if (profile.supportsBanca) {
        effectiveBanca = selectedBanca;
      } else if (profile.defaultBanca) {
        effectiveBanca = profile.defaultBanca as Banca;
      }
    }

    handleCreateRun(
      effectiveSelectedSource.id,
      selectedObjective,
      targetCount,
      false,
      true,
      effectiveBanca,
      selectedObjective === 'questoes_banca' ? selectedDifficulty : null,
    );
  };

  const bancaRequired = profile.supportsBanca && selectedObjective === 'questoes_banca';
  const bancaBlocking = bancaRequired && !selectedBanca;

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
    <div className="runs-page">
      <style jsx global>{`
        html,
        body {
          overflow: hidden;
        }

        .dashboard-layout-content {
          overflow: hidden;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .runs-page {
          min-height: 0;
          height: 100%;
          background: var(--bg-base);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .runs-content {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          padding: 20px 24px 24px;
        }

        .runs-content-scrollable {
          overflow-y: auto;
        }

        .runs-main-shell {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }

        .runs-active-shell {
          max-width: 900px;
        }

        .runs-split-layout {
          display: grid;
          grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr);
          gap: 24px;
          height: 100%;
          min-height: 0;
          align-items: stretch;
        }

        .runs-left-panel,
        .runs-right-panel {
          min-height: 0;
          display: flex;
          flex-direction: column;
        }

        .runs-left-panel {
          overflow: hidden;
        }

        .runs-right-panel {
          overflow: visible;
          padding-left: 24px;
          border-left: 1px solid rgba(255, 255, 255, 0.06);
        }

        .runs-right-scroll {
          flex: 1;
          min-height: 0;
        }

        .runs-config-panel {
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 24px;
          padding: 18px;
          box-sizing: border-box;
        }

        @media (max-width: 980px) {
          html,
          body {
            overflow: auto !important;
          }

          .dashboard-layout-content {
            overflow: visible;
          }

          .runs-page {
            height: auto;
            min-height: auto;
            overflow: visible;
          }

          .runs-content {
            overflow: visible;
            padding: 16px 16px 24px;
          }

          .runs-main-shell {
            height: auto;
            overflow: visible;
          }

          .runs-split-layout {
            display: flex;
            flex-direction: column;
            gap: 20px;
            height: auto;
          }

          .runs-left-panel {
            overflow: visible;
          }

          .runs-right-panel {
            overflow: visible;
            padding-left: 0;
            border-left: none;
            padding-top: 4px;
          }

          .runs-right-scroll {
            overflow: visible !important;
            max-height: none !important;
          }

          .runs-config-panel {
            min-height: auto;
            padding: 14px;
            border-radius: 18px;
          }

          .runs-config-header {
            display: none;
          }
        }

        @media (max-width: 480px) {
          .runs-content {
            padding: 12px 12px 20px;
          }

          .runs-config-panel {
            padding: 12px;
            border-radius: 14px;
          }
        }
      `}</style>

      <RunsHeader />

      <main className={`runs-content${activeRun ? ' runs-content-scrollable' : ''}`}>
        {activeRun ? (
          <div className="runs-main-shell runs-active-shell">
            <ActiveRunProgress activeRun={activeRun} onRetry={resetRun} onCancel={cancelActiveRun} canceling={canceling} />
          </div>
        ) : (
          <div className="runs-main-shell">
            <div className="runs-split-layout">
              <section className="runs-left-panel">
                <SourceStep
                  compact
                  loadingSources={loadingSources}
                  sources={sources}
                  selectedSource={effectiveSelectedSource}
                  onSelectSource={setSelectedSource}
                />
              </section>

              <section className="runs-right-panel">
                <div
                  className="runs-right-scroll"
                  style={{
                    overflowY: needsRightScroll ? 'auto' : 'hidden',
                    maxHeight: 'calc(100vh - 120px)',
                    paddingRight: needsRightScroll ? 4 : 0,
                    overscrollBehavior: 'contain',
                    paddingBottom: 24,
                  }}
                >
                <div className="runs-config-header" style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                    Configuracao da geracao
                  </h2>
                  {effectiveSelectedSource ? (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        maxWidth: '100%',
                        padding: '8px 12px',
                        borderRadius: 999,
                        background: 'rgba(99, 102, 241, 0.12)',
                        border: '1px solid rgba(99, 102, 241, 0.24)',
                        color: 'var(--text-primary)',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Fonte:</span>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {effectiveSelectedSource.filename}
                      </span>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Escolha um arquivo na coluna ao lado para liberar os passos abaixo.
                    </p>
                  )}
                </div>

                <div className="runs-config-panel">
                  <div style={{ marginBottom: 20 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                      0. Qual e sua prova?
                    </h2>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 10,
                      }}
                    >
                      {STUDY_GOALS.map(goal => {
                        const selected = studyGoal === goal.id;

                        return (
                          <button
                            key={goal.id}
                            onClick={() => handleSelectStudyGoal(goal.id)}
                            style={{
                              padding: '12px 14px',
                              borderRadius: 14,
                              border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
                              background: selected ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-raised)',
                              color: 'var(--text-primary)',
                              textAlign: 'left',
                              cursor: 'pointer',
                              minHeight: 82,
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 5 }}>
                              {goal.title}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.35 }}>
                              {goal.description}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    style={{
                      marginBottom: 20,
                      padding: 16,
                      borderRadius: 16,
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.14), rgba(34,197,94,0.06))',
                      border: '1px solid rgba(99,102,241,0.25)',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Acao principal
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#f4f4f5', marginBottom: 4 }}>
                      Gere um simulado primeiro.
                    </div>
                    <div style={{ fontSize: 12, color: '#a1a1aa', lineHeight: 1.45 }}>
                      Depois o Vimens usa seus erros para orientar a revisao e os proximos cards.
                    </div>
                  </div>

                  <ObjectiveStep
                    compact
                    isPro={tierLimits?.isPro ?? null}
                    selectedObjective={selectedObjective}
                    onSelectObjective={handleSelectObjective}
                    onRequireUpgrade={() => router.push('/upgrade')}
                    objectives={objectives}
                  />

                  {showBancaSelector && (
                    <BancaStep
                      compact
                      selectedBanca={selectedBanca}
                      onSelectBanca={setSelectedBanca}
                    />
                  )}

                  {fixedExamLabel && selectedObjective === 'questoes_banca' && (
                    <div
                      style={{
                        marginBottom: 24,
                        padding: 16,
                        background: 'rgba(99, 102, 241, 0.08)',
                        border: '1px solid rgba(99, 102, 241, 0.2)',
                        borderRadius: 16,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <span style={{ fontSize: 22 }}>🎯</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#e4e4e7' }}>
                          Estilo {profile.label} - {fixedExamLabel}
                        </div>
                        <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 2 }}>
                          As questoes serao geradas automaticamente nesse formato.
                        </div>
                      </div>
                    </div>
                  )}

                  {showDifficulty && (
                    <DifficultyStep
                      compact
                      selectedDifficulty={selectedDifficulty}
                      onSelectDifficulty={setSelectedDifficulty}
                    />
                  )}

                  <QuantityStep
                    compact
                    isPro={tierLimits?.isPro ?? null}
                    targetCount={targetCount}
                    onSetTargetCount={setTargetCount}
                    onRequireUpgrade={() => router.push('/upgrade')}
                  />

                  <GenerateRunButton
                    compact
                    selectedSource={effectiveSelectedSource}
                    selectedObjective={selectedObjective}
                    creating={creating}
                    targetCount={targetCount}
                    onCreateRun={onCreateRunQuery}
                    bancaBlocking={bancaBlocking}
                  />
                </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
