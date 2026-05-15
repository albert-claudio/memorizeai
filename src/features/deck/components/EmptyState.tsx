import { Icons } from './Icons';

interface EmptyStateProps {
  onGenerateWithAI: () => void;
}

export function EmptyState({ onGenerateWithAI }: EmptyStateProps) {
  return (
    <div
      style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: 64,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: 'rgba(99, 102, 241, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          color: 'var(--accent)',
        }}
      >
        <Icons.Brain />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Nenhum card ainda
      </h2>
      <p style={{ color: 'var(--text-secondary)', margin: '0 auto 24px', maxWidth: 400 }}>
        Gere os primeiros cards com IA a partir do seu material e entre no estudo com o deck pronto.
      </p>
      <button
        onClick={onGenerateWithAI}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '16px 32px',
          background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
          border: 'none',
          borderRadius: 12,
          color: 'white',
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
        }}
      >
        <Icons.Plus />
        Gerar com IA
      </button>
    </div>
  );
}
