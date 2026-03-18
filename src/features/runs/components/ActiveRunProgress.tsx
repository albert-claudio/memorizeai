
import { Icons } from './Icons';
import type { RunWithExtras } from '../hooks/useRunCreation';

interface ActiveRunProgressProps {
  activeRun: RunWithExtras;
  onRetry: () => void;
}

export function ActiveRunProgress({ activeRun, onRetry }: ActiveRunProgressProps) {
  const startedAtLabel = activeRun.started_at
    ? new Date(activeRun.started_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div style={{
      background: 'var(--bg-raised)',
      border: '1px solid var(--border-accent)',
      borderRadius: 20,
      padding: 32,
      marginBottom: 32,
      textAlign: 'center',
    }}>
      <div style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: activeRun.status === 'concluido'
          ? 'rgba(34, 197, 94, 0.1)'
          : activeRun.status === 'erro'
            ? 'rgba(239, 68, 68, 0.1)'
            : activeRun.status === 'base_insuficiente'
              ? 'rgba(245, 158, 11, 0.1)'
              : 'rgba(99, 102, 241, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 24px',
        color: activeRun.status === 'concluido'
          ? 'var(--success)'
          : activeRun.status === 'erro'
            ? 'var(--error)'
            : activeRun.status === 'base_insuficiente'
              ? '#F59E0B'
              : 'var(--accent)',
      }}>
        {activeRun.status === 'concluido' ? (
          <Icons.Check />
        ) : activeRun.status === 'erro' ? (
          <span style={{ fontSize: 32 }}>!</span>
        ) : activeRun.status === 'base_insuficiente' ? (
          <span style={{ fontSize: 32 }}>⚠️</span>
        ) : (
          <Icons.Sparkles />
        )}
      </div>

      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        {activeRun.status === 'pendente' && '⏳ Preparando...'}
        {activeRun.status === 'processando' && '🤖 Gerando com IA...'}
        {activeRun.status === 'concluido' && '✅ Pronto!'}
        {activeRun.status === 'erro' && '❌ Erro'}
        {activeRun.status === 'base_insuficiente' && '📄 Base Insuficiente'}
      </h2>

      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        {activeRun.status === 'pendente' && 'Iniciando processamento...'}
        {activeRun.status === 'processando' && (
          <>
            Modelo: <strong>{activeRun.model_used || 'Selecionando...'}</strong>
            {startedAtLabel && (
              <> • iniciado às {startedAtLabel}</>
            )}
          </>
        )}
        {activeRun.status === 'concluido' && (
          <>
            🎉 <strong>{activeRun.items_generated}</strong> itens gerados! Redirecionando...
          </>
        )}
        {activeRun.status === 'erro' && (activeRun.error_message || 'Falha na geração')}
        {activeRun.status === 'base_insuficiente' && (
          <>
            O documento não tem conteúdo técnico suficiente para gerar questões de alta fidelidade.
            {activeRun.error_message && (
              <><br /><em style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activeRun.error_message}</em></>
            )}
          </>
        )}
      </p>

      {(activeRun.status === 'pendente' || activeRun.status === 'processando') && (
        <div style={{
          width: '100%',
          height: 6,
          background: 'var(--bg-muted)',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            width: activeRun.status === 'processando'
              ? (activeRun.model_used ? '70%' : '40%')
              : '15%',
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent), #7C3AED)',
            borderRadius: 3,
            transition: 'width 0.8s ease',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </div>
      )}

      {(activeRun.status === 'erro' || activeRun.status === 'base_insuficiente') && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 16,
            padding: '12px 24px',
            background: 'var(--bg-muted)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--text-primary)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
