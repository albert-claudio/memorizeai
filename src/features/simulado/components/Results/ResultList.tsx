import { useState } from 'react';
import type { RespostaComQuestao } from '@/features/simulado/hooks/useSimuladoResults';
import { Icons } from '@/features/deck/components/Icons';

export function ResultList({ respostas }: { respostas: RespostaComQuestao[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {respostas.map((resposta) => (
        <ExpandableResultItem
          key={resposta.id}
          resposta={resposta}
          isExpanded={expandedId === resposta.id}
          onToggle={() => setExpandedId(expandedId === resposta.id ? null : resposta.id)}
        />
      ))}
    </div>
  );
}

function ExpandableResultItem({
  resposta,
  isExpanded,
  onToggle,
}: {
  resposta: RespostaComQuestao;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isCorrect = resposta.correta;
  const questao = resposta.questao;
  const alternatives = [
    { letter: 'A', text: questao.alternativa_a },
    { letter: 'B', text: questao.alternativa_b },
    { letter: 'C', text: questao.alternativa_c },
    { letter: 'D', text: questao.alternativa_d },
    { letter: 'E', text: questao.alternativa_e },
  ].filter(alt => alt.text);

  return (
    <div style={{
      background: '#111111',
      borderRadius: 18,
      overflow: 'hidden',
      border: isCorrect
        ? '1px solid rgba(34, 197, 94, 0.25)'
        : resposta.resposta_usuario
          ? '1px solid rgba(239, 68, 68, 0.25)'
          : '1px solid rgba(255,255,255,0.06)',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 22,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#f4f4f5',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: isCorrect ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isCorrect ? '#4ade80' : '#f87171',
          }}>
            {isCorrect ? <Icons.Check /> : <Icons.X />}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              Questao {questao.numero}
            </div>
            <div style={{ fontSize: 13, color: '#71717a' }}>
              Sua resposta: {resposta.resposta_usuario || 'Nao respondida'}
              {!isCorrect && <span style={{ color: '#4ade80' }}> · Correta: {questao.resposta_correta}</span>}
            </div>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div style={{ padding: '0 22px 22px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ padding: '18px 0', fontSize: 14, color: '#a1a1aa', lineHeight: 1.55 }}>
            {questao.enunciado}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {alternatives.map((alt) => {
              const isUser = resposta.resposta_usuario === alt.letter;
              const isRight = questao.resposta_correta === alt.letter;

              return (
                <div
                  key={alt.letter}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: isRight
                      ? '1px solid rgba(34,197,94,0.35)'
                      : isUser
                        ? '1px solid rgba(239,68,68,0.35)'
                        : '1px solid rgba(255,255,255,0.06)',
                    background: isRight
                      ? 'rgba(34,197,94,0.08)'
                      : isUser
                        ? 'rgba(239,68,68,0.08)'
                        : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <span style={{ width: 22, fontWeight: 800, color: isRight ? '#4ade80' : isUser ? '#f87171' : '#a1a1aa' }}>
                    {alt.letter}
                  </span>
                  <span style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.45 }}>
                    {alt.text.replace(/^[A-E]\)\s*/, '')}
                  </span>
                </div>
              );
            })}
          </div>

          {questao.comentario && (
            <div style={{ marginTop: 16, padding: 16, background: 'rgba(99, 102, 241, 0.1)', borderRadius: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', marginBottom: 8 }}>COMENTARIO</p>
              <p style={{ fontSize: 14, color: '#a1a1aa', lineHeight: 1.55 }}>{questao.comentario}</p>
            </div>
          )}

          {questao.citation_excerpt && (
            <div style={{ marginTop: 12, padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#a1a1aa', marginBottom: 6 }}>FONTE DO MATERIAL</p>
              <p style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.45 }}>{questao.citation_excerpt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
