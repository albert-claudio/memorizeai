'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trackAuthenticated } from '@/lib/analytics/tracker';
import { BillingBanner } from '@/components/BillingBanner';

// ============================================================================
// ICONS
// ============================================================================
const Icons = {
  ArrowLeft: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12,19 5,12 12,5"/>
    </svg>
  ),
  Check: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  ),
  Crown: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>
    </svg>
  ),
  Sparkles: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  ),
  Shield: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Loader: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ),
};

interface SubscriptionStatus {
  isPro: boolean;
  status: string;
  tier: string;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
}

interface ProOffer {
  formattedPrice: string;
  periodLabel: string;
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Ativa';
    case 'past_due':
      return 'Pagamento pendente';
    case 'canceled':
      return 'Cancelada';
    case 'incomplete':
      return 'Incompleta';
    default:
      return 'Free';
  }
}

export default function UpgradePage() {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [offer, setOffer] = useState<ProOffer | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadSubscription = async () => {
      try {
        const response = await fetch('/api/stripe/subscription-status', { cache: 'no-store' });
        if (!mounted) return;

        if (response.ok) {
          const data = await response.json();
          setSubscription(data);
        } else {
          setSubscription(null);
        }
      } catch {
        if (mounted) setSubscription(null);
      } finally {
        if (mounted) setStatusLoading(false);
      }
    };

    const loadOffer = async () => {
      try {
        const response = await fetch('/api/stripe/offer', { cache: 'no-store' });
        if (!mounted || !response.ok) return;
        const data = await response.json();
        setOffer(data);
      } catch {
        // keep UI fallback values
      }
    };

    loadSubscription();
    loadOffer();
    trackAuthenticated('upgrade_view');

    return () => {
      mounted = false;
    };
  }, []);

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    trackAuthenticated('checkout_click', { source: 'upgrade_page' });
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey: 'pro_monthly' }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('Erro ao criar checkout:', data.error);
        alert('Erro ao iniciar checkout. Tente novamente.');
        setCheckoutLoading(false);
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao conectar. Tente novamente.');
      setCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const response = await fetch('/api/stripe/create-portal', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('Erro ao criar portal:', data.error);
        alert('Erro ao abrir gerenciamento da assinatura. Tente novamente.');
        setPortalLoading(false);
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao conectar. Tente novamente.');
      setPortalLoading(false);
    }
  };

  const hasSubscription = !!subscription && subscription.status !== 'free';
  const isBusy = checkoutLoading || portalLoading || statusLoading;

  const features = [
    'Decks ilimitados',
    'Até 10.000 cards por deck',
    'Uploads ilimitados de PDF, DOCX e PPTX',
    'Geracao ilimitada de flashcards por IA',
    'Simulados por banca: FGV, FCC e CESPE',
    'FSRS avancado com ajuste de retencao',
    'Revisao detalhada de erros e reforco',
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#f4f4f5',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.3), 0 0 80px rgba(139, 92, 246, 0.2); }
          50% { box-shadow: 0 0 60px rgba(99, 102, 241, 0.5), 0 0 100px rgba(139, 92, 246, 0.3); }
        }
      `}</style>

      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: 'rgba(15, 15, 15, 0.8)',
        backdropFilter: 'blur(20px)',
      }}>
        <Link
          href="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#71717a',
            textDecoration: 'none',
          }}
        >
          <Icons.ArrowLeft />
        </Link>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Upgrade para Pro
          </h1>
        </div>
      </header>

      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          width: '100%',
          maxWidth: 420,
        }}>
          {/* Billing status banner */}
          {subscription && (
            <div style={{ marginBottom: 20 }}>
              <BillingBanner subscription={subscription} />
            </div>
          )}

          <div style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 50%, rgba(236, 72, 153, 0.1) 100%)',
            border: '2px solid rgba(99, 102, 241, 0.3)',
            borderRadius: 24,
            padding: 32,
            animation: 'pulse-glow 3s ease-in-out infinite',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: '#000',
              }}>
                <Icons.Crown />
              </div>
              <h2 style={{
                fontSize: 28,
                fontWeight: 800,
                marginBottom: 8,
                background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 50%, #EC4899 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                Vimens Pro
              </h2>
              <p style={{ color: '#a1a1aa', fontSize: 14 }}>
                Desbloqueie todo o potencial do Vimens
              </p>
            </div>

            <div style={{
              textAlign: 'center',
              padding: '20px 0',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              marginBottom: 24,
            }}>
              <span style={{
                fontSize: 48,
                fontWeight: 800,
                background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                {offer?.formattedPrice || 'R$29'}
              </span>
              <span style={{ color: '#71717a', fontSize: 16 }}>{offer?.periodLabel || '/mes'}</span>
            </div>

            {!statusLoading && subscription && (
              <div style={{
                marginBottom: 20,
                padding: 14,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 6 }}>
                  Plano atual: <strong style={{ color: '#f4f4f5' }}>{subscription.tier || 'free'}</strong>
                </p>
                <p style={{ fontSize: 13, color: '#a1a1aa' }}>
                  Status: <strong style={{ color: '#f4f4f5' }}>{formatStatusLabel(subscription.status)}</strong>
                </p>
                {subscription.periodEnd && (
                  <p style={{ fontSize: 12, color: '#71717a', marginTop: 6 }}>
                    {subscription.isActive ? 'Renova em' : 'Vigente ate'}: {new Date(subscription.periodEnd).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
            )}

            <ul style={{ listStyle: 'none', marginBottom: 28 }}>
              {features.map((feature, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: i < features.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <span style={{
                    color: '#22c55e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'rgba(34, 197, 94, 0.15)',
                  }}>
                    <Icons.Check />
                  </span>
                  <span style={{ fontSize: 15 }}>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={hasSubscription ? handleManageSubscription : handleUpgrade}
              disabled={isBusy}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '18px 32px',
                background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%)',
                border: 'none',
                borderRadius: 14,
                color: 'white',
                fontSize: 17,
                fontWeight: 700,
                cursor: isBusy ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 24px rgba(99, 102, 241, 0.4)',
                opacity: isBusy ? 0.7 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              {isBusy ? (
                <Icons.Loader />
              ) : (
                <>
                  <Icons.Sparkles />
                  {hasSubscription ? 'Gerenciar assinatura' : 'Comece agora!'}
                </>
              )}
            </button>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 24,
            color: '#71717a',
            fontSize: 13,
          }}>
            <Icons.Shield />
            <span>Cancele quando quiser</span>
          </div>
        </div>
      </main>
    </div>
  );
}
