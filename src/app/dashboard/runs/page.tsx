'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { createRun, getUserCredits, type UserCreditsInfo } from '@/app/actions/createRun';
import type { User, RealtimeChannel } from '@supabase/supabase-js';
import type { Source, Run, RunObjective } from '@/lib/types';

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  ArrowLeft: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12,19 5,12 12,5"/>
    </svg>
  ),
  Sparkles: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  ),
  Loader: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ),
  Check: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  ),
  Zap: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  BookOpen: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  ),
  Scale: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
      <path d="M7 21h10"/>
      <path d="M12 3v18"/>
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
    </svg>
  ),
  File: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
    </svg>
  ),
  Coins: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6"/>
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18"/>
      <path d="M7 6h1v4"/>
      <path d="m16.71 13.88.7.71-2.82 2.82"/>
    </svg>
  ),
  Clock: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
};

// Objective options
const OBJECTIVES: { id: RunObjective; title: string; description: string; icon: React.ReactNode; model: string; color: string }[] = [
  {
    id: 'flashcards',
    title: 'Flashcards',
    description: 'Gera flashcards rápidos para memorização de conceitos e definições',
    icon: <Icons.Zap />,
    model: 'Groq (Llama 3)',
    color: '#22C55E',
  },
  {
    id: 'questoes_banca',
    title: 'Questões de Banca',
    description: 'Simula questões no estilo FCC, CESPE, FGV com pegadinhas reais',
    icon: <Icons.BookOpen />,
    model: 'Gemini 2.5 Flash',
    color: '#6366F1',
  },
  {
    id: 'logica_juridica',
    title: 'Lógica Jurídica',
    description: 'Exercícios de A vs B, silogismos e casos práticos',
    icon: <Icons.Scale />,
    model: 'Gemini 2.5 Flash',
    color: '#F59E0B',
  },
];

