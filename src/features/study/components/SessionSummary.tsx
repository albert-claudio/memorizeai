
import Link from 'next/link';

interface SessionSummaryProps {
  results: { correct: number; wrong: number };
  deckId: string;
}

export function SessionSummary({ results, deckId }: SessionSummaryProps) {
  const total = results.correct + results.wrong;
  const percentage = total > 0 ? Math.round((results.correct / total) * 100) : 0;

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
        width: 120,
        height: 120,
        borderRadius: '50%',
        background: 'var(--bg-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
        position: 'relative',
      }}>
        <div style={{ 
          position: 'absolute',
          fontSize: 64,
        }}>
          🏆
        </div>
      </div>

      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>
        Sessão Concluída!
      </h1>
      <p style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 32 }}>
        Você revisou {total} cards hoje
      </p>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: 16,
        width: '100%',
        maxWidth: 320,
        marginBottom: 32,
      }}>
        <div style={{ 
          padding: 16, 
          background: 'rgba(34, 197, 94, 0.1)', 
          borderRadius: 16,
          border: '1px solid rgba(34, 197, 94, 0.2)',
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#22C55E' }}>
            {results.correct}
          </div>
          <div style={{ fontSize: 12, color: '#22C55E', fontWeight: 600 }}>ACERTOS</div>
        </div>
        <div style={{ 
          padding: 16, 
          background: 'rgba(239, 68, 68, 0.1)', 
          borderRadius: 16,
          border: '1px solid rgba(239, 68, 68, 0.2)',
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#EF4444' }}>
            {results.wrong}
          </div>
          <div style={{ fontSize: 12, color: '#EF4444', fontWeight: 600 }}>ERROS</div>
        </div>
      </div>

      <div style={{ 
        fontSize: 14, 
        color: 'var(--text-muted)',
        marginBottom: 40,
        background: 'var(--bg-muted)',
        padding: '8px 16px',
        borderRadius: 20,
      }}>
        Precisão: <strong style={{ color: 'var(--text-primary)' }}>{percentage}%</strong>
      </div>

      <Link href={`/deck/${deckId}`} style={{ textDecoration: 'none', width: '100%', maxWidth: 320 }}>
        <button style={{
          width: '100%',
          padding: '16px',
          background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
          border: 'none',
          borderRadius: 16,
          color: 'white',
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
        }}>
          Voltar ao Deck
        </button>
      </Link>
    </div>
  );
}
