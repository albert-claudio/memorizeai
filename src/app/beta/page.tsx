'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const styles = {
  page: {
    minHeight: '100vh',
    background: '#050507',
    color: '#f4f4f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    background: '#0A0A0A',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    marginBottom: 8,
    letterSpacing: '-0.02em',
  },
  body: {
    color: '#a1a1aa',
    fontSize: 15,
    lineHeight: 1.6,
    marginBottom: 24,
  },
  input: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: '#09090b',
    color: '#fff',
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textAlign: 'center' as const,
    outline: 'none',
    marginBottom: 14,
  },
  button: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  },
  message: {
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 14,
    lineHeight: 1.5,
    marginBottom: 14,
  },
};

function formatDate(ms: number | null): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('pt-BR');
}

export default function BetaPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const redeem = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch('/api/beta/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || 'Nao foi possivel ativar o beta.');
        return;
      }

      const dateLabel = data.trialEndsAt && data.trialEndsAt < Date.UTC(2099, 0, 1)
        ? ` ate ${formatDate(data.trialEndsAt)}`
        : '';
      setSuccess(`Beta ativado com recursos Pro${dateLabel}.`);
      window.setTimeout(() => router.push('/dashboard'), 1200);
    } catch {
      setError('Erro de conexao. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <div style={{ fontSize: 12, color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Beta privado
        </div>
        <h1 style={styles.title}>Ativar acesso</h1>
        <p style={styles.body}>
          Entre com o codigo enviado para o seu email. O acesso beta fica vinculado a esta conta.
        </p>

        {error && (
          <div style={{ ...styles.message, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)', color: '#f87171' }}>
            {error}
            {error.includes('login') && (
              <div style={{ marginTop: 10 }}>
                <Link href="/login" style={{ color: '#fca5a5', fontWeight: 700, textDecoration: 'none' }}>Fazer login</Link>
                <span style={{ color: '#71717a' }}> ou </span>
                <Link href="/cadastro" style={{ color: '#fca5a5', fontWeight: 700, textDecoration: 'none' }}>criar conta</Link>
              </div>
            )}
          </div>
        )}

        {success && (
          <div style={{ ...styles.message, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.28)', color: '#4ade80' }}>
            {success}
          </div>
        )}

        <form onSubmit={redeem}>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            disabled={loading}
            style={styles.input}
          />
          <button
            type="submit"
            disabled={loading || code.trim().length < 6}
            style={{
              ...styles.button,
              opacity: loading || code.trim().length < 6 ? 0.55 : 1,
              cursor: loading || code.trim().length < 6 ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Ativando...' : 'Ativar beta'}
          </button>
        </form>

        <p style={{ color: '#52525b', fontSize: 13, lineHeight: 1.5, marginTop: 18 }}>
          Use a mesma conta do email convidado.
        </p>
      </section>
    </main>
  );
}
