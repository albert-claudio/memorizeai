'use client';

import { useRouter } from 'next/navigation';
import { Icons } from './Icons';
import { ProgressRing } from './ProgressRing';

// ============================================================================
// SIMULADO CARD COMPONENT
// ============================================================================

export interface Simulado {
  id: string;
  titulo: string;
  total_questoes: number;
  status: string;
  acertos: number | null;
  erros: number | null;
  created_at: number;
}

interface SimuladoCardProps {
  simulado: Simulado;
}

export function SimuladoCard({ simulado }: SimuladoCardProps) {
  const router = useRouter();
  
  const isCompleted = simulado.status === 'concluido';
  const percentage = isCompleted && simulado.total_questoes > 0
    ? Math.round(((simulado.acertos || 0) / simulado.total_questoes) * 100)
    : null;
  const isPassed = percentage !== null && percentage >= 70;
  
  return (
    <div
      onClick={() => router.push(isCompleted ? `/simulado/${simulado.id}/resultado` : `/simulado/${simulado.id}`)}
      style={{
        background: '#111111',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 18,
        padding: 24,
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.border = '1px solid rgba(255,255,255,0.12)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.border = '1px solid rgba(255,255,255,0.06)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Subtle glow effect for status */}
      {isCompleted && (
        <div style={{
          position: 'absolute',
          top: -50,
          right: -50,
          width: 150,
          height: 150,
          background: isPassed 
            ? 'radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
      )}
      
      {/* Header with Progress Ring */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: 18,
      }}>
        {/* Status Badge with dot glow */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 100,
          fontSize: 12,
          fontWeight: 600,
          background: isCompleted 
            ? isPassed ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'
            : 'rgba(99, 102, 241, 0.1)',
          border: `1px solid ${isCompleted 
            ? isPassed ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'
            : 'rgba(99, 102, 241, 0.2)'}`,
          color: isCompleted 
            ? isPassed ? '#4ade80' : '#f87171'
            : '#818cf8',
        }}>
          {/* Pulsing dot */}
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isCompleted 
              ? isPassed ? '#22c55e' : '#ef4444'
              : '#6366f1',
            boxShadow: isCompleted
              ? isPassed ? '0 0 8px #22c55e' : '0 0 8px #ef4444'
              : '0 0 8px #6366f1',
            animation: !isCompleted ? 'pulse-glow 2s infinite' : 'none',
          }} />
          {isCompleted 
            ? isPassed ? 'Aprovado' : 'Reprovado'
            : 'Em andamento'}
        </div>
        
        {/* Progress Ring */}
        {percentage !== null && (
          <ProgressRing 
            percentage={percentage} 
            color={isPassed ? '#22c55e' : '#ef4444'}
          />
        )}
      </div>
      
      {/* Title */}
      <h3 style={{ 
        fontSize: 16, 
        fontWeight: 600, 
        marginBottom: 12,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: '#f4f4f5',
        letterSpacing: '-0.01em',
      }}>
        {simulado.titulo}
      </h3>
      
      {/* Info */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 20,
        color: '#52525b',
        fontSize: 13,
        fontWeight: 500,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.FileQuestion />
          <span>{simulado.total_questoes} questões</span>
        </div>
        
        {isCompleted && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6,
            color: isPassed ? '#4ade80' : '#f87171',
          }}>
            <Icons.Check />
            <span>{simulado.acertos}/{simulado.total_questoes} acertos</span>
          </div>
        )}
      </div>
      
      {/* Action Hint */}
      <div style={{
        marginTop: 18,
        paddingTop: 16,
        borderTop: '1px solid rgba(255,255,255,0.05)',
        fontSize: 13,
        color: '#818cf8',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        {isCompleted ? (
          <>
            <Icons.Trophy />
            Ver Gabarito
          </>
        ) : (
          <>
            <Icons.Play />
            Continuar
          </>
        )}
        <span style={{ marginLeft: 'auto' }}>→</span>
      </div>
    </div>
  );
}
