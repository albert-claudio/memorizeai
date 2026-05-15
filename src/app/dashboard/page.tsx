'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Simulado } from './components';
import { useDecks } from '@/features/dashboard/hooks/useDecks';
import { useSimulados } from '@/features/dashboard/hooks/useSimulados';
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import { BillingBanner } from '@/components/BillingBanner';
import { Icons, globalStyles } from './components';

// ── Styles ──────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#111',
  padding: 20,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.06)',
};

const labelStyle: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 8,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

const valueStyle: React.CSSProperties = {
  color: '#f4f4f5',
  fontSize: 24,
  fontWeight: 700,
  marginBottom: 4,
};

const subtextStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: '#a1a1aa',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: '#f4f4f5',
  marginBottom: 20,
};

// ── Component ───────────────────────────────────────────────────────────────

function DashboardHomeInner() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

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

  const hasDueCards = !!(stats && stats.today.dueCards > 0);
  const trendIcon = stats?.performance.trend === 'improving' ? '↑' : stats?.performance.trend === 'declining' ? '↓' : '→';
  const trendColor = stats?.performance.trend === 'improving' ? '#22c55e' : stats?.performance.trend === 'declining' ? '#ef4444' : '#a1a1aa';
  const weakItems = stats?.weakTopics.filter(t => t.isWeak) || [];
  const commandTopic = weakItems[0]?.label || stats?.reinforcement?.materia || stats?.reinforcement?.deckTitle || null;
  const commandTitle = commandTopic
    ? `Revise ${commandTopic} e faca um simulado curto`
    : hasDueCards
      ? `Revise ${stats!.today.dueCards} cards vencidos antes de treinar`
      : 'Gere um simulado a partir do seu material';
  const commandReason = commandTopic
    ? 'Esse e o ponto com maior risco no seu desempenho recente.'
    : hasDueCards
      ? 'Cards vencidos aumentam o risco de esquecimento antes da prova.'
      : 'Sem gargalo detectado ainda. Um simulado cria o primeiro diagnostico.';
  const commandCta = commandTopic || !hasDueCards ? 'Fazer simulado' : 'Revisar agora';
  const commandPath = commandTopic || !hasDueCards
    ? '/dashboard/runs'
    : (decks[0]?.id ? `/deck/${decks[0].id}` : '/dashboard/decks');

  const getSimuladoName = (sim: Simulado) => {
    let name = sim.titulo || 'Simulado';
    if (name.toLowerCase().endsWith('.pdf') || name.toLowerCase().endsWith('.docx') || name.toLowerCase().endsWith('.pptx')) {
      name = name.substring(0, name.lastIndexOf('.'));
    }
    if (name.toLowerCase().includes('documento sem t')) name = 'Simulado Gerado';
    if (!name.toLowerCase().includes('simulado')) return `Simulado de ${name}`;
    return name;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <style jsx global>{globalStyles}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 24px 0' }}>
        <BillingBanner />
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 48 }}>

        <section>
          <div style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.16) 0%, rgba(34,197,94,0.08) 100%)',
            border: '1px solid rgba(99,102,241,0.28)',
            borderRadius: 20,
            padding: '28px 32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 20,
          }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Comando do dia
              </p>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f4f4f5', letterSpacing: '-0.02em', marginBottom: 8 }}>
                {commandTitle}
              </h1>
              <p style={{ fontSize: 15, color: '#a1a1aa', marginBottom: 0, lineHeight: 1.55 }}>
                {commandReason}
                {stats?.simulados.recentAverage != null && ` Media recente em simulados: ${Math.round(stats.simulados.recentAverage * 100)}%.`}
              </p>
            </div>
            <button
              onClick={() => router.push(commandPath)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px',
                background: '#fff',
                color: '#09090b', borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer', border: 'none',
                boxShadow: '0 0 24px rgba(255,255,255,0.12)',
              }}
            >
              <Icons.Sparkles />
              {commandCta}
            </button>
          </div>
        </section>

        {/* ───── BLOCO 1: PRIORIDADE AGORA ───── */}
        <section>
          {stats?.reinforcement ? (
            <div style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(168,85,247,0.06) 100%)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 20,
              padding: '28px 32px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 20,
            }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  ⚡ Prioridade agora
                </p>
                <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.02em', marginBottom: 8 }}>
                  Revise {stats.reinforcement.materia || stats.reinforcement.deckTitle}
                </h1>
                <p style={{ fontSize: 15, color: '#a1a1aa', marginBottom: 0 }}>
                  {stats.reinforcement.reason}
                  {stats.reinforcement.overdueCards > 0 && ` · ${stats.reinforcement.overdueCards} cards atrasados`}
                </p>
              </div>
              <button
                onClick={() => router.push(`/deck/${stats.reinforcement!.deckId}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#fff', borderRadius: 12, fontWeight: 600, fontSize: 15, cursor: 'pointer', border: 'none',
                  boxShadow: '0 0 24px rgba(239,68,68,0.3)',
                }}
              >
                <Icons.Brain />
                Revisar agora
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 20 }}>
              <div>
                <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.02em', marginBottom: 8 }}>
                  Boa noite, {user?.user_metadata?.full_name?.split(' ')[0] || 'estudante'}!
                </h1>
                <p style={{ fontSize: 16, color: '#a1a1aa' }}>
                  {hasDueCards
                    ? `Você tem ${stats!.today.dueCards} cards para revisar hoje.`
                    : 'Tudo em dia! Que tal avançar no edital?'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    const firstDeck = decks[0]?.id;
                    if (firstDeck) router.push(`/deck/${firstDeck}`);
                    else router.push('/dashboard/decks');
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '14px 24px',
                    background: hasDueCards ? 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)' : 'rgba(255,255,255,0.06)',
                    color: '#fff', borderRadius: 12, fontWeight: 600, fontSize: 15, cursor: 'pointer', border: 'none',
                    boxShadow: hasDueCards ? '0 0 24px rgba(99, 102, 241, 0.4)' : 'none',
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
                    color: '#e4e4e7', borderRadius: 12, fontWeight: 500, fontSize: 15, cursor: 'pointer',
                  }}
                >
                  <Icons.Sparkles />
                  Gerar com IA
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ───── BLOCO 2: HOJE ───── */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <div style={cardStyle}>
            <p style={labelStyle}>Hoje</p>
            <h4 style={valueStyle}>
              {stats?.today.dueCards || 0} <span style={subtextStyle}>cards pendentes</span>
            </h4>
            {stats?.today.reviewedToday ? (
              <p style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>{stats.today.reviewedToday} revisados hoje</p>
            ) : (
              <p style={{ color: '#52525b', fontSize: 12, fontWeight: 600 }}>Faça sua primeira revisão hoje</p>
            )}
          </div>
          <div style={cardStyle}>
            <p style={labelStyle}>Sequência</p>
            <h4 style={valueStyle}>
              {stats?.performance.studyStreakDays || 0} <span style={subtextStyle}>dias seguidos</span>
            </h4>
            {stats?.performance.studyStreakDays ? (
              <p style={{ color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>🔥 Mantenha o ritmo!</p>
            ) : (
              <p style={{ color: '#52525b', fontSize: 12, fontWeight: 600 }}>Crie um hábito de estudos</p>
            )}
          </div>
          <div style={cardStyle}>
            <p style={labelStyle}>Previsão</p>
            <h4 style={valueStyle}>
              {stats?.forecast.dueNext7d || 0} <span style={subtextStyle}>cards nos próximos 7 dias</span>
            </h4>
            {stats?.forecast.dueTomorrow ? (
              <p style={{ color: '#8b5cf6', fontSize: 12, fontWeight: 600 }}>{stats.forecast.dueTomorrow} amanhã</p>
            ) : (
              <p style={{ color: '#52525b', fontSize: 12, fontWeight: 600 }}>Nenhum card amanhã</p>
            )}
          </div>
        </section>

        {/* ───── BLOCO 3: ONDE VOCÊ MAIS ERRA ───── */}
        <section>
          <h2 style={sectionTitle}>Onde Você Mais Erra</h2>
          {weakItems.length > 0 ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {weakItems.slice(0, 5).map(wt => (
                <div key={wt.key} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', background: 'rgba(239,68,68,0.04)',
                  borderRadius: 12, border: '1px solid rgba(239,68,68,0.12)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: wt.type === 'materia' ? '#a78bfa' : '#60a5fa',
                      background: wt.type === 'materia' ? 'rgba(167,139,250,0.1)' : 'rgba(96,165,250,0.1)',
                      padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase',
                    }}>
                      {wt.type === 'materia' ? 'Matéria' : 'Tema'}
                    </span>
                    <span style={{ color: '#f4f4f5', fontWeight: 600, fontSize: 15 }}>{wt.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{wt.errorRate7d}% erro 7d</span>
                    {wt.avgStability < 2 && <span style={{ color: '#94a3b8' }}>📉 Est. {wt.avgStability}d</span>}
                    {wt.avgLapses > 3 && <span style={{ color: '#f87171' }}>↩️ {wt.avgLapses} lapsos</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
              <p style={{ color: '#22c55e', fontWeight: 500, fontSize: 15 }}>✅ Sem fraquezas detectadas. Continue assim!</p>
            </div>
          )}
        </section>

        {/* ───── BLOCO 4: O QUE PRECISA REFORÇAR ───── */}
        {stats && stats.focusDecks.length > 0 && (
          <section>
            <h2 style={sectionTitle}>O Que Precisa Reforçar</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {stats.focusDecks.slice(0, 3).map(fd => (
                <div key={fd.deckId} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: 16, background: 'rgba(239,68,68,0.05)',
                  borderRadius: 12, border: '1px solid rgba(239,68,68,0.15)',
                }}>
                  <div>
                    <h4 style={{ fontWeight: 600, color: '#f4f4f5', fontSize: 15, marginBottom: 4 }}>{fd.deckTitle}</h4>
                    {(fd.materia || fd.tema) && (
                      <p style={{ fontSize: 12, color: '#71717a', marginBottom: 6 }}>{[fd.materia, fd.tema].filter(Boolean).join(' › ')}</p>
                    )}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                      {fd.overdueCards > 0 && <span style={{ color: '#ef4444' }}>⏰ {fd.overdueCards} atrasados</span>}
                      {fd.leechCards > 0 && <span style={{ color: '#f59e0b' }}>🩸 {fd.leechCards} leeches</span>}
                      {fd.errorRate7d > 20 && <span style={{ color: '#fb923c' }}>❌ {fd.errorRate7d}% erro 7d</span>}
                      {fd.avgDifficulty > 6 && <span style={{ color: '#c084fc' }}>🔥 Dif. {fd.avgDifficulty}</span>}
                      {fd.avgLapses > 2 && <span style={{ color: '#f87171' }}>↩️ {fd.avgLapses} lapsos/card</span>}
                      {fd.avgStability < 3 && <span style={{ color: '#94a3b8' }}>📉 Est. {fd.avgStability}d</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/deck/${fd.deckId}`)}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'center' }}
                  >
                    Revisar →
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ───── BLOCO 5: EVOLUÇÃO ───── */}
        <section>
          <h2 style={sectionTitle}>Evolução</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div style={cardStyle}>
              <p style={labelStyle}>Aproveitamento (7 dias)</p>
              <h4 style={valueStyle}>
                {stats?.performance.recentPerformance7d != null ? `${Math.round(stats.performance.recentPerformance7d * 100)}%` : '--'}
              </h4>
            </div>
            <div style={cardStyle}>
              <p style={labelStyle}>Aproveitamento (30 dias)</p>
              <h4 style={valueStyle}>
                {stats?.performance.recentPerformance30d != null ? `${Math.round(stats.performance.recentPerformance30d * 100)}%` : '--'}
              </h4>
            </div>
            <div style={cardStyle}>
              <p style={labelStyle}>Tendência</p>
              <h4 style={{ ...valueStyle, color: trendColor }}>
                {trendIcon} {stats?.performance.trend === 'improving' ? 'Melhorando' : stats?.performance.trend === 'declining' ? 'Piorando' : 'Estável'}
              </h4>
            </div>
          </div>
        </section>

        {/* ───── BLOCO 6: SIMULADOS ───── */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
            <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Simulados</h2>
            <button onClick={() => router.push('/dashboard/simulados')} style={{ background: 'transparent', border: 'none', color: '#a1a1aa', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Ver todos →
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div style={cardStyle}>
              <p style={labelStyle}>Último resultado</p>
              <h4 style={valueStyle}>
                {stats?.simulados.lastScore != null ? `${Math.round(stats.simulados.lastScore * 100)}%` : '--'}
              </h4>
            </div>
            <div style={cardStyle}>
              <p style={labelStyle}>Média recente</p>
              <h4 style={valueStyle}>
                {stats?.simulados.recentAverage != null ? `${Math.round(stats.simulados.recentAverage * 100)}%` : '--'}
              </h4>
            </div>
          </div>
        </section>

        {/* ───── BLOCO 7: SEUS DECKS (compacto) ───── */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
            <div>
              <h2 style={{ ...sectionTitle, marginBottom: 4 }}>Seus Decks</h2>
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
                <div key={deck.id} onClick={() => router.push(`/deck/${deck.id}`)} style={{ ...cardStyle, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f4f4f5', marginBottom: 6 }}>{deck.title}</h3>
                    {(deck.concurso || deck.materia) && (
                      <p style={{ fontSize: 13, color: '#71717a' }}>{[deck.concurso, deck.materia].filter(Boolean).join(' • ')}</p>
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

        {/* ───── BLOCO 8: SEUS SIMULADOS (compacto) ───── */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
            <div>
              <h2 style={{ ...sectionTitle, marginBottom: 4 }}>Seus Simulados</h2>
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
                <div key={simulado.id} onClick={() => router.push(`/simulado/${simulado.id}`)} style={{ ...cardStyle, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
