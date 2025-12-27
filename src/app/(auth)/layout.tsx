'use client';

import Link from 'next/link';

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  Brain: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54"/>
    </svg>
  ),
  Sparkle: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  ),
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const features = [
    'Flashcards ilimitados',
    'Repetição espaçada inteligente',
    'Upload de PDF com IA',
    'Analytics de evolução',
  ];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--bg-base)',
    }}>
      {/* Left Panel - Branding (Desktop Only) */}
      <div style={{
        display: 'none',
        width: '50%',
        background: 'linear-gradient(135deg, #0A0A0A 0%, #111111 100%)',
        padding: 48,
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }} className="auth-panel-left">
        
        {/* Background Decoration */}
        <div style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 500,
          height: 500,
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 60%)',
          pointerEvents: 'none',
        }} />
        
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 44,
            height: 44,
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
        
        {/* Center Content */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 24,
            color: 'var(--accent)',
          }}>
            <Icons.Sparkle />
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.05em' }}>ESTUDE MENOS, APRENDA MAIS</span>
          </div>
          
          <h1 style={{
            fontSize: 40,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            marginBottom: 24,
          }}>
            A ciência da<br />
            <span className="text-gradient">memorização</span><br />
            ao seu lado.
          </h1>
          
          <p style={{
            fontSize: 18,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: 40,
            maxWidth: 400,
          }}>
            Flashcards inteligentes com IA que se adaptam ao seu ritmo de aprendizado.
          </p>
          
          {/* Features */}
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {features.map((f, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: 'rgba(34, 197, 94, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--success)',
                }}>
                  <Icons.Check />
                </div>
                <span style={{ fontSize: 16, color: 'var(--text-secondary)' }}>{f}</span>
              </li>
            ))}
          </ul>
        </div>
        
        {/* Footer */}
        <p style={{ fontSize: 14, color: 'var(--text-muted)', position: 'relative', zIndex: 1 }}>
          © 2024 MemorizeAI. Todos os direitos reservados.
        </p>
      </div>
      
      {/* Right Panel - Form */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        minHeight: '100vh',
      }}>
        {/* Mobile Logo */}
        <div className="auth-mobile-logo" style={{ display: 'none', marginBottom: 32 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Icons.Brain />
            </div>
            <span style={{ fontSize: 20, fontWeight: 700 }}>
              Memorize<span className="text-gradient">AI</span>
            </span>
          </Link>
        </div>
        
        {/* Form Container */}
        <div style={{ width: '100%', maxWidth: 400 }}>
          {children}
        </div>
      </div>
      
      {/* Responsive Styles */}
      <style jsx global>{`
        @media (min-width: 1024px) {
          .auth-panel-left {
            display: flex !important;
          }
          .auth-mobile-logo {
            display: none !important;
          }
        }
        @media (max-width: 1023px) {
          .auth-mobile-logo {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}
