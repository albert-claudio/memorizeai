'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  Eye: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  EyeOff: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ),
  Google: () => (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  ),
  Apple: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  ),
  Mail: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  Lock: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12,5 19,12 12,19"/>
    </svg>
  ),
  Loader: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
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
    transition: 'all 0.2s ease',
  },
  inputWrapper: {
    position: 'relative' as const,
    marginBottom: 16,
  },
  inputIcon: {
    position: 'absolute' as const,
    left: 16,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-muted)',
    pointerEvents: 'none' as const,
  },
  eyeButton: {
    position: 'absolute' as const,
    right: 16,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: 4,
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
  socialButton: {
    background: 'var(--bg-muted)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  },
  primaryButton: {
    background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
    border: 'none',
    color: 'white',
    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    margin: '24px 0',
    color: 'var(--text-muted)',
    fontSize: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
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
};

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('E-mail ou senha incorretos.');
        } else if (error.message.includes('Email not confirmed')) {
          setError('E-mail não confirmado. Verifique sua caixa de entrada e clique no link de confirmação.');
        } else {
          setError(error.message);
        }
        return;
      }

      // Redirect to dashboard on success
      router.push('/dashboard');
    } catch {
      setError('Erro ao fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
    // Não precisa setGoogleLoading(false) em sucesso pois vai redirecionar
  };

  return (
    <div>
      {/* Global styles for spinner */}
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Bem-vindo de volta
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
          Entre na sua conta para continuar
        </p>
      </div>

      {/* Error Message */}
      {error && <div style={styles.error}>{error}</div>}
      
      {/* Social Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        <button 
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
          style={{ 
            ...styles.button, 
            ...styles.socialButton,
            opacity: googleLoading ? 0.7 : 1,
            cursor: googleLoading ? 'wait' : 'pointer',
          }}
        >
          {googleLoading ? (
            <>
              <Icons.Loader />
              Conectando...
            </>
          ) : (
            <>
              <Icons.Google />
              Continuar com Google
            </>
          )}
        </button>
        <button 
          type="button"
          style={{ ...styles.button, ...styles.socialButton, opacity: 0.5, cursor: 'not-allowed' }}
          disabled
        >
          <Icons.Apple />
          Continuar com Apple (em breve)
        </button>
      </div>
      
      {/* Divider */}
      <div style={styles.divider}>
        <div style={styles.dividerLine} />
        <span>ou</span>
        <div style={styles.dividerLine} />
      </div>
      
      {/* Form */}
      <form onSubmit={handleSubmit}>
        {/* Email */}
        <div style={styles.inputWrapper}>
          <div style={styles.inputIcon}>
            <Icons.Mail />
          </div>
          <input
            type="email"
            placeholder="Seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            required
            disabled={loading}
          />
        </div>
        
        {/* Password */}
        <div style={styles.inputWrapper}>
          <div style={styles.inputIcon}>
            <Icons.Lock />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            required
            disabled={loading}
          />
          <button
            type="button"
            style={styles.eyeButton}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <Icons.EyeOff /> : <Icons.Eye />}
          </button>
        </div>
        
        {/* Forgot Password */}
        <div style={{ textAlign: 'right', marginBottom: 24 }}>
          <Link 
            href="/esqueci-senha" 
            style={{ 
              fontSize: 14, 
              color: 'var(--accent)', 
              textDecoration: 'none',
            }}
          >
            Esqueceu a senha?
          </Link>
        </div>
        
        {/* Submit */}
        <button 
          type="submit" 
          style={{ 
            ...styles.button, 
            ...styles.primaryButton,
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
          disabled={loading}
        >
          {loading ? <Icons.Loader /> : <>Entrar <Icons.ArrowRight /></>}
        </button>
      </form>
      
      {/* Register Link */}
      <p style={{ 
        textAlign: 'center', 
        marginTop: 32, 
        fontSize: 15, 
        color: 'var(--text-secondary)' 
      }}>
        Não tem uma conta?{' '}
        <Link 
          href="/cadastro" 
          style={{ 
            color: 'var(--accent)', 
            fontWeight: 600, 
            textDecoration: 'none',
          }}
        >
          Criar conta grátis
        </Link>
      </p>
    </div>
  );
}
