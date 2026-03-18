'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Deck } from '@/lib/types';
import type { Simulado } from './components';
import { useDecks } from '@/features/dashboard/hooks/useDecks';
import { useSimulados } from '@/features/dashboard/hooks/useSimulados';
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import { BillingBanner } from '@/components/BillingBanner';
import { Icons, globalStyles } from './components';

function DashboardHomeInner() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Centralized Data Loading
  const { decks, cardCounts, loading: loadingDecks } = useDecks(user?.id);
  const { simulados, loading: loadingSimulados } = useSimulados(user?.id);
  const { stats, loading: loadingStats } = useDashboardStats(user?.id);

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      setUser(user);
      setLoadingUser(false);
    };
    checkUser();
  }, []);

  const isLoading = loadingUser || loadingDecks || loadingSimulados || loadingStats;

  if (isLoading) {
    return (
      <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style jsx global>{globalStyles}</style>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // LÓGICA DE PRIORIDADE: Continuar Estudando
  // 1. Deck com revisão vencida (pendente)
  // 2. Simulado em andamento
  // 3. Último deck usado
  // 4. Último simulado concluído
  // --------------------------------------------------------------------------
  
  const priorityItems: Array<{ type: 'deck' | 'simulado'; item: Deck | Simulado; priorityTarget: string }> = [];
  
  // 1. Deck com revisão vencida. Usaremos os decks listados no 'focusDecks' do stats ou procuraremos.
  const overdueDeckId = stats?.focusDecks.find(fd => fd.overdueCards > 0)?.deckId;
  const overdueDeck = decks.find(d => d.id === overdueDeckId);
  if (overdueDeck) priorityItems.push({ type: 'deck', item: overdueDeck, priorityTarget: 'Revisão pendente' });

  // 2. Simulado em andamento (isFinalized === false)
  const inProgressSimulados = simulados.filter(s => s.status !== 'concluido').sort((a,b) => b.created_at - a.created_at);
  if (inProgressSimulados.length > 0) {
    priorityItems.push({ type: 'simulado', item: inProgressSimulados[0], priorityTarget: 'Em andamento' });
  }

  // 3. Último deck usado (excluding the one already added)
  const lastUsedDecks = [...decks].sort((a,b) => (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0)).filter(d => d.id !== overdueDeckId);
  if (lastUsedDecks.length > 0) {
    priorityItems.push({ type: 'deck', item: lastUsedDecks[0], priorityTarget: 'Último usado' });
  }

  // 4. Último simulado concluído
  const completedSimulados = simulados.filter(s => s.status === 'concluido' && s.id !== inProgressSimulados[0]?.id).sort((a,b) => b.created_at - a.created_at);
  if (completedSimulados.length > 0) {
    priorityItems.push({ type: 'simulado', item: completedSimulados[0], priorityTarget: 'Último concluído' });
  }

  const topPriorityItems = priorityItems.slice(0, 4);

  // Prefix naming logic para Simulados (Smarter fallback)
  const getSimuladoName = (sim: Simulado) => {
    let name = sim.titulo || 'Simulado';
    if (name.toLowerCase().endsWith('.pdf') || name.toLowerCase().endsWith('.docx') || name.toLowerCase().endsWith('.pptx')) {
      name = name.substring(0, name.lastIndexOf('.'));
    }
    // Remove "Documento sem titulo" and fallback
    if (name.toLowerCase().includes('documento sem t')) {
      name = `Simulado Gerado`;
    }
    if (!name.toLowerCase().includes('simulado')) {
      return `Simulado de ${name}`;
    }
    return name;
  };

  const hasDueCards = !!(stats && stats.today.dueCards > 0);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <style jsx global>{globalStyles}</style>

      {/* Checkout/Billing Banner */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 24px 0' }}>
        <BillingBanner />
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 48 }}>
        
        {/* BLOCO 1: HERO */}
        <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 20 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.02em', marginBottom: 8 }}>
              Boa noite, {user?.user_metadata?.full_name?.split(' ')[0] || 'estudante'}!
            </h1>
            <p style={{ fontSize: 16, color: '#a1a1aa' }}>
              {hasDueCards 
                ? `Você tem ${stats.today.dueCards} cards para revisar hoje.` 
                : 'Você não tem cards pendentes hoje. Que tal avançar no edital?'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                const firstDeck = stats?.focusDecks[0]?.deckId || decks[0]?.id;
                if (firstDeck) router.push(`/deck/${firstDeck}`);
                else router.push('/dashboard/decks');
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '14px 24px',
                background: hasDueCards ? 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)' : 'rgba(255,255,255,0.06)',
                color: '#fff', borderRadius: 12, fontWeight: 600, fontSize: 15, cursor: 'pointer', border: 'none',
                boxShadow: hasDueCards ? '0 0 24px rgba(99, 102, 241, 0.4)' : 'none',
                transition: 'transform 0.2s'
              }}
            >
              <Icons.Brain />
              {hasDueCards ? 'Continuar revisão' : 'Ver todos os decks'}
            </button>
            <button
              onClick={() => router.push('/dashboard/runs')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '14px 24px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#e4e4e7', borderRadius: 12, fontWeight: 500, fontSize: 15, cursor: 'pointer'
              }}
            >
              <Icons.Sparkles />
              Gerar com IA
            </button>
          </div>
        </section>

        {/* BLOCO 2: MÉTRICAS RÁPIDAS */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
           <div style={{ background: '#111', padding: 20, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ color: '#a1a1aa', fontSize: 13, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hoje</p>
              <h4 style={{ color: '#f4f4f5', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                {stats?.today.dueCards || 0} <span style={{ fontSize: 13, fontWeight: 500, color: '#a1a1aa' }}>cards pendentes</span>
              </h4>
             {stats?.today.reviewedToday ? (
               <p style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>{stats.today.reviewedToday} revisados hoje</p>
             ) : (
               <p style={{ color: '#52525b', fontSize: 12, fontWeight: 600 }}>Faça sua primeira revisão hoje</p>
             )}
           </div>
           
           <div style={{ background: '#111', padding: 20, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ color: '#a1a1aa', fontSize: 13, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sequência</p>
              <h4 style={{ color: '#f4f4f5', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                {stats?.performance.studyStreakDays || 0} <span style={{ fontSize: 13, fontWeight: 500, color: '#a1a1aa' }}>dias seguidos</span>
              </h4>
             {stats?.performance.studyStreakDays ? (
               <p style={{ color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>🔥 Mantenha o ritmo!</p>
             ) : (
               <p style={{ color: '#52525b', fontSize: 12, fontWeight: 600 }}>Crie um hábito de estudos</p>
             )}
           </div>

           <div style={{ background: '#111', padding: 20, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ color: '#a1a1aa', fontSize: 13, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aproveitamento (7d)</p>
              <h4 style={{ color: '#f4f4f5', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                {stats?.performance.recentPerformance7d !== null && stats?.performance.recentPerformance7d !== undefined ? `${Math.round(stats.performance.recentPerformance7d * 100)}%` : '--'} <span style={{ fontSize: 13, fontWeight: 500, color: '#a1a1aa' }}>de acerto</span>
              </h4>
             {stats?.performance.recentPerformance7d !== null && stats?.performance.recentPerformance7d !== undefined ? (
               <p style={{ color: '#8b5cf6', fontSize: 12, fontWeight: 600 }}>Média recente</p>
             ) : (
               <p style={{ color: '#52525b', fontSize: 12, fontWeight: 600 }}>Sem dados de performance</p>
             )}
           </div>
        </section>

        {/* BLOCO 3: CONTINUAR ESTUDANDO */}
        {topPriorityItems.length > 0 && (
          <section>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#f4f4f5', marginBottom: 20 }}>Continuar Estudando</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {topPriorityItems.map((pi, i) => {
                if (pi.type === 'deck') {
                  const d = pi.item as Deck;
                  return (
                    <div key={`prio-d-${d.id}-${i}`} onClick={() => router.push(`/deck/${d.id}`)} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, cursor: 'pointer', transition: 'border-color 0.2s ease, background 0.2s' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: pi.priorityTarget === 'Revisão pendente' ? '#ef4444' : '#a1a1aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {pi.priorityTarget}
                      </div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f4f4f5', marginBottom: 4 }}>{d.title}</h3>
                      <p style={{ fontSize: 13, color: '#71717a' }}>{cardCounts[d.id] || 0} cards adicionados</p>
                    </div>
                  );
                } else {
                  const s = pi.item as Simulado;
                  return (
                    <div key={`prio-s-${s.id}-${i}`} onClick={() => router.push(`/simulado/${s.id}`)} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, cursor: 'pointer', transition: 'border-color 0.2s ease, background 0.2s' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: pi.priorityTarget === 'Em andamento' ? '#F59E0B' : '#a1a1aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {pi.priorityTarget}
                      </div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f4f4f5', marginBottom: 4 }}>{getSimuladoName(s)}</h3>
                      <p style={{ fontSize: 13, color: '#71717a' }}>Simulado • {s.total_questoes || 0} questões</p>
                    </div>
                  );
                }
              })}
            </div>
          </section>
        )}

        {/* BLOCO 4: SEUS DECKS (Prévia) */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: '#f4f4f5', marginBottom: 4 }}>Seus Decks</h2>
              <p style={{ fontSize: 14, color: '#71717a' }}>{decks.length === 0 ? 'Nenhum deck criado' : `${decks.length} deck(s) totais`}</p>
            </div>
            <button onClick={() => router.push('/dashboard/decks')} style={{ background: 'transparent', border: 'none', color: '#a1a1aa', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Ver todos →
            </button>
          </div>
          {decks.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, textAlign: 'center' }}>
              <p style={{ color: '#a1a1aa', marginBottom: 16 }}>Você ainda não tem nenhum deck.</p>
              <button onClick={() => router.push('/dashboard/decks')} style={{ background: '#fff', color: '#000', padding: '10px 20px', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer' }}>Criar Deck</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {decks.slice(0, 4).map(deck => (
                <div key={deck.id} onClick={() => router.push(`/deck/${deck.id}`)} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 16 }}>
                   <div>
                     <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f4f4f5', marginBottom: 6 }}>{deck.title}</h3>
                     {(deck.concurso || deck.materia) && (
                       <p style={{ fontSize: 13, color: '#71717a', marginBottom: 0 }}>{[deck.concurso, deck.materia].filter(Boolean).join(' • ')}</p>
                     )}
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#a1a1aa', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 6 }}>
                        {cardCounts[deck.id] || 0} CARDS
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#A855F7' }}>Estudar →</span>
                   </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* BLOCO 5: SEUS SIMULADOS (Prévia) */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: '#f4f4f5', marginBottom: 4 }}>Seus Simulados</h2>
              <p style={{ fontSize: 14, color: '#71717a' }}>{simulados.length === 0 ? 'Nenhum simulado gerado' : `${simulados.length} simulado(s) totais`}</p>
            </div>
            <button onClick={() => router.push('/dashboard/simulados')} style={{ background: 'transparent', border: 'none', color: '#a1a1aa', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Ver todos →
            </button>
          </div>
          {simulados.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, textAlign: 'center' }}>
              <p style={{ color: '#a1a1aa', marginBottom: 16 }}>Gere um simulado usando a IA.</p>
              <button onClick={() => router.push('/dashboard/runs')} style={{ background: '#fff', color: '#000', padding: '10px 20px', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer' }}>Ir para gerador</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {simulados.slice(0, 4).map(simulado => (
                <div key={simulado.id} onClick={() => router.push(`/simulado/${simulado.id}`)} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 16 }}>
                   <div>
                     <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f4f4f5', marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                       {getSimuladoName(simulado)}
                     </h3>
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#a1a1aa', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 6 }}>
                        {simulado.total_questoes || 0} QUESTÕES
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: simulado.status === 'concluido' ? '#22c55e' : '#F59E0B' }}>
                        {simulado.status === 'concluido' ? 'Ver resultado' : 'Continuar →'}
                      </span>
                   </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

export default function DashboardHome() {
  return (
    <Suspense>
      <DashboardHomeInner />
    </Suspense>
  );
}
