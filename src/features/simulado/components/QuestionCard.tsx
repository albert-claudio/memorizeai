
import type { Questao } from '../services/simuladoService';

interface QuestionCardProps {
  question: Questao;
  selectedAlternative: string | null;
  onSelect: (id: string, alt: string) => void;
}

export function QuestionCard({ question, selectedAlternative, onSelect }: QuestionCardProps) {
  const alternatives = [
    { letter: 'A', text: question.alternativa_a },
    { letter: 'B', text: question.alternativa_b },
    { letter: 'C', text: question.alternativa_c },
    { letter: 'D', text: question.alternativa_d },
    { letter: 'E', text: question.alternativa_e },
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
          Questão {question.numero}
        </div>
        
        <p style={{
          fontSize: 17,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {question.enunciado}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        {alternatives.map(alt => (
          <button
            key={alt.letter}
            onClick={() => onSelect(question.id, alt.letter)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              padding: 20,
              background: selectedAlternative === alt.letter 
                ? 'rgba(99, 102, 241, 0.15)' 
                : '#1C1C1E',
              border: selectedAlternative === alt.letter 
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
          </button>
        ))}
      </div>
    </div>
  );
}
