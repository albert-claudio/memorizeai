
import type { Source, RunObjective } from '@/lib/types';
import type { MonthlyUsage } from '@/lib/billing/run-entitlement';
import { Icons } from './Icons';

interface GenerateRunButtonProps {
  selectedSource: Source | null;
  selectedObjective: RunObjective | null;
  creating: boolean;
  targetCount: number;
  usage: MonthlyUsage | null;
  onCreateRun: () => void;
}

export function GenerateRunButton({
  selectedSource,
  selectedObjective,
  creating,
  targetCount,
  usage,
  onCreateRun,
}: GenerateRunButtonProps) {
  // Determine if monthly limit is reached for the selected objective
  const limitReached = (() => {
    if (!usage || !selectedObjective) return false;

    if (selectedObjective === 'flashcards') {
      return usage.flashcardsUsed >= usage.flashcardsLimit;
    }
    // simulados / logica_juridica
    return usage.simuladosUsed >= usage.simuladosLimit;
  })();

  const canGenerate = selectedSource && selectedObjective && !creating && !limitReached;

  // Build the status message
  const statusMessage = (() => {
    if (!selectedSource || !selectedObjective) return null;

    if (limitReached) {
      if (selectedObjective === 'flashcards') {
        return '🔒 Limite mensal de gerações atingido. Faça upgrade para Pro.';
      }
      return '🔒 Limite mensal de simulados atingido. Renova no próximo mês.';
    }

    if (selectedObjective === 'flashcards') {
      if (usage && !usage.isPro) {
        return `✨ ${usage.flashcardsUsed}/${usage.flashcardsLimit} gerações usadas este mês`;
      }
      return '✨ Até 10.000 cards por deck no Pro!';
    }

    if (usage) {
      return `📝 ${usage.simuladosUsed}/${usage.simuladosLimit} simulados usados este mês`;
    }
    return null;
  })();

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
        ) : limitReached ? (
          'Limite mensal atingido'
        ) : (
          <>
            <Icons.Sparkles />
            Gerar {targetCount} {selectedObjective === 'flashcards' ? 'Flashcards' : selectedObjective === 'questoes_banca' ? 'Questões' : 'Exercícios'}
          </>
        )}
      </button>

      {statusMessage && (
        <p style={{
          textAlign: 'center',
          marginTop: 16,
          fontSize: 13,
          color: limitReached ? 'var(--text-warning, #F59E0B)' : 'var(--text-muted)',
        }}>
          {statusMessage}
        </p>
      )}
    </>
  );
}
