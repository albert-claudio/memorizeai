
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSimuladoResults } from '@/features/simulado/hooks/useSimuladoResults';
import { ScoreOverview, ResultList } from '@/features/simulado/components/Results';
import { Icons } from '@/features/deck/components/Icons';

export default function ResultadoPage() {
  const params = useParams();
  const simuladoId = params.id as string;
  const router = useRouter();
  
  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.push('/login');
      else setUserId(user.id);
    };
    checkUser();
  }, [router]);

  const { loading, simulado, respostas } = useSimuladoResults(simuladoId, userId);

  if (loading || !userId) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
      }}>
        <div style={{
          width: 24,
          height: 24,
          border: '2px solid #333',
          borderTopColor: '#fff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style jsx global>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!simulado) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#f4f4f5',
      }}>
        Resultado não encontrado
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f4f4f5' }}>
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid #1C1C1E',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: '#0A0A0A',
      }}>
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 10,
            background: '#1C1C1E',
            color: '#888',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Icons.ArrowLeft />
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Resultado do Simulado</h1>
      </header>

      <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        <ScoreOverview 
          acertos={simulado.acertos} 
          total={simulado.total_questoes} 
        />
        
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Gabarito Detalhado</h2>
          <ResultList respostas={respostas} />
        </div>
      </main>
    </div>
  );
}
