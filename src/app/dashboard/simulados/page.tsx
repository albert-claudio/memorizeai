'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { useSimulados } from '@/features/dashboard/hooks/useSimulados';
import { Icons, SimuladoCard, globalStyles } from '../components';

function SimuladosPageInner() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const { simulados, loading: loadingSimulados } = useSimulados(user?.id);

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

  if (loadingUser) {
    return (
      <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style jsx global>{globalStyles}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', padding: '32px 24px' }}>
      <style jsx global>{globalStyles}</style>
      <main style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.03em', marginBottom: 8 }}>Simulados</h1>
            <p style={{ color: '#71717a', fontSize: 15 }}>{simulados.length} simulado{simulados.length !== 1 ? 's' : ''} gerado{simulados.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/runs')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '14px 22px',
              background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)',
              border: 'none', borderRadius: 12, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 0 24px rgba(99, 102, 241, 0.4)'
            }}
          >
            <Icons.Sparkles />
            Novo Simulado com IA
          </button>
        </div>

        {loadingSimulados ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Icons.Loader /></div>
        ) : simulados.length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 16, padding: 60, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ color: '#a1a1aa', transform: 'scale(2)', marginBottom: 24 }}><Icons.FileQuestion /></div>
            <h3 style={{ color: '#f4f4f5', fontSize: 18, marginBottom: 8 }}>Nenhum simulado ainda</h3>
            <p style={{ color: '#a1a1aa' }}>Use a IA para gerar simulados a partir de seus PDFs e materiais de estudo.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {simulados.map(simulado => (
              <SimuladoCard key={simulado.id} simulado={simulado} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function SimuladosPage() {
  return (
    <Suspense>
      <SimuladosPageInner />
    </Suspense>
  );
}
