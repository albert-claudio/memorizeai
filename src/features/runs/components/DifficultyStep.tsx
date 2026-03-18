
import type { Dificuldade } from '@/lib/types';

interface DifficultyOption {
  id: Dificuldade;
  label: string;
  description: string;
  color: string;
}

const DIFFICULTIES: DifficultyOption[] = [
  {
    id: 'facil',
    label: 'Fácil',
    description: 'Núcleo conceitual básico',
    color: '#22C55E',
  },
  {
    id: 'medio',
    label: 'Médio',
    description: 'Conceito + aplicação prática',
    color: '#F59E0B',
  },
  {
    id: 'dificil',
    label: 'Difícil',
    description: 'Exceções, requisitos cumulativos',
    color: '#EF4444',
  },
  {
    id: 'muito_dificil',
    label: 'Muito Difícil',
    description: 'Distratores altamente plausíveis, nuances sutis',
    color: '#9333EA',
  },
];

interface DifficultyStepProps {
  selectedDifficulty: Dificuldade | null;
  onSelectDifficulty: (d: Dificuldade) => void;
}

export function DifficultyStep({ selectedDifficulty, onSelectDifficulty }: DifficultyStepProps) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
        Dificuldade
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10,
      }}>
        {DIFFICULTIES.map(diff => {
          const isSelected = selectedDifficulty === diff.id;
          return (
            <button
              key={diff.id}
              onClick={() => onSelectDifficulty(diff.id)}
              style={{
                padding: '16px 14px',
                background: isSelected
                  ? `${diff.color}15`
                  : 'var(--bg-raised, #0a0a0a)',
                border: isSelected
                  ? `2px solid ${diff.color}`
                  : '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: 12,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: diff.color,
                marginBottom: 10,
              }} />
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: '#f4f4f5' }}>
                {diff.label}
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-muted, #71717a)', lineHeight: 1.4 }}>
                {diff.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