export default function RunsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Sources
  const [sources, setSources] = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  
  // Objective
  const [selectedObjective, setSelectedObjective] = useState<RunObjective | null>(null);
  const [targetCount, setTargetCount] = useState(10);
  
  // Credits
  const [credits, setCredits] = useState<UserCreditsInfo | null>(null);
  
  // Run creation
  const [creating, setCreating] = useState(false);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  
  // Realtime
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }
      
      setUser(user);
      setLoading(false);
      
      // Fetch sources
      await fetchSources(user.id);
      
      // Fetch credits
      const userCredits = await getUserCredits();
      setCredits(userCredits);
    };

    init();
    
    return () => {
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [router]);

  const fetchSources = async (userId: string) => {
    setLoadingSources(true);
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('sources')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['concluido', 'ready'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setSources(data);
    }
    setLoadingSources(false);
  };

  // Polling interval ref
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Poll for run updates (more reliable than Realtime)
  const startPolling = (runId: string) => {
    console.log('[UI] Starting polling for run:', runId);
    
    const interval = setInterval(async () => {
      const supabase = createClient();
      const { data: run, error } = await supabase
        .from('runs')
        .select('*')
        .eq('id', runId)
        .single();
      
      if (error) {
        console.error('[UI] Polling error:', error);
        return;
      }
      
      if (run) {
        console.log('[UI] Poll update:', run.status, 'items:', run.items_generated, 'deck_id:', run.deck_id, 'simulado_id:', run.simulado_id, 'objective:', run.objective);
        setActiveRun(run);
        
        if (run.status === 'concluido') {
          console.log('[UI] Run completed! Redirecting...');
          clearInterval(interval);
          setPollingInterval(null);
          
          // Success! Redirect based on objective type
          setTimeout(() => {
            if (run.objective === 'questoes_banca' && run.simulado_id) {
              // Simulados use the new simulado_id column
              router.push(`/simulado/${run.simulado_id}`);
            } else if (run.deck_id) {
              // Flashcards use deck_id
              router.push(`/deck/${run.deck_id}`);
            } else {
              router.push('/dashboard');
            }
          }, 1500);
        } else if (run.status === 'erro') {
          console.log('[UI] Run failed:', run.error_message);
          clearInterval(interval);
          setPollingInterval(null);
          setCreating(false);
        }
      }
    }, 2000); // Poll every 2 seconds
    
    setPollingInterval(interval);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [pollingInterval, channel]);

  const handleCreateRun = async () => {
    // Flashcards are free, only simulados require credits
    const requiresCredits = selectedObjective !== 'flashcards';
    if (!selectedSource || !selectedObjective) return;
    if (requiresCredits && (!credits || credits.totalCredits <= 0)) return;
    
    setCreating(true);
    console.log('[UI] Creating run...');
    
    const result = await createRun(
      selectedSource.id,
      selectedObjective,
      'auto',
      targetCount
    );
    
    if (result.success && result.runId) {
      console.log('[UI] Run created:', result.runId);
      
      // Start polling for updates
      startPolling(result.runId);
      
      // Set initial run state
      setActiveRun({
        id: result.runId,
        user_id: user!.id,
        source_id: selectedSource.id,
        deck_id: null,
        objective: selectedObjective,
        model_preference: 'auto',
        target_count: targetCount,
        status: 'pendente',
        model_used: null,
        attempt_count: 0,
        items_generated: 0,
        error_message: null,
        started_at: null,
        completed_at: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        deleted_at: null,
      });
      
      // Deduct from local credits display (only for simulados)
      if (requiresCredits && credits) {
        setCredits({
          ...credits,
          planRunsRemaining: Math.max(0, credits.planRunsRemaining - 1),
          totalCredits: credits.totalCredits - 1,
        });
      }
    } else {
      alert(result.error || 'Erro ao criar run');
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
      }}>
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

      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-raised)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link
            href="/dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'var(--bg-muted)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}
          >
            <Icons.ArrowLeft />
          </Link>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Gerar com IA</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Escolha uma fonte e o tipo de conteúdo
            </p>
          </div>
        </div>
        
        {/* Credits Badge */}
        {credits && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: 'var(--bg-muted)',
            borderRadius: 100,
            border: '1px solid var(--border)',
          }}>
            <Icons.Coins />
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {credits.totalCredits} créditos
            </span>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        
        {/* Active Run Progress */}
        {activeRun && (
          <div style={{
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-accent)',
            borderRadius: 20,
            padding: 32,
            marginBottom: 32,
            textAlign: 'center',
          }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: activeRun.status === 'concluido' 
                ? 'rgba(34, 197, 94, 0.1)' 
                : activeRun.status === 'erro'
                ? 'rgba(239, 68, 68, 0.1)'
                : 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              color: activeRun.status === 'concluido' 
                ? 'var(--success)' 
                : activeRun.status === 'erro'
                ? 'var(--error)'
                : 'var(--accent)',
            }}>
              {activeRun.status === 'concluido' ? (
                <Icons.Check />
              ) : activeRun.status === 'erro' ? (
                <span style={{ fontSize: 32 }}>!</span>
              ) : (
                <Icons.Sparkles />
              )}
            </div>
            
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
              {activeRun.status === 'pendente' && '⏳ Preparando...'}
              {activeRun.status === 'processando' && '🤖 Gerando com IA...'}
              {activeRun.status === 'concluido' && '✅ Pronto!'}
              {activeRun.status === 'erro' && '❌ Erro'}
            </h2>
            
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
              {activeRun.status === 'pendente' && 'Iniciando processamento...'}
              {activeRun.status === 'processando' && (
                <>
                  Modelo: <strong>{activeRun.model_used || 'Selecionando...'}</strong>
                  {activeRun.started_at && (
                    <> • ⏱️ {Math.round((Date.now() - activeRun.started_at) / 1000)}s</>
                  )}
                </>
              )}
              {activeRun.status === 'concluido' && (
                <>
                  🎉 <strong>{activeRun.items_generated}</strong> itens gerados! Redirecionando...
                </>
              )}
              {activeRun.status === 'erro' && (activeRun.error_message || 'Falha na geração')}
            </p>
            
            {(activeRun.status === 'pendente' || activeRun.status === 'processando') && (
              <div style={{
                width: '100%',
                height: 6,
                background: 'var(--bg-muted)',
                borderRadius: 3,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: activeRun.status === 'processando' 
                    ? (activeRun.model_used ? '70%' : '40%') 
                    : '15%',
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--accent), #7C3AED)',
                  borderRadius: 3,
                  transition: 'width 0.8s ease',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              </div>
            )}
            
            {activeRun.status === 'erro' && (
              <button
                onClick={() => {
                  setActiveRun(null);
                  setCreating(false);
                }}
                style={{
                  marginTop: 16,
                  padding: '12px 24px',
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}

        {/* Step 1: Select Source */}
        {!activeRun && (
          <>
            <div style={{ marginBottom: 32 }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                marginBottom: 16,
              }}>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>
                  1. Escolha a fonte
                </h2>
                <Link
                  href="/dashboard/upload"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 18px',
                    background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                    borderRadius: 10,
                    color: 'white',
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                    boxShadow: '0 2px 12px rgba(34, 197, 94, 0.3)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Novo PDF
                </Link>
              </div>
              
              {loadingSources ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Icons.Loader />
                </div>
              ) : sources.length === 0 ? (
                <div style={{
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 40,
                  textAlign: 'center',
                }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'rgba(34, 197, 94, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    color: '#22C55E',
                  }}>
                    <Icons.File />
                  </div>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: 8, fontSize: 15, fontWeight: 500 }}>
                    Nenhum PDF processado ainda
                  </p>
                  <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13 }}>
                    Faça upload de um PDF para começar a gerar conteúdo com IA
                  </p>
                  <Link
                    href="/dashboard/upload"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '14px 28px',
                      background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                      borderRadius: 12,
                      color: 'white',
                      textDecoration: 'none',
                      fontSize: 15,
                      fontWeight: 600,
                      boxShadow: '0 4px 16px rgba(34, 197, 94, 0.3)',
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Fazer Upload de PDF
                  </Link>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gap: 12,
                }}>
                  {sources.map(source => (
                    <button
                      key={source.id}
                      onClick={() => setSelectedSource(source)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: 20,
                        background: selectedSource?.id === source.id 
                          ? 'rgba(99, 102, 241, 0.1)' 
                          : 'var(--bg-raised)',
                        border: selectedSource?.id === source.id 
                          ? '2px solid var(--accent)' 
                          : '1px solid var(--border)',
                        borderRadius: 14,
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: selectedSource?.id === source.id 
                          ? 'var(--accent)' 
                          : 'var(--bg-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: selectedSource?.id === source.id 
                          ? 'white' 
                          : 'var(--text-muted)',
                      }}>
                        <Icons.File />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                          {source.filename}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          {source.total_pages ? `${source.total_pages} páginas` : 'Processado'}
                        </p>
                      </div>
                      {selectedSource?.id === source.id && (
                        <div style={{ color: 'var(--accent)' }}>
                          <Icons.Check />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Select Objective */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
                2. Tipo de conteúdo
              </h2>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}>
                {OBJECTIVES.map(obj => (
                  <button
                    key={obj.id}
                    onClick={() => setSelectedObjective(obj.id)}
                    style={{
                      padding: 24,
                      background: selectedObjective === obj.id 
                        ? `${obj.color}15` 
                        : 'var(--bg-raised)',
                      border: selectedObjective === obj.id 
                        ? `2px solid ${obj.color}` 
                        : '1px solid var(--border)',
                      borderRadius: 16,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: selectedObjective === obj.id 
                        ? obj.color 
                        : 'var(--bg-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: selectedObjective === obj.id 
                        ? 'white' 
                        : 'var(--text-muted)',
                      marginBottom: 16,
                    }}>
                      {obj.icon}
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                      {obj.title}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                      {obj.description}
                    </p>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}>
                      <Icons.Clock />
                      {obj.model}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Quantity */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
                3. Quantidade
              </h2>
              
              <div style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
              }}>
                {[5, 10, 15, 20, 30].map(count => (
                  <button
                    key={count}
                    onClick={() => setTargetCount(count)}
                    style={{
                      padding: '12px 24px',
                      background: targetCount === count 
                        ? 'var(--accent)' 
                        : 'var(--bg-raised)',
                      border: targetCount === count 
                        ? 'none' 
                        : '1px solid var(--border)',
                      borderRadius: 10,
                      color: targetCount === count 
                        ? 'white' 
                        : 'var(--text-primary)',
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {count} itens
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleCreateRun}
              disabled={!selectedSource || !selectedObjective || creating || (selectedObjective !== 'flashcards' && (credits?.totalCredits ?? 0) <= 0)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '20px 32px',
                background: (selectedSource && selectedObjective && !creating && (selectedObjective === 'flashcards' || (credits?.totalCredits ?? 0) > 0))
                  ? 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)'
                  : 'var(--bg-muted)',
                border: 'none',
                borderRadius: 16,
                color: (selectedSource && selectedObjective) ? 'white' : 'var(--text-muted)',
                fontSize: 18,
                fontWeight: 600,
                cursor: (selectedSource && selectedObjective && !creating) ? 'pointer' : 'not-allowed',
                boxShadow: (selectedSource && selectedObjective && !creating)
                  ? '0 4px 20px rgba(99, 102, 241, 0.3)'
                  : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {creating ? (
                <>
                  <Icons.Loader />
                  Iniciando...
                </>
              ) : (selectedObjective !== 'flashcards' && (credits?.totalCredits ?? 0) <= 0) ? (
                'Sem créditos disponíveis'
              ) : (
                <>
                  <Icons.Sparkles />
                  Gerar {targetCount} {selectedObjective === 'flashcards' ? 'Flashcards' : selectedObjective === 'questoes_banca' ? 'Questões' : 'Exercícios'}
                </>
              )}
            </button>

            {/* Helper text */}
            {selectedSource && selectedObjective && (
              <p style={{ 
                textAlign: 'center', 
                marginTop: 16, 
                fontSize: 13, 
                color: 'var(--text-muted)' 
              }}>
                {selectedObjective === 'flashcards' 
                  ? '✨ Flashcards são gratuitos!'
                  : `Esta ação consumirá 1 crédito • Restam ${credits?.totalCredits ?? 0} créditos`
                }
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
