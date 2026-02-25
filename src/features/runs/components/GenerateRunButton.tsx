
import type { Source, RunObjective } from '@/lib/types';
import type { UserCreditsInfo } from '@/app/actions/createRun';
import { Icons } from './Icons';

interface GenerateRunButtonProps {
  selectedSource: Source | null;
  selectedObjective: RunObjective | null;
  creating: boolean;
  targetCount: number;
  credits: UserCreditsInfo | null;
  onCreateRun: () => void;
}

export function GenerateRunButton({
  selectedSource,
  selectedObjective,
  creating,
  targetCount,
  credits,
  onCreateRun,
}: GenerateRunButtonProps) {
  const noCredits = selectedObjective !== 'flashcards' && (credits?.totalCredits ?? 0) <= 0;
  const canGenerate = selectedSource && selectedObjective && !creating && !noCredits;

  return (
    <>
      <button
        onClick={onCreateRun}
        disabled={!canGenerate}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '20px 32px',
          background: canGenerate
            ? 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)'
            : 'var(--bg-muted)',
          border: 'none',
          borderRadius: 16,
          color: (selectedSource && selectedObjective) ? 'white' : 'var(--text-muted)',
          fontSize: 18,
          fontWeight: 600,
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          boxShadow: canGenerate
            ? '0 4px 20px rgba(99, 102, 241, 0.3)'
            : 'none',
          transition: 'all 0.2s ease',
        }}
      >
        {creating ? (
          <>
            <Icons.Loader />
            Iniciando...
          </>
        ) : noCredits ? (
          'Sem créditos disponíveis'
        ) : (
          <>
            <Icons.Sparkles />
            Gerar {targetCount} {selectedObjective === 'flashcards' ? 'Flashcards' : selectedObjective === 'questoes_banca' ? 'Questões' : 'Exercícios'}
          </>
        )}
      </button>

      {selectedSource && selectedObjective && (
        <p style={{
          textAlign: 'center',
          marginTop: 16,
          fontSize: 13,
          color: 'var(--text-muted)',
        }}>
          {selectedObjective === 'flashcards'
            ? '✨ Flashcards são gratuitos!'
            : `Esta ação consumirá 1 crédito • Restam ${credits?.totalCredits ?? 0} créditos`
          }
        </p>
      )}
    </>
  );
}
