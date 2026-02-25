
import { Icons } from '@/features/deck/components/Icons';

interface WaitingScreenProps {
  relearningCount: number;
  remainingSeconds: number;
  onFinish: () => void;
}

export function WaitingScreen({ relearningCount, remainingSeconds, onFinish }: WaitingScreenProps) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: 24,
      textAlign: 'center',
    }}>
      <div style={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          background: 'rgba(245, 158, 11, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          color: '#F59E0B',
      }}>
        <Icons.Loader /> {/* Using Loader as Clock for now */}
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Aguardando revisão... ⏳
      </h1>
      <p style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Você errou {relearningCount} card{relearningCount > 1 ? 's' : ''}. 
        {relearningCount === 1 ? ' Ele' : ' Eles'} voltará{relearningCount > 1 ? 'ão' : ''} em:
      </p>
      <div style={{
        fontSize: 48,
        fontWeight: 800,
        color: '#F59E0B',
        fontVariantNumeric: 'tabular-nums',
        marginBottom: 24,
      }}>
        {minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`}
      </div>
      <button
        onClick={onFinish}
        style={{
          padding: '14px 28px',
          background: 'var(--bg-muted)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          color: 'var(--text-secondary)',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Encerrar sessão agora
      </button>
    </div>
  );
}
