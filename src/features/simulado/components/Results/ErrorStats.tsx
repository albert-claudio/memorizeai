import type { RespostaComQuestao } from '@/features/simulado/hooks/useSimuladoResults';

interface ErrorStatsProps {
  respostas: RespostaComQuestao[];
}

type Alternative = 'A' | 'B' | 'C' | 'D' | 'E';

const ALTERNATIVES: Alternative[] = ['A', 'B', 'C', 'D', 'E'];

function toPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function ErrorStats({ respostas }: ErrorStatsProps) {
  const total = respostas.length;
  const correct = respostas.filter(r => r.correta === true).length;
  const wrongRows = respostas.filter(r => r.correta === false && r.resposta_usuario !== null);
  const blankRows = respostas.filter(r => r.resposta_usuario === null);
  const missedRows = respostas.filter(r => r.correta === false || r.resposta_usuario === null);
  const wrong = missedRows.length;
  const blank = blankRows.length;

  const accuracy = total > 0 ? (correct / total) * 100 : 0;
  const errorRate = total > 0 ? (wrong / total) * 100 : 0;

  const wrongByAlternative: Record<Alternative, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
  };

  for (const row of wrongRows) {
    const marked = row.resposta_usuario as Alternative | null;
    if (marked && ALTERNATIVES.includes(marked)) {
      wrongByAlternative[marked] += 1;
    }
  }

  const wrongQuestionNumbers = missedRows
    .map(r => r.questao.numero)
    .sort((a, b) => a - b);

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
        Estatisticas de Erro
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}>
        <StatCard label="Taxa de acerto" value={toPercent(accuracy)} tone="green" />
        <StatCard label="Taxa de erro" value={toPercent(errorRate)} tone="red" />
        <StatCard label="Erros totais" value={String(wrong)} tone="red" />
        <StatCard label="Nao respondidas" value={String(blank)} tone="neutral" />
      </div>

      <div style={{
        background: '#111111',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 16,
      }}>
        <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 10 }}>
          Distribuicao de alternativas marcadas nas questoes erradas
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {ALTERNATIVES.map(letter => (
            <div
              key={letter}
              style={{
                borderRadius: 12,
                padding: 10,
                textAlign: 'center',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 4 }}>{letter}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f87171' }}>
                {wrongByAlternative[letter]}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        marginTop: 12,
        fontSize: 13,
        color: '#a1a1aa',
        background: '#111111',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 14,
      }}>
        <span style={{ color: '#f4f4f5', fontWeight: 600 }}>Questoes erradas: </span>
        {wrongQuestionNumbers.length > 0 ? wrongQuestionNumbers.join(', ') : 'nenhuma'}
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'green' | 'red' | 'neutral';
}) {
  const palette = {
    green: {
      bg: 'rgba(34, 197, 94, 0.08)',
      border: 'rgba(34, 197, 94, 0.25)',
      value: '#4ade80',
    },
    red: {
      bg: 'rgba(239, 68, 68, 0.08)',
      border: 'rgba(239, 68, 68, 0.25)',
      value: '#f87171',
    },
    neutral: {
      bg: 'rgba(255,255,255,0.04)',
      border: 'rgba(255,255,255,0.08)',
      value: '#f4f4f5',
    },
  }[tone];

  return (
    <div style={{
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      borderRadius: 14,
      padding: 14,
    }}>
      <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: palette.value }}>{value}</div>
    </div>
  );
}
