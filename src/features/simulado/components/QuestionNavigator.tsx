
import type { Questao } from '../services/simuladoService';

interface QuestionNavigatorProps {
  questions: Questao[];
  currentIndex: number;
  respostas: Map<string, string | null>;
  onJump: (index: number) => void;
}

export function QuestionNavigator({ questions, currentIndex, respostas, onJump }: QuestionNavigatorProps) {
  return (
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
        {questions.map((q, index) => {
          const answered = respostas.get(q.id) !== undefined && respostas.get(q.id) !== null;
          const isCurrent = index === currentIndex;
          
          return (
            <button
              key={q.id}
              onClick={() => onJump(index)}
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
  );
}
