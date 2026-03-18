'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { RetentionSlider } from '@/components/RetentionSlider';
import { BillingBanner } from '@/components/BillingBanner';
import { DEFAULT_RETENTION } from '@/lib/fsrs/weights';

const Icons = {
  ArrowLeft: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12,19 5,12 12,5" />
    </svg>
  ),
  Brain: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54" />
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  ),
  Loader: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  ),
  Zap: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Info: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  ),
  Lock: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Crown: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
      <path d="M5 16h14v2H5z" />
    </svg>
  ),
};

interface UserSettings {
  desiredRetention: number;
  calibrationEnabled: boolean;
  reviewCountSinceCalibration: number;
  lastCalibrationAt: number | null;
}

interface SubscriptionStatus {
  isPro: boolean;
  status: string;
  tier: string;
  periodStart: number | null;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
  refundEligibleUntil: number | null;
  refundEligible: boolean;
}

function formatDateBR(value: number | null): string {
  if (!value) return 'data indisponivel';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatCurrency(amountInMinorUnits: number | null, currency: string | null): string {
  if (amountInMinorUnits === null || !currency) {
    return 'valor indisponivel';
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountInMinorUnits / 100);
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [settings, setSettings] = useState<UserSettings>({
    desiredRetention: DEFAULT_RETENTION,
    calibrationEnabled: true,
    reviewCountSinceCalibration: 0,
    lastCalibrationAt: null,
  });

  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelingPlan, setCancelingPlan] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundingPlan, setRefundingPlan] = useState(false);
  const [billingFeedback, setBillingFeedback] = useState<string | null>(null);
  const [billingFeedbackType, setBillingFeedbackType] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();

        if (!authUser) {
          router.push('/login');
          return;
        }

        setUser(authUser);

        const { data: srsSettings } = await supabase
          .from('user_srs_settings')
          .select('*')
          .eq('user_id', authUser.id)
          .single();

        if (srsSettings) {
          setSettings({
            desiredRetention: srsSettings.desired_retention ?? DEFAULT_RETENTION,
            calibrationEnabled: srsSettings.calibration_enabled ?? true,
            reviewCountSinceCalibration: srsSettings.review_count_since_calibration ?? 0,
            lastCalibrationAt: srsSettings.last_calibration_at,
          });
        }

        const subscriptionResponse = await fetch('/api/stripe/subscription-status', { cache: 'no-store' });
        if (subscriptionResponse.ok) {
          const subscriptionData = await subscriptionResponse.json();
          setSubscription(subscriptionData);
        } else {
          setSubscription(null);
        }
      } catch {
        setSubscription(null);
      } finally {
        setSubscriptionLoading(false);
        setLoading(false);
      }
    };

    loadData();
  }, [router, supabase]);

  const isPro = Boolean(
    subscription &&
    subscription.isActive &&
    subscription.isPro
  );

  const handleRetentionChange = useCallback(async (value: number) => {
    if (!isPro) return;
    setSettings((previous) => ({ ...previous, desiredRetention: value }));
    setSaving(true);
    setSaved(false);

    const { error } = await supabase
      .from('user_srs_settings')
      .upsert({
        user_id: user?.id,
        desired_retention: value,
        updated_at: Date.now(),
      }, {
        onConflict: 'user_id',
      });

    setSaving(false);

    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [supabase, user, isPro]);

  const handleCalibrationToggle = useCallback(async () => {
    if (!isPro) return;
    const newValue = !settings.calibrationEnabled;
    setSettings((previous) => ({ ...previous, calibrationEnabled: newValue }));

    await supabase
      .from('user_srs_settings')
      .upsert({
        user_id: user?.id,
        calibration_enabled: newValue,
        updated_at: Date.now(),
      }, {
        onConflict: 'user_id',
      });
  }, [settings.calibrationEnabled, supabase, user, isPro]);

  const handleConfirmCancelPlan = useCallback(async () => {
    setCancelingPlan(true);
    setBillingFeedback(null);
    setBillingFeedbackType(null);

    try {
      const response = await fetch('/api/stripe/cancel-subscription', { method: 'POST' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setBillingFeedback(data.error || 'Nao foi possivel agendar o cancelamento.');
        setBillingFeedbackType('error');
        return;
      }

      setSubscription((previous) => {
        if (!previous) {
          return {
            isPro: true,
            status: 'active',
            tier: 'pro',
            periodStart: data.periodStart ?? null,
            periodEnd: data.periodEnd ?? null,
            cancelAtPeriodEnd: true,
            isActive: true,
            refundEligibleUntil: null,
            refundEligible: false,
          };
        }

        return {
          ...previous,
          periodStart: data.periodStart ?? previous.periodStart,
          periodEnd: data.periodEnd ?? previous.periodEnd,
          cancelAtPeriodEnd: true,
        };
      });

      const effectiveDate = data.periodEnd ? new Date(data.periodEnd).toLocaleDateString('pt-BR') : null;
      setBillingFeedback(
        effectiveDate
          ? `Cancelamento agendado. Seus beneficios continuam ate ${effectiveDate}.`
          : 'Cancelamento agendado para o fim do ciclo atual.'
      );
      setBillingFeedbackType('success');
      setCancelModalOpen(false);
    } catch {
      setBillingFeedback('Erro de conexao ao tentar cancelar o plano.');
      setBillingFeedbackType('error');
    } finally {
      setCancelingPlan(false);
    }
  }, []);

  const handleConfirmRefund = useCallback(async () => {
    setRefundingPlan(true);
    setBillingFeedback(null);
    setBillingFeedbackType(null);

    try {
      const response = await fetch('/api/stripe/refund-subscription', { method: 'POST' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setBillingFeedback(data.error || 'Nao foi possivel processar o reembolso automatico.');
        setBillingFeedbackType('error');
        return;
      }

      setSubscription((previous) => {
        if (!previous) {
          return {
            isPro: false,
            status: 'canceled',
            tier: 'free',
            periodStart: null,
            periodEnd: data.subscriptionCanceledAt ?? null,
            cancelAtPeriodEnd: false,
            isActive: false,
            refundEligibleUntil: null,
            refundEligible: false,
          };
        }

        return {
          ...previous,
          isPro: false,
          status: 'canceled',
          tier: 'free',
          periodEnd: data.subscriptionCanceledAt ?? previous.periodEnd,
          cancelAtPeriodEnd: false,
          isActive: false,
        };
      });

      const refundedAmount = formatCurrency(
        typeof data.amountRefunded === 'number' ? data.amountRefunded : null,
        typeof data.currency === 'string' ? data.currency : null,
      );
      setBillingFeedback(`Reembolso integral solicitado com sucesso. ${refundedAmount} sera estornado e o plano foi cancelado imediatamente.`);
      setBillingFeedbackType('success');
      setRefundModalOpen(false);
      setCancelModalOpen(false);
    } catch {
      setBillingFeedback('Erro de conexao ao tentar processar o reembolso.');
      setBillingFeedbackType('error');
    } finally {
      setRefundingPlan(false);
    }
  }, []);

  const hasPaidSubscription = Boolean(
    subscription &&
    subscription.status !== 'free' &&
    subscription.tier !== 'free'
  );
  const cycleStartLabel = formatDateBR(subscription?.periodStart ?? null);
  const cycleEndLabel = formatDateBR(subscription?.periodEnd ?? null);
  const refundDeadline = subscription?.refundEligibleUntil ?? null;
  const refundDeadlineLabel = formatDateBR(refundDeadline);
  const canRequestRefund = Boolean(
    hasPaidSubscription &&
    subscription?.refundEligible
  );

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
      }}>
        <Icons.Loader />
        <style jsx global>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ padding: '24px 24px 0', maxWidth: 700, margin: '0 auto', display: 'flex', justifyContent: 'flex-end', height: 40 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          borderRadius: 10,
          background: saved ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
          color: saved ? '#22C55E' : '#a1a1aa',
          fontSize: 14,
          fontWeight: 500,
          transition: 'all 0.3s ease',
        }}>
          {saving ? (
            <>
              <Icons.Loader />
              Salvando...
            </>
          ) : saved ? (
            <>
              <Icons.Check />
              Salvo!
            </>
          ) : null}
        </div>
      </div>

      <main style={{
        padding: '32px 24px',
        maxWidth: 700,
        margin: '0 auto',
      }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 8,
          letterSpacing: '-0.03em',
          color: '#f4f4f5',
        }}>
          Algoritmo de Repeticao
        </h1>
        <p style={{
          color: '#71717a',
          fontSize: 15,
          marginBottom: 32,
        }}>
          Personalize o algoritmo FSRS para se adaptar ao seu estilo de estudo
        </p>

        <section style={{ marginBottom: 32, position: 'relative' }}>
          {!isPro && (
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              borderRadius: 16,
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 24px rgba(99, 102, 241, 0.4)',
                color: '#fff',
              }}>
                <Icons.Lock />
              </div>
              <p style={{
                color: '#e4e4e7',
                fontSize: 15,
                fontWeight: 600,
                margin: 0,
                textAlign: 'center',
              }}>
                Ajuste de retencao exclusivo Pro
              </p>
              <Link
                href="/upgrade"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 20px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                <Icons.Crown />
                Fazer upgrade
              </Link>
            </div>
          )}
          <RetentionSlider
            value={settings.desiredRetention}
            onChange={handleRetentionChange}
            disabled={saving || !isPro}
            showPreview={true}
          />
        </section>

        <section style={{
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: 16,
          padding: 20,
          marginBottom: 32,
        }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ color: '#6366F1', marginTop: 2 }}>
              <Icons.Info />
            </div>
            <div>
              <h3 style={{
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 6,
                color: '#e4e4e7',
              }}>
                Como funciona?
              </h3>
              <p style={{
                fontSize: 14,
                color: '#a1a1aa',
                lineHeight: 1.6,
              }}>
                O algoritmo FSRS usa o <strong style={{ color: '#e4e4e7' }}>Spacing Effect</strong>:
                quando voce revisa um card perto de esquecer, a estabilidade aumenta mais do que revisar cards frescos.
              </p>
            </div>
          </div>
        </section>

        <section style={{
          background: 'var(--bg-muted, #111)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
          padding: 20,
          marginBottom: 32,
          position: 'relative',
        }}>
          {!isPro && (
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              borderRadius: 16,
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}>
              <div style={{ color: '#a78bfa' }}>
                <Icons.Lock />
              </div>
              <p style={{
                color: '#d4d4d8',
                fontSize: 14,
                fontWeight: 600,
                margin: 0,
              }}>
                Recurso exclusivo Pro
              </p>
            </div>
          )}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F59E0B',
              }}>
                <Icons.Zap />
              </div>
              <div>
                <h3 style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#e4e4e7',
                }}>
                  Calibracao automatica
                </h3>
                <p style={{
                  fontSize: 13,
                  color: '#71717a',
                }}>
                  Otimiza os pesos a cada ~500 revisoes
                </p>
              </div>
            </div>

            <button
              onClick={handleCalibrationToggle}
              disabled={!isPro}
              style={{
                width: 52,
                height: 30,
                borderRadius: 15,
                border: 'none',
                background: settings.calibrationEnabled
                  ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)'
                  : 'rgba(255,255,255,0.1)',
                cursor: isPro ? 'pointer' : 'not-allowed',
                position: 'relative',
                transition: 'background 0.3s ease',
                opacity: isPro ? 1 : 0.5,
              }}
            >
              <div style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'white',
                position: 'absolute',
                top: 4,
                left: settings.calibrationEnabled ? 26 : 4,
                transition: 'left 0.3s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>

          <div style={{
            display: 'flex',
            gap: 16,
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#71717a', marginBottom: 4 }}>
                Revisoes desde ultima calibracao
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#e4e4e7' }}>
                {settings.reviewCountSinceCalibration}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#71717a', marginBottom: 4 }}>
                Ultima calibracao
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#e4e4e7' }}>
                {settings.lastCalibrationAt
                  ? new Date(settings.lastCalibrationAt).toLocaleDateString('pt-BR')
                  : 'Nunca'}
              </div>
            </div>
          </div>
        </section>

        <section style={{
          background: 'rgba(239, 68, 68, 0.07)',
          border: '1px solid rgba(239, 68, 68, 0.22)',
          borderRadius: 16,
          padding: 20,
          marginBottom: 32,
        }}>
          <h3 style={{
            fontSize: 17,
            fontWeight: 700,
            marginBottom: 10,
            color: '#f4f4f5',
          }}>
            Assinatura e cancelamento
          </h3>

          {/* Billing status banner */}
          {subscription && (
            <div style={{ marginBottom: 16 }}>
              <BillingBanner subscription={subscription} />
            </div>
          )}

          <p style={{
            fontSize: 13,
            color: '#a1a1aa',
            marginBottom: 16,
            lineHeight: 1.6,
          }}>
            Ao cancelar, os beneficios Pro nao somem na hora. Eles ficam ativos ate o fim do ciclo atual.
          </p>

          {billingFeedback && (
            <div style={{
              borderRadius: 10,
              background: billingFeedbackType === 'error'
                ? 'rgba(239,68,68,0.12)'
                : 'rgba(34,197,94,0.12)',
              border: billingFeedbackType === 'error'
                ? '1px solid rgba(239,68,68,0.3)'
                : '1px solid rgba(34,197,94,0.3)',
              color: billingFeedbackType === 'error' ? '#fecaca' : '#86efac',
              fontSize: 13,
              padding: '10px 12px',
              marginBottom: 14,
            }}>
              {billingFeedback}
            </div>
          )}

          {subscriptionLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1aa', fontSize: 13 }}>
              <Icons.Loader />
              Carregando dados da assinatura...
            </div>
          ) : !hasPaidSubscription ? (
            <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0 }}>
              Nenhum plano ativo encontrado.
            </p>
          ) : (
            <>
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: 14,
                marginBottom: 14,
              }}>
                <p style={{ fontSize: 13, color: '#d4d4d8', marginBottom: 6 }}>
                  Plano atual: <strong>{subscription?.tier || 'pro'}</strong>
                </p>
                <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 0 }}>
                  {subscription?.cancelAtPeriodEnd
                    ? `Cancelamento agendado para ${cycleEndLabel}.`
                    : `Ciclo atual termina em ${cycleEndLabel}.`}
                </p>
                <p style={{ fontSize: 13, color: canRequestRefund ? '#fcd34d' : '#71717a', marginTop: 8, marginBottom: 0 }}>
                  {canRequestRefund
                    ? `Reembolso integral disponivel ate ${refundDeadlineLabel}.`
                    : 'A elegibilidade para reembolso automatico depende da data do ultimo pagamento elegivel validada no Stripe.'}
                </p>
              </div>

              {canRequestRefund && (
                <button
                  onClick={() => setRefundModalOpen(true)}
                  disabled={refundingPlan}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '13px 18px',
                    borderRadius: 12,
                    border: '1px solid rgba(245, 158, 11, 0.45)',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#fcd34d',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: refundingPlan ? 'not-allowed' : 'pointer',
                    marginBottom: 12,
                    opacity: refundingPlan ? 0.7 : 1,
                  }}
                >
                  {refundingPlan ? 'Processando reembolso...' : 'Solicitar reembolso integral'}
                </button>
              )}

              <button
                onClick={() => setCancelModalOpen(true)}
                disabled={subscription?.cancelAtPeriodEnd || cancelingPlan || refundingPlan}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '13px 18px',
                  borderRadius: 12,
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  background: subscription?.cancelAtPeriodEnd
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(239, 68, 68, 0.16)',
                  color: subscription?.cancelAtPeriodEnd ? '#a1a1aa' : '#fca5a5',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: subscription?.cancelAtPeriodEnd || refundingPlan ? 'not-allowed' : 'pointer',
                }}
              >
                {subscription?.cancelAtPeriodEnd ? 'Cancelamento ja agendado' : 'Cancelar plano'}
              </button>
            </>
          )}
        </section>


      </main>

      {cancelModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          zIndex: 120,
        }}>
          <div style={{
            width: '100%',
            maxWidth: 520,
            borderRadius: 16,
            background: '#111',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: 22,
          }}>
            <h3 style={{ fontSize: 20, color: '#f4f4f5', marginBottom: 12 }}>
              Confirmar cancelamento do plano
            </h3>
            <p style={{ fontSize: 14, color: '#d4d4d8', lineHeight: 1.6, marginBottom: 10 }}>
              O cancelamento nao remove seus beneficios agora. Eles continuam ativos ate o fim do ciclo atual.
            </p>
            <p style={{ fontSize: 14, color: '#fca5a5', lineHeight: 1.6, marginBottom: 10 }}>
              Data do cancelamento efetivo: <strong>{cycleEndLabel}</strong>.
            </p>
            {subscription?.periodStart ? (
              <p style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.6, marginBottom: 18 }}>
                Exemplo do seu caso: ciclo iniciado em {cycleStartLabel}, com beneficios mantidos ate {cycleEndLabel}.
              </p>
            ) : (
              <p style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.6, marginBottom: 18 }}>
                Exemplo: se voce assinou em 24/01 e cancelou em 02/02, o plano segue ativo ate a data final do ciclo mensal.
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCancelModalOpen(false)}
                disabled={cancelingPlan || refundingPlan}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'transparent',
                  color: '#d4d4d8',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmCancelPlan}
                disabled={cancelingPlan || refundingPlan}
                style={{
                  minWidth: 184,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'rgba(239,68,68,0.9)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: cancelingPlan ? 'not-allowed' : 'pointer',
                  opacity: cancelingPlan ? 0.7 : 1,
                }}
              >
                {cancelingPlan ? 'Agendando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {refundModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          zIndex: 130,
        }}>
          <div style={{
            width: '100%',
            maxWidth: 560,
            borderRadius: 16,
            background: '#111',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: 22,
          }}>
            <h3 style={{ fontSize: 20, color: '#f4f4f5', marginBottom: 12 }}>
              Confirmar reembolso integral
            </h3>
            <p style={{ fontSize: 14, color: '#f4f4f5', lineHeight: 1.6, marginBottom: 10 }}>
              Esta acao solicita o estorno integral da cobranca atual e cancela a assinatura imediatamente.
            </p>
            <p style={{ fontSize: 14, color: '#fcd34d', lineHeight: 1.6, marginBottom: 10 }}>
              Janela automatica disponivel ate <strong>{refundDeadlineLabel}</strong>.
            </p>
            <p style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.6, marginBottom: 18 }}>
              A solicitacao passa por validacao automatica da cobranca elegivel no Stripe. Se aprovada, o acesso Pro e os beneficios do ciclo atual sao encerrados imediatamente.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRefundModalOpen(false)}
                disabled={refundingPlan}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'transparent',
                  color: '#d4d4d8',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmRefund}
                disabled={refundingPlan}
                style={{
                  minWidth: 220,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#f59e0b',
                  color: '#111',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: refundingPlan ? 'not-allowed' : 'pointer',
                  opacity: refundingPlan ? 0.7 : 1,
                }}
              >
                {refundingPlan ? 'Processando...' : 'Confirmar reembolso integral'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
