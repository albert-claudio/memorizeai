
import type { Questao } from '../services/simuladoService';
import { QuestionReportButton } from './QuestionReportButton';

interface QuestionCardProps {
  simuladoId: string;
  question: Questao;
  selectedAlternative: string | null;
  onSelect: (id: string, alt: string) => void;
}

export function QuestionCard({ simuladoId, question, selectedAlternative, onSelect }: QuestionCardProps) {
  // Detect CESPE Certo/Errado format: alternativa_a = 'Certo', alternativa_b = 'Errado', c/d/e empty
  const isCespe = question.alternativa_a === 'Certo'
    && question.alternativa_b === 'Errado'
    && !question.alternativa_c
    && !question.alternativa_d
    && !question.alternativa_e;

  const alternatives = isCespe
    ? [
        { letter: 'A', text: 'Certo', emoji: '✓' },
        { letter: 'B', text: 'Errado', emoji: '✗' },
      ]
    : [
        { letter: 'A', text: question.alternativa_a, emoji: undefined },
        { letter: 'B', text: question.alternativa_b, emoji: undefined },
        { letter: 'C', text: question.alternativa_c, emoji: undefined },
        { letter: 'D', text: question.alternativa_d, emoji: undefined },
        { letter: 'E', text: question.alternativa_e, emoji: undefined },
      ];

  return (
    <div>
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
          {isCespe ? `Item ${question.numero}` : `Questão ${question.numero}`}
        </div>

        {isCespe && (
          <p style={{
            fontSize: 13,
            color: '#71717a',
            marginBottom: 8,
            fontStyle: 'italic',
          }}>
            Julgue o item a seguir.
          </p>
        )}
        
        <p style={{
          fontSize: 17,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {question.enunciado}
        </p>

        <QuestionReportButton
          simuladoId={simuladoId}
          questaoId={question.id}
          selectedAnswer={selectedAlternative}
          context="during_simulado"
        />
      </div>

      <div style={{
        display: isCespe ? 'grid' : 'flex',
        gridTemplateColumns: isCespe ? '1fr 1fr' : undefined,
        flexDirection: isCespe ? undefined : 'column',
        gap: 12,
        marginBottom: 32,
      }}>
        {alternatives.map(alt => (
          <button
            key={alt.letter}
            onClick={() => onSelect(question.id, alt.letter)}
            style={{
              display: 'flex',
              alignItems: isCespe ? 'center' : 'flex-start',
              justifyContent: isCespe ? 'center' : undefined,
              gap: isCespe ? 12 : 16,
              padding: isCespe ? 24 : 20,
              background: selectedAlternative === alt.letter 
                ? (isCespe && alt.letter === 'A' ? 'rgba(34, 197, 94, 0.15)' :
                   isCespe && alt.letter === 'B' ? 'rgba(239, 68, 68, 0.15)' :
                   'rgba(99, 102, 241, 0.15)')
                : '#1C1C1E',
              border: selectedAlternative === alt.letter 
                ? `2px solid ${isCespe && alt.letter === 'A' ? '#22C55E' : isCespe && alt.letter === 'B' ? '#EF4444' : '#6366F1'}`
                : '2px solid transparent',
              borderRadius: 14,
              cursor: 'pointer',
              textAlign: isCespe ? 'center' : 'left',
              width: '100%',
              transition: 'all 0.2s ease',
              color: '#F2F2F7',
            }}
          >
            {isCespe ? (
              <>
                <span style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: alt.letter === 'A' ? '#22C55E' : '#EF4444',
                }}>
                  {alt.emoji}
                </span>
                <span style={{
                  fontSize: 18,
                  fontWeight: 600,
                }}>
                  {alt.text}
                </span>
              </>
            ) : (
              <>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: selectedAlternative === alt.letter ? '#6366F1' : '#2C2C2E',
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
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

