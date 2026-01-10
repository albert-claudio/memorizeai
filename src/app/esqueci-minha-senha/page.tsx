'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  Mail: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12,5 19,12 12,19"/>
    </svg>
  ),
  Loader: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ),
  Check: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  ),
};

// ============================================================================
// STYLES
// ============================================================================
const styles = {
  input: {
    width: '100%',
    height: 56,
    padding: '0 16px 0 48px',
    fontSize: 16,
    background: 'var(--bg-muted)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--text-primary)',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  inputIcon: {
    position: 'absolute' as const,
    left: 16,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-muted)',
    pointerEvents: 'none' as const,
  },
  button: {
    width: '100%',
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  primaryButton: {
    background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
    border: 'none',
    color: 'white',
    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
  },
  error: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: '12px 16px',
    color: '#F87171',
    fontSize: 14,
    marginBottom: 16,
  },
  success: {
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: 12,
    padding: '24px',
    color: '#4ADE80',
    fontSize: 14,
    textAlign: 'center' as const,
  },
};

// ============================================================================
// PAGE
// ============================================================================
export default function EsqueciMinhaSenhaPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      });
      
      if (error) {
        throw error;
      }
      
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar email de recuperação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {/* Logo */}
      <Link href="/" style={{ 
        fontSize: 28, 
        fontWeight: 800, 
        letterSpacing: '-0.02em',
        background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 50%, #EC4899 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        textDecoration: 'none',
        marginBottom: 48,
      }}>
        Vimens
      </Link>
      
      {/* Form Container */}
      <div style={{ width: '100%', maxWidth: 400 }}>
        {success ? (
          <div style={styles.success}>
            <div style={{ 
              width: 56, 
              height: 56, 
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#4ADE80',
            }}>
              <Icons.Check />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
              Email enviado!
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
              Verifique sua caixa de entrada em <strong>{email}</strong>. 
              Clique no link que enviamos para redefinir sua senha.
            </p>
            <Link href="/login" style={{ 
              color: 'var(--accent)', 
              textDecoration: 'none',
              fontSize: 14,
            }}>
              ← Voltar para o login
            </Link>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h1 style={{ 
                fontSize: 24, 
                fontWeight: 700, 
                marginBottom: 8,
                color: 'var(--text-primary)',
              }}>
                Esqueceu sua senha?
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Digite seu email e enviaremos um link para redefinir sua senha.
              </p>
            </div>
            
            {error && (
              <div style={styles.error}>
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              {/* Email */}
              <div style={{ position: 'relative', marginBottom: 16 }}>
                <span style={styles.inputIcon}>
                  <Icons.Mail />
                </span>
                <input
                  type="email"
                  placeholder="Seu email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>
              
              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{ 
                  ...styles.button, 
                  ...styles.primaryButton,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: 24,
                }}
              >
                {loading ? <Icons.Loader /> : (
                  <>
                    Enviar link de recuperação
                    <Icons.ArrowRight />
                  </>
                )}
              </button>
            </form>
            
            <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
              Lembrou a senha?{' '}
              <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                Fazer login
              </Link>
            </p>
          </>
        )}
      </div>
      
      {/* Spinner animation */}
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
