'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  Brain: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54"/>
    </svg>
  ),
  CheckCircle: () => (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="9,12 12,15 16,10"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12,5 19,12 12,19"/>
    </svg>
  ),
};

export default function EmailConfirmadoPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>('');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    // Get user name
    const getUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.full_name) {
        setUserName(user.user_metadata.full_name.split(' ')[0]);
      }
    };
    getUser();

    // Countdown and redirect
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/dashboard');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: 24,
    }}>
      {/* Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', marginBottom: 48 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icons.Brain />
        </div>
        <span style={{ fontSize: 24, fontWeight: 700 }}>
          Memorize<span className="text-gradient">AI</span>
        </span>
      </Link>

      {/* Success Card */}
      <div style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: 24,
        padding: '48px 40px',
        textAlign: 'center',
        maxWidth: 440,
        width: '100%',
      }}>
        {/* Success Icon */}
        <div style={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          background: 'rgba(34, 197, 94, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 32px',
          color: 'var(--success)',
        }}>
          <Icons.CheckCircle />
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
          E-mail confirmado! 🎉
        </h1>
        
        <p style={{ 
          color: 'var(--text-secondary)', 
          fontSize: 16, 
          lineHeight: 1.6, 
          marginBottom: 32 
        }}>
          {userName ? (
            <>Parabéns, <strong>{userName}</strong>! Sua conta foi verificada com sucesso.</>
          ) : (
            <>Sua conta foi verificada com sucesso.</>
          )}
          <br />Você já pode começar a estudar.
        </p>

        <Link href="/dashboard">
          <button style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: '100%',
            padding: '18px 32px',
            background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
            border: 'none',
            borderRadius: 14,
            color: 'white',
            fontSize: 17,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
            transition: 'all 0.2s ease',
          }}>
            Ir para o Dashboard
            <Icons.ArrowRight />
          </button>
        </Link>

        <p style={{ 
          color: 'var(--text-muted)', 
          fontSize: 13, 
          marginTop: 20 
        }}>
          Redirecionando em {countdown} segundos...
        </p>
      </div>
    </div>
  );
}
