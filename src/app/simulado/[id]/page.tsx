'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

interface Questao {
  id: string;
  numero: number;
  enunciado: string;
  alternativa_a: string;
  alternativa_b: string;
  alternativa_c: string;
  alternativa_d: string;
  alternativa_e: string;
  resposta_correta: string;
  comentario: string;
}

interface Resposta {
  id: string;
  questao_id: string;
  resposta_usuario: string | null;
}

interface Simulado {
  id: string;
  titulo: string;
  total_questoes: number;
  status: string;
  iniciado_em: number | null;
}

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  ArrowLeft: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12,19 5,12 12,5"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12,5 19,12 12,19"/>
    </svg>
  ),
  Check: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  ),
  Loader: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ),
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SimuladoPage() {
  const router = useRouter();
  const params = useParams();
  const simuladoId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [simulado, setSimulado] = useState<Simulado | null>(null);
  const [questoes, setQuestoes] = useState<Questao[]>([]);
  const [respostas, setRespostas] = useState<Map<string, string | null>>(new Map());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Load simulado data
  useEffect(() => {
    const loadSimulado = async () => {
      const supabase = createClient();
      
      // Get simulado
      const { data: sim, error: simError } = await supabase
        .from('simulados')
        .select('*')
        .eq('id', simuladoId)
        .single();
      
      if (simError || !sim) {
        console.error('Simulado not found:', simError);
        router.push('/dashboard');
        return;
      }
      
      setSimulado(sim);
      
      // Get questoes
      const { data: qs, error: qError } = await supabase
        .from('simulado_questoes')
        .select('*')
        .eq('simulado_id', simuladoId)
        .order('numero', { ascending: true });
      
      if (qError || !qs) {
        console.error('Questions not found:', qError);
        return;
      }
      
      setQuestoes(qs);
      
      // Get existing respostas
      const { data: rs } = await supabase
        .from('simulado_respostas')
        .select('*')
        .eq('simulado_id', simuladoId);
      
      if (rs) {
        const map = new Map<string, string | null>();
        rs.forEach((r: Resposta) => map.set(r.questao_id, r.resposta_usuario));
        setRespostas(map);
      }
      
      // Mark as in progress if not already
      if (sim.status === 'pendente') {
        await supabase
          .from('simulados')
          .update({ status: 'em_andamento', iniciado_em: Date.now() })
          .eq('id', simuladoId);
      }
      
      setLoading(false);
    };
    
    loadSimulado();
  }, [simuladoId, router]);

  // Handle alternative selection
  const handleSelectAlternative = async (questionId: string, alternative: string) => {
    const supabase = createClient();
    
    // Update local state
    setRespostas(prev => new Map(prev).set(questionId, alternative));
    
    // Update database
    await supabase
      .from('simulado_respostas')
      .update({ 
        resposta_usuario: alternative,
        respondido_em: Date.now()
      })
      .eq('simulado_id', simuladoId)
      .eq('questao_id', questionId);
  };

  // Handle finish simulado
  const handleFinish = async () => {
    setSubmitting(true);
    const supabase = createClient();
    
    // Calculate results
    let acertos = 0;
    let erros = 0;
    
    for (const questao of questoes) {
      const resposta = respostas.get(questao.id);
      const correta = resposta === questao.resposta_correta;
      
      if (resposta) {
        if (correta) acertos++;
        else erros++;
      }
      
      // Update resposta with correct/incorrect flag
      await supabase
        .from('simulado_respostas')
        .update({ correta })
        .eq('simulado_id', simuladoId)
        .eq('questao_id', questao.id);
    }
    
    // Update simulado as completed
    await supabase
      .from('simulados')
      .update({
        status: 'concluido',
        acertos,
        erros,
        finalizado_em: Date.now(),
        updated_at: Date.now(),
      })
      .eq('id', simuladoId);
    
    // Redirect to results
    router.push(`/simulado/${simuladoId}/resultado`);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
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

  if (!simulado || questoes.length === 0) {
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

  const currentQuestion = questoes[currentIndex];
  const currentAnswer = respostas.get(currentQuestion.id);
  const answeredCount = Array.from(respostas.values()).filter(v => v !== null).length;
  const progress = (answeredCount / questoes.length) * 100;

  const alternatives = [
    { letter: 'A', text: currentQuestion.alternativa_a },
    { letter: 'B', text: currentQuestion.alternativa_b },
    { letter: 'C', text: currentQuestion.alternativa_c },
    { letter: 'D', text: currentQuestion.alternativa_d },
    { letter: 'E', text: currentQuestion.alternativa_e },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#F2F2F7' }}>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid #1C1C1E',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#0A0A0A',
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
              background: '#1C1C1E',
              color: '#888',
              textDecoration: 'none',
            }}
          >
            <Icons.ArrowLeft />
          </Link>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>{simulado.titulo}</h1>
            <p style={{ fontSize: 13, color: '#888' }}>
              Questão {currentIndex + 1} de {questoes.length}
            </p>
          </div>
        </div>
        
        <div style={{
          padding: '8px 16px',
          background: '#1C1C1E',
          borderRadius: 100,
          fontSize: 14,
          fontWeight: 600,
        }}>
          {answeredCount}/{questoes.length} respondidas
        </div>
      </header>

      {/* Progress Bar */}
      <div style={{
        width: '100%',
        height: 4,
        background: '#1C1C1E',
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #6366F1, #7C3AED)',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Main Content */}
      <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        {/* Question */}
        <div style={{
          background: '#1C1C1E',
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
        }}>
          <div style={{
            display: 'inline-block',
            padding: '4px 12px',
            background: '#6366F1',
            borderRadius: 100,
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 16,
          }}>
            Questão {currentQuestion.numero}
          </div>
          
          <p style={{
            fontSize: 17,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}>
            {currentQuestion.enunciado}
          </p>
        </div>

        {/* Alternatives */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          {alternatives.map(alt => (
            <button
              key={alt.letter}
              onClick={() => handleSelectAlternative(currentQuestion.id, alt.letter)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                padding: 20,
                background: currentAnswer === alt.letter 
                  ? 'rgba(99, 102, 241, 0.15)' 
                  : '#1C1C1E',
                border: currentAnswer === alt.letter 
                  ? '2px solid #6366F1' 
                  : '2px solid transparent',
                borderRadius: 14,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'all 0.2s ease',
                color: '#F2F2F7',
              }}
            >
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: currentAnswer === alt.letter ? '#6366F1' : '#2C2C2E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 16,
                flexShrink: 0,
              }}>
                {alt.letter}
              </div>
              <p style={{
                fontSize: 15,
                lineHeight: 1.5,
                paddingTop: 6,
              }}>
                {alt.text}
              </p>
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '16px 24px',
              background: currentIndex === 0 ? '#1C1C1E' : '#2C2C2E',
              border: 'none',
              borderRadius: 12,
              color: currentIndex === 0 ? '#555' : '#F2F2F7',
              fontSize: 15,
              fontWeight: 600,
              cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <Icons.ArrowLeft />
            Anterior
          </button>
          
          {currentIndex < questoes.length - 1 ? (
            <button
              onClick={() => setCurrentIndex(prev => Math.min(questoes.length - 1, prev + 1))}
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
              onClick={handleFinish}
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
                  <Icons.Loader />
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

        {/* Question Navigator */}
        <div style={{
          marginTop: 32,
          padding: 20,
          background: '#1C1C1E',
          borderRadius: 16,
        }}>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
            Navegação rápida
          </p>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}>
            {questoes.map((q, index) => {
              const answered = respostas.get(q.id) !== null;
              const isCurrent = index === currentIndex;
              
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(index)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    border: isCurrent ? '2px solid #6366F1' : '2px solid transparent',
                    background: answered 
                      ? 'rgba(99, 102, 241, 0.2)' 
                      : '#2C2C2E',
                    color: answered ? '#6366F1' : '#888',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {q.numero}
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
