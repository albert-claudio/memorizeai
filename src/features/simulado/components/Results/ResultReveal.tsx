'use client';

import type { RespostaComQuestao } from '@/features/simulado/hooks/useSimuladoResults';

interface ResultRevealProps {
  acertos: number;
  total: number;
  respostas: RespostaComQuestao[];
}

export function ResultReveal({ acertos, total, respostas }: ResultRevealProps) {
  const wrongRows = respostas.filter((row) => row.correta === false && row.resposta_usuario !== null);
  const blankRows = respostas.filter((row) => row.resposta_usuario === null);
  const missedRows = respostas
    .filter((row) => row.correta === false || row.resposta_usuario === null)
    .sort((a, b) => a.questao.numero - b.questao.numero);
  const erros = Math.max(0, total - acertos);
  const displayBlank = Math.min(blankRows.length, erros);
  const displayWrong = Math.max(wrongRows.length, erros - displayBlank);
  const correctPercent = total > 0 ? Math.round((acertos / total) * 100) : 0;
  const errorPercent = total > 0 ? Math.round((erros / total) * 100) : 0;

  return (
    <section
      className="result-reveal"
      style={{
        marginBottom: 24,
        padding: 20,
        borderRadius: 18,
        background: '#111111',
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Fechamento do simulado
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f4f4f5', marginBottom: 6 }}>
            {acertos} acertos, {erros} pontos para revisar
          </h2>
          <p style={{ fontSize: 14, color: '#a1a1aa', lineHeight: 1.55 }}>
            Revise primeiro o que ficou em vermelho e depois refaca um treino curto.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <RevealStat label="Acertos" value={acertos} tone="green" delay={0} />
          <RevealStat label="Erros" value={displayWrong} tone="red" delay={80} />
          <RevealStat label="Em branco" value={displayBlank} tone="neutral" delay={160} />
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
        <ProgressBar label="Acertos" value={correctPercent} color="#22c55e" delay={180} />
        <ProgressBar label="Erros e brancos" value={errorPercent} color="#ef4444" delay={260} />
      </div>

      {missedRows.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#f4f4f5', marginBottom: 10 }}>
            Erros para revisar
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {missedRows.slice(0, 12).map((row, index) => (
              <span
                key={row.id}
                className="missed-chip"
                style={{
                  animationDelay: `${320 + index * 45}ms`,
                  padding: '8px 10px',
                  borderRadius: 12,
                  border: '1px solid rgba(239, 68, 68, 0.22)',
                  background: 'rgba(239, 68, 68, 0.08)',
                  color: '#fecaca',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Q{row.questao.numero}: {row.resposta_usuario || 'em branco'} {'->'} {row.questao.resposta_correta}
              </span>
            ))}
            {missedRows.length > 12 && (
              <span style={{ padding: '8px 10px', borderRadius: 12, color: '#a1a1aa', fontSize: 12, fontWeight: 700 }}>
                +{missedRows.length - 12} outras
              </span>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .result-reveal {
          animation: result-reveal-in 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .missed-chip {
          opacity: 0;
          animation: missed-chip-in 360ms ease both;
        }

        @keyframes result-reveal-in {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes missed-chip-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}

function RevealStat({
  label,
  value,
  tone,
  delay,
}: {
  label: string;
  value: number;
  tone: 'green' | 'red' | 'neutral';
  delay: number;
}) {
  const palette = {
    green: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.25)', value: '#4ade80' },
    red: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.25)', value: '#f87171' },
    neutral: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', value: '#f4f4f5' },
  }[tone];

  return (
    <div
      className="reveal-stat"
      style={{
        minWidth: 92,
        padding: '12px 14px',
        borderRadius: 14,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        animationDelay: `${delay}ms`,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 900, color: palette.value, lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#a1a1aa', fontWeight: 700 }}>{label}</div>
      <style jsx>{`
        .reveal-stat {
          opacity: 0;
          animation: reveal-stat-pop 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes reveal-stat-pop {
          from {
            opacity: 0;
            transform: scale(0.92);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  color,
  delay,
}: {
  label: string;
  value: number;
  color: string;
  delay: number;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a1a1aa', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div
          className="animated-fill"
          style={{
            width: `${value}%`,
            height: '100%',
            borderRadius: 999,
            background: color,
            animationDelay: `${delay}ms`,
          }}
        />
      </div>
      <style jsx>{`
        .animated-fill {
          transform: scaleX(0);
          transform-origin: left center;
          animation: reveal-fill 680ms ease forwards;
        }

        @keyframes reveal-fill {
          to {
            transform: scaleX(1);
          }
        }
      `}</style>
    </div>
  );
}
