
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSimuladoResults } from '@/features/simulado/hooks/useSimuladoResults';
import type { RespostaComQuestao } from '@/features/simulado/hooks/useSimuladoResults';
import { ScoreOverview, ResultList, ErrorStats } from '@/features/simulado/components/Results';
import { Icons } from '@/features/deck/components/Icons';

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function inferTopic(row: RespostaComQuestao) {
  const text = normalize(`${row.questao.enunciado} ${row.questao.comentario || ''} ${row.questao.citation_excerpt || ''}`);
  const topics = [
    { label: 'Prazos e requisitos', keys: ['prazo', 'prescricao', 'decadencia', 'requisito', 'condicao'] },
    { label: 'Competencia e legitimidade', keys: ['competencia', 'competente', 'legitimidade', 'legitimado'] },
    { label: 'Excecoes e pegadinhas', keys: ['excecao', 'salvo', 'vedado', 'exceto', 'ressalvado'] },
    { label: 'Efeitos e consequencias', keys: ['efeito', 'consequencia', 'nulidade', 'validade', 'responsabilidade'] },
    { label: 'Conceitos centrais', keys: ['conceito', 'principio', 'definicao', 'natureza', 'classificacao'] },
  ];

  return topics.find(topic => topic.keys.some(key => text.includes(key)))?.label || 'Tema do material';
}

function inferErrorType(row: RespostaComQuestao) {
  if (!row.resposta_usuario) return 'Questao deixada em branco';

  const text = normalize(`${row.questao.enunciado} ${row.questao.comentario || ''}`);
  if (text.includes('prazo') || text.includes('art.') || text.includes('lei')) return 'Erro de literalidade';
  if (text.includes('caso') || text.includes('situacao') || text.includes('hipotet')) return 'Erro de aplicacao';
  if (text.includes('excecao') || text.includes('salvo') || text.includes('exceto')) return 'Confusao entre regra e excecao';
  if (text.includes('competencia') || text.includes('legitim')) return 'Confusao de competencia ou legitimidade';
  return 'Lacuna conceitual';
}

function SimuladoDiagnosis({ respostas, onTrainAgain }: { respostas: RespostaComQuestao[]; onTrainAgain: () => void }) {
  const wrongRows = respostas.filter(row => row.correta === false || row.resposta_usuario === null);
  const correctRows = respostas.filter(row => row.correta === true);
  const total = respostas.length || 1;
  const accuracy = Math.round((correctRows.length / total) * 100);

  const topicCounts = new Map<string, number>();
  const errorCounts = new Map<string, number>();

  for (const row of wrongRows) {
    const topic = inferTopic(row);
    const error = inferErrorType(row);
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
  }

  const topTopic = [...topicCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topError = [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const nextAction = wrongRows.length === 0
    ? 'Aumente a dificuldade ou gere um novo simulado para validar dominio.'
    : `Revise ${topTopic?.[0] || 'os pontos errados'} e refaca um simulado curto com 10 questoes.`;

  return (
    <section style={{
      marginTop: 24,
      padding: 20,
      borderRadius: 18,
      background: 'linear-gradient(135deg, rgba(99,102,241,0.14), rgba(17,17,17,0.85))',
      border: '1px solid rgba(99,102,241,0.25)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Diagnostico de prova
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f4f4f5', marginBottom: 8 }}>
            {wrongRows.length === 0 ? 'Treino dominado' : `Seu maior gargalo: ${topTopic?.[0] || 'revisao do material'}`}
          </h2>
          <p style={{ fontSize: 14, color: '#a1a1aa', lineHeight: 1.55 }}>
            Acerto de {accuracy}%. {topError ? `Padrao principal de erro: ${topError[0]}.` : 'Sem erro relevante neste simulado.'}
          </p>
        </div>
        <button
          onClick={onTrainAgain}
          style={{
            padding: '12px 18px',
            borderRadius: 12,
            border: 'none',
            background: '#fff',
            color: '#09090b',
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Novo treino
        </button>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 12, color: '#71717a', marginBottom: 6 }}>Onde focar</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#f4f4f5' }}>{topTopic?.[0] || 'Manter ritmo'}</div>
        </div>
        <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 12, color: '#71717a', marginBottom: 6 }}>Tipo de erro</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#f4f4f5' }}>{topError?.[0] || 'Nenhum gargalo'}</div>
        </div>
        <div style={{ padding: 14, borderRadius: 14, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)' }}>
          <div style={{ fontSize: 12, color: '#86efac', marginBottom: 6 }}>Proxima acao</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#dcfce7', lineHeight: 1.4 }}>{nextAction}</div>
        </div>
      </div>
    </section>
  );
}

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

        <SimuladoDiagnosis
          respostas={respostas}
          onTrainAgain={() => router.push('/dashboard/runs')}
        />

        <ErrorStats respostas={respostas} />
        
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Gabarito Detalhado</h2>
          <ResultList respostas={respostas} />
        </div>
      </main>
    </div>
  );
}
