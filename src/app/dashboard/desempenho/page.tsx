'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import { globalStyles } from '../components';

function DesempenhoPageInner() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

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

  if (loadingUser || loadingStats) {
    return (
      <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style jsx global>{globalStyles}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <style jsx global>{globalStyles}</style>
      <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f4f4f5', marginBottom: 8, letterSpacing: '-0.03em' }}>Desempenho</h1>
      <p style={{ color: '#71717a', marginBottom: 40, fontSize: 15 }}>Acompanhe sua evolução e métricas de estudo</p>
      
      {stats ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* Main MVP Block adapted for full page */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
             <div style={{ background: '#111', padding: 24, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ color: '#a1a1aa', fontSize: 13, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hoje</p>
                <h4 style={{ color: '#f4f4f5', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                  {stats.today.dueCards} <span style={{ fontSize: 14, fontWeight: 500, color: '#a1a1aa' }}>pendentes</span>
                </h4>
                <p style={{ color: '#22c55e', fontSize: 13, fontWeight: 500 }}>{stats.today.reviewedToday} revisados hoje</p>
             </div>
             <div style={{ background: '#111', padding: 24, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ color: '#a1a1aa', fontSize: 13, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aproveitamento (7d)</p>
                <h4 style={{ color: '#f4f4f5', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                  {stats.performance.recentPerformance7d !== null ? `${Math.round(stats.performance.recentPerformance7d * 100)}%` : '--'} <span style={{ fontSize: 14, fontWeight: 500, color: '#a1a1aa' }}>de acerto</span>
                </h4>
             </div>
             <div style={{ background: '#111', padding: 24, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ color: '#a1a1aa', fontSize: 13, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Consistência</p>
                <h4 style={{ color: '#f4f4f5', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                  {stats.performance.studyStreakDays} <span style={{ fontSize: 14, fontWeight: 500, color: '#a1a1aa' }}>dias seguidos</span>
                </h4>
             </div>
          </div>

          <div style={{ background: '#111', padding: 24, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#f4f4f5', marginBottom: 16 }}>Atenção Necessária (Decks Críticos)</h3>
            {stats.focusDecks.length > 0 ? (
               <div style={{ display: 'grid', gap: 12 }}>
                 {stats.focusDecks.map(fd => (
                   <div key={fd.deckId} style={{ display: 'flex', justifyContent: 'space-between', padding: 16, background: 'rgba(239, 68, 68, 0.05)', borderRadius: 12, border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                     <div>
                       <h4 style={{ fontWeight: 600, color: '#f4f4f5', fontSize: 15, marginBottom: 4 }}>{fd.deckTitle}</h4>
                       <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#ef4444' }}>
                          {fd.overdueCards > 0 && <span>• {fd.overdueCards} atrasados</span>}
                          {fd.leechCards > 0 && <span>• {fd.leechCards} críticos</span>}
                       </div>
                     </div>
                     <button onClick={() => router.push(`/deck/${fd.deckId}`)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontWeight: 600, cursor: 'pointer' }}>Revisar →</button>
                   </div>
                 ))}
               </div>
            ) : (
               <p style={{ color: '#22c55e', fontWeight: 500 }}>Nenhum deck crítico ou atrasado. Tudo em dia!</p>
            )}
          </div>
        </div>
      ) : (
        <p style={{ color: '#a1a1aa' }}>Nenhum dado encontrado.</p>
      )}
    </div>
  );
}

export default function DesempenhoPage() {
  return (
    <Suspense>
      <DesempenhoPageInner />
    </Suspense>
  );
}
