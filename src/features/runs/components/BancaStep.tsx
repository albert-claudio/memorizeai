
import type { Banca } from '@/lib/types';
import { Icons } from './Icons';

interface BancaOption {
  id: Banca;
  title: string;
  description: string;
  emoji: string;
}

const BANCAS: BancaOption[] = [
  {
    id: 'FCC',
    title: 'FCC',
    description: 'Literalidade, exceção, requisito fino, distratores próximos',
    emoji: '📋',
  },
  {
    id: 'FGV',
    title: 'FGV',
    description: 'Enunciado interpretativo, conflito aparente, consequência prática',
    emoji: '🎯',
  },
  {
    id: 'CESPE',
    title: 'CESPE/CEBRASPE',
    description: 'Assertivas densas, palavra nuclear, condição e alcance',
    emoji: '⚖️',
  },
];

interface BancaStepProps {
  selectedBanca: Banca | null;
  onSelectBanca: (banca: Banca) => void;
}

export function BancaStep({ selectedBanca, onSelectBanca }: BancaStepProps) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Icons.BookOpen />
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>
          Estilo de Banca
        </h2>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
      }}>
        {BANCAS.map(banca => {
          const isSelected = selectedBanca === banca.id;
          return (
            <button
              key={banca.id}
              onClick={() => onSelectBanca(banca.id)}
              style={{
                padding: 20,
                background: isSelected
                  ? 'rgba(99, 102, 241, 0.1)'
                  : 'var(--bg-raised, #0a0a0a)',
                border: isSelected
                  ? '2px solid var(--accent, #6366F1)'
                  : '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: 14,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>{banca.emoji}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: '#f4f4f5' }}>
                {banca.title}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted, #71717a)', lineHeight: 1.5 }}>
                {banca.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
