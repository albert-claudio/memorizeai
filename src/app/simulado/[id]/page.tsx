
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSimuladoSession } from '@/features/simulado/hooks/useSimuladoSession';
import { SimuladoHeader, QuestionCard, QuestionNavigator } from '@/features/simulado/components';
import { Icons } from '@/features/deck/components/Icons';

export default function SimuladoPage() {
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

  const {
    loading,
    simulado,
    questoes,
    respostas,
    currentQuestion,
    currentIndex,
    submitting,
    answeredCount,
    handlers,
    nav
  } = useSimuladoSession(simuladoId, userId);

  if (loading || !userId) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
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

  if (!simulado || !currentQuestion) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
      }}>
        Simulado não encontrado
      </div>
    );
  }

  const selectedAlternative = respostas.get(currentQuestion.id) || null;

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#F2F2F7' }}>
      <SimuladoHeader 
        title={simulado.titulo}
        currentIndex={currentIndex}
        totalQuestions={questoes.length}
        answeredCount={answeredCount}
      />

      {/* Progress Bar */}
      <div style={{
        width: '100%',
        height: 4,
        background: '#1C1C1E',
      }}>
        <div style={{
          width: `${((currentIndex + 1) / questoes.length) * 100}%`, // Show progress based on current index or answered count? keeping simple for now
          height: '100%',
          background: 'linear-gradient(90deg, #6366F1, #7C3AED)',
          transition: 'width 0.3s ease',
        }} />
      </div>

      <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        <QuestionCard 
          question={currentQuestion}
          selectedAlternative={selectedAlternative}
          onSelect={handlers.selectAlternative}
        />

        {/* Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <button
            onClick={nav.prev}
            disabled={!nav.canPrev}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '16px 24px',
              background: !nav.canPrev ? '#1C1C1E' : '#2C2C2E',
              border: 'none',
              borderRadius: 12,
              color: !nav.canPrev ? '#555' : '#F2F2F7',
              fontSize: 15,
              fontWeight: 600,
              cursor: !nav.canPrev ? 'not-allowed' : 'pointer',
            }}
          >
            <Icons.ArrowLeft />
            Anterior
          </button>
          
          {nav.canNext ? (
            <button
              onClick={nav.next}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '16px 24px',
                background: '#6366F1',
                border: 'none',
                borderRadius: 12,
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Próxima
              <Icons.ArrowRight />
            </button>
          ) : (
            <button
              onClick={handlers.finish}
              disabled={submitting}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '16px 24px',
                background: 'linear-gradient(135deg, #22C55E, #16A34A)',
                border: 'none',
                borderRadius: 12,
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting ? (
                <>
                  <div style={{
                    width: 16,
                    height: 16,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  Finalizando...
                </>
              ) : (
                <>
                  <Icons.Check />
                  Finalizar Simulado
                </>
              )}
            </button>
          )}
        </div>

        <QuestionNavigator 
          questions={questoes}
          currentIndex={currentIndex}
          respostas={respostas}
          onJump={nav.jumpTo}
        />
      </main>
    </div>
  );
}
