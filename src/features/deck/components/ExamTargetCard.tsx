import type { ExamTarget } from '@/lib/types';
import { Icons } from './Icons';

interface ExamTargetCardProps {
  examTarget: ExamTarget | null;
  loading: boolean;
  prioritizeNearExam: boolean;
  unavailable: boolean;
  error: string | null;
  onConfigure: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function formatDate(value: number): string {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getDaysUntil(targetDate: number): number {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return Math.ceil((targetDate - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
}

function getCountdownLabel(targetDate: number): string {
  const days = getDaysUntil(targetDate);

  if (days < 0) return `prova passou há ${Math.abs(days)} dia${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'prova é hoje';
  if (days === 1) return 'falta 1 dia';
  return `faltam ${days} dias`;
}

function getCountdownTone(targetDate: number): { background: string; color: string; border: string } {
  const days = getDaysUntil(targetDate);

  if (days <= 7) {
    return {
      background: 'rgba(239, 68, 68, 0.12)',
      color: '#fca5a5',
      border: '1px solid rgba(239, 68, 68, 0.28)',
    };
  }

  if (days <= 30) {
    return {
      background: 'rgba(245, 158, 11, 0.12)',
      color: '#fcd34d',
      border: '1px solid rgba(245, 158, 11, 0.28)',
    };
  }

  return {
    background: 'rgba(34, 197, 94, 0.12)',
    color: '#86efac',
    border: '1px solid rgba(34, 197, 94, 0.22)',
  };
}

export function ExamTargetCard({
  examTarget,
  loading,
  prioritizeNearExam,
  unavailable,
  error,
  onConfigure,
  onDelete,
  deleting,
}: ExamTargetCardProps) {
  const sharedCardStyle = {
    border: '1px solid var(--border)',
    borderRadius: 20,
    background: 'linear-gradient(180deg, rgba(99,102,241,0.09) 0%, rgba(10,10,10,0.2) 100%), var(--bg-raised)',
    padding: '18px clamp(16px, 4vw, 24px)',
    marginBottom: 24,
    boxShadow: '0 18px 50px rgba(15, 23, 42, 0.16)',
  };

  if (loading) {
    return (
      <section style={sharedCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-secondary)' }}>
          <Icons.Loader />
          Carregando meta de prova...
        </div>
      </section>
    );
  }

  return (
    <section style={sharedCardStyle}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'rgba(99, 102, 241, 0.16)',
              color: '#c7d2fe',
            }}>
              <Icons.Calendar />
            </span>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              Meta de prova
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
            Configure uma data para este deck ganhar prioridade na revisão conforme a prova se aproxima.
          </p>
        </div>

        <button
          onClick={onConfigure}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            maxWidth: 220,
            minHeight: 44,
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid rgba(99, 102, 241, 0.24)',
            background: 'rgba(99, 102, 241, 0.14)',
            color: '#c7d2fe',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {examTarget ? <Icons.Edit /> : <Icons.Plus />}
          {examTarget ? 'Editar meta' : 'Criar meta'}
        </button>
      </div>

      {error && (
        <div style={{
          marginBottom: 16,
          padding: '12px 14px',
          borderRadius: 12,
          border: '1px solid rgba(239, 68, 68, 0.3)',
          background: 'rgba(239, 68, 68, 0.1)',
          color: '#fca5a5',
          fontSize: 13,
          lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}

      {unavailable && (
        <div style={{
          marginBottom: 16,
          padding: '12px 14px',
          borderRadius: 12,
          border: '1px solid rgba(245, 158, 11, 0.28)',
          background: 'rgba(245, 158, 11, 0.1)',
          color: '#fcd34d',
          fontSize: 13,
          lineHeight: 1.5,
        }}>
          A infraestrutura de meta de prova ainda não está disponível neste ambiente. A revisão segue funcionando no modo padrão.
        </div>
      )}

      {!examTarget ? (
        <div style={{
          borderRadius: 16,
          border: '1px dashed rgba(255,255,255,0.14)',
          padding: '16px 14px',
          color: 'var(--text-secondary)',
          fontSize: 14,
          lineHeight: 1.6,
        }}>
          Nenhuma prova vinculada a este deck ainda. Ao criar uma meta, o planner passa a subir cards mais fracos e atrasados deste deck quando a data estiver próxima.
        </div>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}>
            <div style={{
              borderRadius: 16,
              padding: '14px 14px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Prova</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                {examTarget.title}
              </div>
            </div>

            <div style={{
              borderRadius: 16,
              padding: '14px 14px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Data alvo</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatDate(examTarget.target_date)}
              </div>
            </div>

            <div style={{
              borderRadius: 16,
              padding: '14px 14px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Retenção alvo</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {Math.round(examTarget.target_retention * 100)}%
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
          }}>
            <div style={{
              ...getCountdownTone(examTarget.target_date),
              borderRadius: 999,
              padding: '9px 14px',
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.03em',
            }}>
              {getCountdownLabel(examTarget.target_date)}
            </div>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: prioritizeNearExam ? '#86efac' : 'var(--text-secondary)',
            }}>
              <span style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: prioritizeNearExam ? '#22c55e' : 'var(--text-muted)',
                boxShadow: prioritizeNearExam ? '0 0 0 6px rgba(34,197,94,0.12)' : 'none',
              }} />
              {prioritizeNearExam
                ? 'Prioridade na revisão ativada'
                : 'Prioridade global por prova está desligada'}
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12,
          }}>
            <button
              onClick={onConfigure}
              style={{
                minHeight: 46,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Editar meta
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              style={{
                minHeight: 46,
                borderRadius: 12,
                border: '1px solid rgba(239,68,68,0.28)',
                background: 'rgba(239,68,68,0.1)',
                color: '#fca5a5',
                fontWeight: 600,
                cursor: deleting ? 'not-allowed' : 'pointer',
                opacity: deleting ? 0.7 : 1,
              }}
            >
              {deleting ? 'Removendo...' : 'Remover meta'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
