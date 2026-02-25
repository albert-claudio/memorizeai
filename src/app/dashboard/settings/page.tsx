'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { RetentionSlider } from '@/components/RetentionSlider';
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
}

function formatDateBR(value: number | null): string {
  if (!value) return 'data indisponivel';
  return new Date(value).toLocaleDateString('pt-BR');
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
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);
  const [cancelFeedbackType, setCancelFeedbackType] = useState<'success' | 'error' | null>(null);

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

  const handleRetentionChange = useCallback(async (value: number) => {
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
  }, [supabase, user]);

  const handleCalibrationToggle = useCallback(async () => {
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
  }, [settings.calibrationEnabled, supabase, user]);

  const handleConfirmCancelPlan = useCallback(async () => {
    setCancelingPlan(true);
    setCancelFeedback(null);
    setCancelFeedbackType(null);

    try {
      const response = await fetch('/api/stripe/cancel-subscription', { method: 'POST' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCancelFeedback(data.error || 'Nao foi possivel agendar o cancelamento.');
        setCancelFeedbackType('error');
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
      setCancelFeedback(
        effectiveDate
          ? `Cancelamento agendado. Seus beneficios continuam ate ${effectiveDate}.`
          : 'Cancelamento agendado para o fim do ciclo atual.'
      );
      setCancelFeedbackType('success');
      setCancelModalOpen(false);
    } catch {
      setCancelFeedback('Erro de conexao ao tentar cancelar o plano.');
      setCancelFeedbackType('error');
    } finally {
      setCancelingPlan(false);
    }
  }, []);

  const hasPaidSubscription = Boolean(
    subscription &&
    subscription.status !== 'free' &&
    subscription.tier !== 'free'
  );
  const cycleStartLabel = formatDateBR(subscription?.periodStart ?? null);
  const cycleEndLabel = formatDateBR(subscription?.periodEnd ?? null);

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

      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(15, 15, 15, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/dashboard" style={{ color: '#a1a1aa', display: 'flex' }}>
            <Icons.ArrowLeft />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 24px rgba(99, 102, 241, 0.4)',
            }}>
              <Icons.Brain />
            </div>
            <span style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#f4f4f5',
            }}>
              Configuracoes
            </span>
          </div>
        </div>

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
      </header>

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

        <section style={{ marginBottom: 32 }}>
          <RetentionSlider
            value={settings.desiredRetention}
            onChange={handleRetentionChange}
            disabled={saving}
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
        }}>
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
              style={{
                width: 52,
                height: 30,
                borderRadius: 15,
                border: 'none',
                background: settings.calibrationEnabled
                  ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)'
                  : 'rgba(255,255,255,0.1)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.3s ease',
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
          <p style={{
            fontSize: 13,
            color: '#a1a1aa',
            marginBottom: 16,
            lineHeight: 1.6,
          }}>
            Ao cancelar, os beneficios Pro nao somem na hora. Eles ficam ativos ate o fim do ciclo atual.
          </p>

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
              </div>

              {cancelFeedback && (
                <div style={{
                  borderRadius: 10,
                  background: cancelFeedbackType === 'error'
                    ? 'rgba(239,68,68,0.12)'
                    : 'rgba(34,197,94,0.12)',
                  border: cancelFeedbackType === 'error'
                    ? '1px solid rgba(239,68,68,0.3)'
                    : '1px solid rgba(34,197,94,0.3)',
                  color: cancelFeedbackType === 'error' ? '#fecaca' : '#86efac',
                  fontSize: 13,
                  padding: '10px 12px',
                  marginBottom: 14,
                }}>
                  {cancelFeedback}
                </div>
              )}

              <button
                onClick={() => setCancelModalOpen(true)}
                disabled={subscription?.cancelAtPeriodEnd || cancelingPlan}
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
                  cursor: subscription?.cancelAtPeriodEnd ? 'not-allowed' : 'pointer',
                }}
              >
                {subscription?.cancelAtPeriodEnd ? 'Cancelamento ja agendado' : 'Cancelar plano'}
              </button>
            </>
          )}
        </section>

        <div style={{ textAlign: 'center' }}>
          <Link
            href="/dashboard"
            style={{
              color: '#a1a1aa',
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            {'<- Voltar ao Dashboard'}
          </Link>
        </div>
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
                disabled={cancelingPlan}
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
                disabled={cancelingPlan}
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
    </div>
  );
}
