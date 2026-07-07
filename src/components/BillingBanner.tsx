'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// ============================================================================
// BILLING STATUS BANNER
// ============================================================================
// Shows actionable billing messages based on subscription state.
// Renders nothing for healthy active subscriptions or free users without history.

interface SubscriptionStatus {
  isPro: boolean;
  status: string;
  tier: string;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
  isTrial?: boolean;
  isBeta?: boolean;
}

interface BannerConfig {
  color: 'yellow' | 'blue' | 'red';
  icon: string;
  message: string;
  action?: { label: string; href: string };
}

const COLORS = {
  yellow: {
    bg: 'rgba(245, 158, 11, 0.1)',
    border: 'rgba(245, 158, 11, 0.3)',
    text: '#FBBF24',
    icon: '#F59E0B',
  },
  blue: {
    bg: 'rgba(59, 130, 246, 0.1)',
    border: 'rgba(59, 130, 246, 0.3)',
    text: '#93C5FD',
    icon: '#3B82F6',
  },
  red: {
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.3)',
    text: '#FCA5A5',
    icon: '#EF4444',
  },
};

function formatDate(ts: number | null): string {
  if (!ts) return 'data indisponível';
  return new Date(ts).toLocaleDateString('pt-BR');
}

export function getBillingBannerConfig(sub: SubscriptionStatus): BannerConfig | null {
  const dateLabel = formatDate(sub.periodEnd);

  if (sub.isTrial && sub.isActive) {
    return {
      color: 'blue',
      icon: '*',
      message: sub.periodEnd
        ? `Seu teste gratis esta ativo ate ${dateLabel}.`
        : 'Seu teste gratis esta ativo.',
      action: {
        label: 'Assinar Pro',
        href: '/upgrade',
      },
    };
  }

  // Past due — payment failed but still has access
  if (sub.status === 'past_due') {
    return {
      color: 'yellow',
      icon: '⚠️',
      message: `Seu pagamento falhou. Você mantém acesso Pro até ${dateLabel}.`,
      action: {
        label: 'Atualizar pagamento',
        href: '/api/stripe/create-portal',
      },
    };
  }

  // Canceled with cancelAtPeriodEnd — still active until cycle end
  if (sub.status === 'active' && sub.cancelAtPeriodEnd) {
    return {
      color: 'blue',
      icon: '📅',
      message: `Sua assinatura foi cancelada e segue ativa até ${dateLabel}.`,
      action: {
        label: 'Reativar assinatura',
        href: '/api/stripe/create-portal',
      },
    };
  }

  // Canceled and period expired — back to free
  if (sub.status === 'canceled' && !sub.isActive) {
    return {
      color: 'red',
      icon: '🔴',
      message: 'Sua assinatura expirou. Você está no plano gratuito.',
      action: {
        label: 'Voltar para Pro',
        href: '/upgrade',
      },
    };
  }

  // Incomplete — checkout started but never finished
  if (sub.status === 'incomplete') {
    return {
      color: 'red',
      icon: '⚠️',
      message: 'Seu pagamento não foi concluído.',
      action: {
        label: 'Completar pagamento',
        href: '/api/stripe/create-portal',
      },
    };
  }

  return null;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface BillingBannerProps {
  /** If provided, uses this data instead of fetching */
  subscription?: SubscriptionStatus | null;
}

export function BillingBanner({ subscription: externalSub }: BillingBannerProps) {
  const [sub, setSub] = useState<SubscriptionStatus | null>(externalSub ?? null);
  const [loading, setLoading] = useState(!externalSub);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (externalSub !== undefined) {
      setSub(externalSub);
      setLoading(false);
      return;
    }

    let mounted = true;
    fetch('/api/stripe/subscription-status', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (mounted) setSub(data); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, [externalSub]);

  if (loading || !sub) return null;

  const config = getBillingBannerConfig(sub);
  if (!config) return null;

  const colors = COLORS[config.color];

  const handlePortalAction = async (e: React.MouseEvent) => {
    const href = config.action?.href;
    if (!href || !href.startsWith('/api/stripe/create-portal')) return;

    e.preventDefault();
    setPortalLoading(true);

    try {
      const response = await fetch(href, { method: 'POST' });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Fallback to upgrade page
      window.location.href = '/upgrade';
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div style={{
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 12,
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
        <span style={{ fontSize: 18 }}>{config.icon}</span>
        <p style={{
          color: colors.text,
          fontSize: 14,
          lineHeight: 1.5,
          margin: 0,
        }}>
          {config.message}
        </p>
      </div>

      {config.action && (
        config.action.href.startsWith('/api/') ? (
          <button
            onClick={handlePortalAction}
            disabled={portalLoading}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              background: colors.bg,
              color: colors.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: portalLoading ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
              opacity: portalLoading ? 0.7 : 1,
            }}
          >
            {portalLoading ? 'Carregando...' : config.action.label}
          </button>
        ) : (
          <Link
            href={config.action.href}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              background: colors.bg,
              color: colors.text,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {config.action.label}
          </Link>
        )
      )}
    </div>
  );
}
