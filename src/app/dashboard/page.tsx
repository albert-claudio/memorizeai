'use client';

import { Suspense, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { useDecks } from '@/features/dashboard/hooks/useDecks';
import { useSimulados } from '@/features/dashboard/hooks/useSimulados';
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import { StudyDashboard } from '@/features/dashboard/components/StudyDashboard';
import { globalStyles } from './components';
import { tokens } from '@/features/dashboard/components/StudyDashboard/tokens';

function DashboardHomeInner() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const { decks, cardCounts, loading: loadingDecks } = useDecks(user?.id);
  const { simulados, loading: loadingSimulados } = useSimulados(user?.id);
  const { stats, loading: loadingStats } = useDashboardStats(user?.id);

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        window.location.href = '/login';
        return;
      }
      setUser(authUser);
      setLoadingUser(false);
    };
    checkUser();
  }, []);

  const isLoading = loadingUser || loadingDecks || loadingSimulados || loadingStats;

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 64px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: tokens.pageBg,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: tokens.accent,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style jsx global>{globalStyles}</style>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: tokens.textSecondary, background: tokens.pageBg }}>
        Não foi possível carregar os dados do dashboard.
      </div>
    );
  }

  const userName = user?.user_metadata?.full_name?.split(' ')[0];

  return (
    <StudyDashboard
      stats={stats}
      decks={decks}
      cardCounts={cardCounts}
      simulados={simulados}
      userName={userName}
    />
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardHomeInner />
    </Suspense>
  );
}
