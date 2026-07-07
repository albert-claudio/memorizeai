'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { RetentionSlider } from '@/components/RetentionSlider';
import { BillingBanner } from '@/components/BillingBanner';
import { DEFAULT_RETENTION } from '@/lib/fsrs/weights';
import {
  Toggle, Select, NumberInput, ChipSelect,
  SettingRow, SectionCard, useAutoSave,
} from './components';

/* ─── Types ─── */
interface UserPreferences {
  study_goal: string;
  daily_reviews: number;
  daily_new_cards: number;
  daily_study_minutes: number;
  study_period: string;
  reminder_time: string;
  study_days: string;
  review_overdue_first: boolean;
  mix_new_and_review: boolean;
  prioritize_weak: boolean;
  prioritize_near_exam: boolean;
  simple_mode: boolean;
  review_intensity: string;
  fsrs_enabled: boolean;
  interval_limit_days: number;
  daily_load_tolerance: number;
  auto_reschedule_missed: boolean;
  bury_siblings: boolean;
  notify_review: boolean;
  notify_daily_goal: boolean;
  notify_streak: boolean;
  notify_content_ready: boolean;
  notify_plan_renewal: boolean;
  email_marketing: boolean;
  push_enabled: boolean;
  theme: string;
  font_size: string;
  animations_enabled: boolean;
  show_streak: boolean;
  show_study_time: boolean;
  sound_vibration: boolean;
  app_language: string;
  date_format: string;
  focus_mode: boolean;
  hide_distractions: boolean;
  pomodoro_enabled: boolean;
  auto_breaks: boolean;
  sound_on_complete: boolean;
  open_on_review: boolean;
}

interface SrsSettings {
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
  isBeta?: boolean;
  isTrial?: boolean;
  refundEligibleUntil: number | null;
  refundEligible: boolean;
}

const DEFAULTS: UserPreferences = {
  study_goal: 'concurso', daily_reviews: 30, daily_new_cards: 10,
  daily_study_minutes: 60, study_period: 'noite', reminder_time: '20:00',
  study_days: 'all', review_overdue_first: true, mix_new_and_review: true,
  prioritize_weak: true, prioritize_near_exam: false, simple_mode: false,
  review_intensity: 'normal', fsrs_enabled: true, interval_limit_days: 365,
  daily_load_tolerance: 100, auto_reschedule_missed: true, bury_siblings: true,
  notify_review: true, notify_daily_goal: true, notify_streak: true,
  notify_content_ready: true, notify_plan_renewal: true, email_marketing: true,
  push_enabled: true, theme: 'dark', font_size: 'medium',
  animations_enabled: true, show_streak: true, show_study_time: true,
  sound_vibration: true, app_language: 'pt-BR', date_format: 'DD/MM/YYYY',
  focus_mode: false, hide_distractions: false, pomodoro_enabled: false,
  auto_breaks: false, sound_on_complete: false, open_on_review: false,
};

const SECTIONS = [
  { id: 'objetivo', icon: '🎯', label: 'Objetivo' },
  { id: 'meta', icon: '📊', label: 'Meta Diária' },
  { id: 'horario', icon: '⏰', label: 'Horário' },
  { id: 'revisao', icon: '🔄', label: 'Modo de Revisão' },
  { id: 'avancado', icon: '⚙️', label: 'Modo Avançado' },
  { id: 'notificacoes', icon: '🔔', label: 'Notificações' },
  { id: 'interface', icon: '🎨', label: 'Interface' },
  { id: 'produtividade', icon: '🚀', label: 'Produtividade' },
  { id: 'assinatura', icon: '💳', label: 'Assinatura' },
] as const;

const DAY_OPTIONS = [
  { value: 'seg', label: 'Seg' }, { value: 'ter', label: 'Ter' },
  { value: 'qua', label: 'Qua' }, { value: 'qui', label: 'Qui' },
  { value: 'sex', label: 'Sex' }, { value: 'sab', label: 'Sáb' },
  { value: 'dom', label: 'Dom' },
];

function formatDateBR(value: number | null): string {
  if (!value) return 'data indisponível';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount === null || !currency) return 'valor indisponível';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: currency.toUpperCase(),
  }).format(amount / 100);
}

/* ─── Icons ─── */
const Icons = {
  Loader: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
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
  Zap: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  ArrowLeft: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12,19 5,12 12,5" />
    </svg>
  ),
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('objetivo');
  const [isMobile, setIsMobile] = useState(false);

  // Preferences
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULTS);

  // SRS settings (existing table)
  const [srs, setSrs] = useState<SrsSettings>({
    desiredRetention: DEFAULT_RETENTION, calibrationEnabled: true,
    reviewCountSinceCalibration: 0, lastCalibrationAt: null,
  });

  // Subscription
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelingPlan, setCancelingPlan] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundingPlan, setRefundingPlan] = useState(false);
  const [billingFeedback, setBillingFeedback] = useState<string | null>(null);
  const [billingFeedbackType, setBillingFeedbackType] = useState<'success' | 'error' | null>(null);

  /* ─── Load ─── */
  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) { router.push('/login'); return; }
        setUser(u);

        // Preferences
        const prefsRes = await fetch('/api/user/preferences', { cache: 'no-store' });
        if (prefsRes.ok) { const d = await prefsRes.json(); setPrefs({ ...DEFAULTS, ...d }); }

        // SRS
        const { data: srsData } = await supabase
          .from('user_srs_settings').select('*').eq('user_id', u.id).single();
        if (srsData) {
          setSrs({
            desiredRetention: srsData.desired_retention ?? DEFAULT_RETENTION,
            calibrationEnabled: srsData.calibration_enabled ?? true,
            reviewCountSinceCalibration: srsData.review_count_since_calibration ?? 0,
            lastCalibrationAt: srsData.last_calibration_at,
          });
        }

        // Subscription
        const subRes = await fetch('/api/stripe/subscription-status', { cache: 'no-store' });
        if (subRes.ok) setSubscription(await subRes.json());
      } catch { /* ignore */ } finally {
        setSubscriptionLoading(false);
        setLoading(false);
      }
    };
    load();
  }, [router, supabase]);

  useEffect(() => {
    const updateViewport = () => {
      setIsMobile(window.innerWidth < 900);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const isPro = Boolean(subscription?.isActive && subscription?.isPro);

  /* ─── Auto-save preferences ─── */
  const savePrefs = useCallback(async (updates: Record<string, unknown>) => {
    const res = await fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      let msg = 'Falha ao salvar preferências';
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch { /* ignore parse error */ }
      throw new Error(msg);
    }
  }, []);

  const { saving, saved, status, errorMessage, save } = useAutoSave(savePrefs);

  const updatePref = useCallback(<K extends keyof UserPreferences>(key: K, val: UserPreferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: val }));
    save({ [key]: val });
  }, [save]);

  /* ─── SRS save ─── */
  const [srsSaving, setSrsSaving] = useState(false);
  const [srsSaved, setSrsSaved] = useState(false);

  const handleRetentionChange = useCallback(async (value: number) => {
    if (!isPro) return;
    setSrs((p) => ({ ...p, desiredRetention: value }));
    setSrsSaving(true); setSrsSaved(false);
    const { error } = await supabase.from('user_srs_settings')
      .upsert({ user_id: user?.id, desired_retention: value, updated_at: Date.now() }, { onConflict: 'user_id' });
    setSrsSaving(false);
    if (!error) { setSrsSaved(true); setTimeout(() => setSrsSaved(false), 2000); }
  }, [supabase, user, isPro]);

  const handleCalibrationToggle = useCallback(async () => {
    if (!isPro) return;
    const v = !srs.calibrationEnabled;
    setSrs((p) => ({ ...p, calibrationEnabled: v }));
    await supabase.from('user_srs_settings')
      .upsert({ user_id: user?.id, calibration_enabled: v, updated_at: Date.now() }, { onConflict: 'user_id' });
  }, [srs.calibrationEnabled, supabase, user, isPro]);

  /* ─── Billing handlers ─── */
  const handleConfirmCancelPlan = useCallback(async () => {
    setCancelingPlan(true); setBillingFeedback(null); setBillingFeedbackType(null);
    try {
      const r = await fetch('/api/stripe/cancel-subscription', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setBillingFeedback(d.error || 'Não foi possível agendar o cancelamento.'); setBillingFeedbackType('error'); return; }
      setSubscription((p) => p ? { ...p, periodStart: d.periodStart ?? p.periodStart, periodEnd: d.periodEnd ?? p.periodEnd, cancelAtPeriodEnd: true } : p);
      const dt = d.periodEnd ? new Date(d.periodEnd).toLocaleDateString('pt-BR') : null;
      setBillingFeedback(dt ? `Cancelamento agendado. Benefícios até ${dt}.` : 'Cancelamento agendado.');
      setBillingFeedbackType('success'); setCancelModalOpen(false);
    } catch { setBillingFeedback('Erro de conexão.'); setBillingFeedbackType('error'); }
    finally { setCancelingPlan(false); }
  }, []);

  const handleConfirmRefund = useCallback(async () => {
    setRefundingPlan(true); setBillingFeedback(null); setBillingFeedbackType(null);
    try {
      const r = await fetch('/api/stripe/refund-subscription', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setBillingFeedback(d.error || 'Não foi possível processar o reembolso.'); setBillingFeedbackType('error'); return; }
      setSubscription((p) => p ? { ...p, isPro: false, status: 'canceled', tier: 'free', periodEnd: d.subscriptionCanceledAt ?? p.periodEnd, cancelAtPeriodEnd: false, isActive: false } : p);
      const amt = formatCurrency(typeof d.amountRefunded === 'number' ? d.amountRefunded : null, typeof d.currency === 'string' ? d.currency : null);
      setBillingFeedback(`Reembolso solicitado. ${amt} será estornado.`);
      setBillingFeedbackType('success'); setRefundModalOpen(false); setCancelModalOpen(false);
    } catch { setBillingFeedback('Erro de conexão.'); setBillingFeedbackType('error'); }
    finally { setRefundingPlan(false); }
  }, []);

  const hasPaidSub = Boolean(subscription && !subscription.isBeta && !subscription.isTrial && subscription.status !== 'free' && subscription.tier !== 'free');
  const cycleEndLabel = formatDateBR(subscription?.periodEnd ?? null);
  const cycleStartLabel = formatDateBR(subscription?.periodStart ?? null);
  const canRefund = Boolean(hasPaidSub && subscription?.refundEligible);
  const refundDeadlineLabel = formatDateBR(subscription?.refundEligibleUntil ?? null);

  // Study days helper
  const studyDaysArray = prefs.study_days === 'all'
    ? DAY_OPTIONS.map((d) => d.value)
    : prefs.study_days.split(',').filter(Boolean);

  const handleDaysChange = useCallback((days: string[]) => {
    const val = days.length === 7 ? 'all' : days.join(',');
    updatePref('study_days', val);
  }, [updatePref]);

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <Icons.Loader />
        <style jsx global>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ═══════════════════════════════  RENDER  ═══════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <style jsx global>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* ─── Top bar ─── */}
      <header style={{
        padding: '14px clamp(12px, 4vw, 24px)', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
        background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Link href="/dashboard" style={{ color: '#a1a1aa', display: 'flex' }}><Icons.ArrowLeft /></Link>
          <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: '#f4f4f5', margin: 0 }}>Configurações</h1>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '6px 14px', borderRadius: 10,
          background: status === 'error' ? 'rgba(239,68,68,0.15)' : (saved || srsSaved) ? 'rgba(34,197,94,0.15)' : 'transparent',
          color: status === 'error' ? '#EF4444' : (saved || srsSaved) ? '#22C55E' : '#a1a1aa', fontSize: 13, fontWeight: 500,
          transition: 'all 0.3s ease', width: isMobile ? '100%' : 'auto', minHeight: isMobile ? 36 : 0,
        }}>
          {status === 'error' ? <>❌ {errorMessage || 'Erro ao salvar'}</> :
           (saving || srsSaving) ? <><Icons.Loader /> {isMobile ? 'Salvando' : 'Salvando...'}</> :
           (saved || srsSaved) ? <><Icons.Check /> {isMobile ? 'Salvo' : 'Salvo!'}</> : null}
        </div>
      </header>

      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        maxWidth: 960,
        margin: '0 auto',
        minHeight: 'calc(100vh - 64px)',
      }}>
        {/* ─── Sidebar ─── */}
        <nav style={{
          width: isMobile ? '100%' : 220,
          padding: isMobile ? '12px clamp(12px, 4vw, 16px)' : '24px 12px',
          borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
          borderBottom: isMobile ? '1px solid rgba(255,255,255,0.06)' : 'none',
          position: isMobile ? 'static' : 'sticky',
          top: 64,
          height: isMobile ? 'auto' : 'calc(100vh - 64px)',
          overflowY: isMobile ? 'visible' : 'auto',
          overflowX: isMobile ? 'auto' : 'visible',
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          gap: 8,
          scrollbarWidth: 'none',
        }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 10, border: 'none',
                background: activeSection === s.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: activeSection === s.id ? '#a5b4fc' : '#a1a1aa',
                fontSize: 14, fontWeight: activeSection === s.id ? 600 : 400,
                cursor: 'pointer', textAlign: 'left',
                width: isMobile ? 'auto' : '100%',
                flex: isMobile ? '0 0 auto' : 'none',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
              }}
            >
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>

        {/* ─── Content ─── */}
        <main style={{ flex: 1, padding: isMobile ? '16px 12px 32px' : '32px 32px 64px', minWidth: 0 }}>

          {/* OBJETIVO */}
          {activeSection === 'objetivo' && (
            <SectionCard title="Objetivo de Estudo" icon="🎯">
              <SettingRow label="Tipo de prova" description="Qual seu foco principal de estudo?">
                <Select value={prefs.study_goal} onChange={(v) => updatePref('study_goal', v)} options={[
                  { value: 'concurso', label: 'Concurso' },
                  { value: 'oab', label: 'OAB' },
                  { value: 'enem', label: 'ENEM' },
                  { value: 'faculdade', label: 'Faculdade' },
                ]} />
              </SettingRow>
            </SectionCard>
          )}

          {/* META DIÁRIA */}
          {activeSection === 'meta' && (
            <SectionCard title="Meta Diária" icon="📊">
              <SettingRow label="Revisões por dia" description="Quantidade de cartões para revisar diariamente">
                <NumberInput value={prefs.daily_reviews} onChange={(v) => updatePref('daily_reviews', v)} min={1} max={500} step={5} />
              </SettingRow>
              <SettingRow label="Novas cartas por dia" description="Limite de cartas novas apresentadas por dia">
                <NumberInput value={prefs.daily_new_cards} onChange={(v) => updatePref('daily_new_cards', v)} min={0} max={200} step={5} />
              </SettingRow>
              <SettingRow label="Tempo de estudo" description="Meta de minutos de estudo por dia">
                <NumberInput value={prefs.daily_study_minutes} onChange={(v) => updatePref('daily_study_minutes', v)} min={5} max={720} step={15} unit="min" />
              </SettingRow>
            </SectionCard>
          )}

          {/* HORÁRIO */}
          {activeSection === 'horario' && (
            <SectionCard title="Horário de Estudo" icon="⏰">
              <SettingRow label="Período preferido">
                <Select value={prefs.study_period} onChange={(v) => updatePref('study_period', v)} options={[
                  { value: 'manha', label: 'Manhã' },
                  { value: 'tarde', label: 'Tarde' },
                  { value: 'noite', label: 'Noite' },
                ]} />
              </SettingRow>
              <SettingRow label="Horário do lembrete" description="Quando deseja receber o lembrete para estudar">
                <input
                  type="time" value={prefs.reminder_time}
                  onChange={(e) => updatePref('reminder_time', e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.06)', color: '#e4e4e7',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                    padding: '10px 14px', fontSize: 14,
                  }}
                />
              </SettingRow>
              <SettingRow label="Dias de estudo" description="Escolha quais dias da semana deseja estudar">
                <ChipSelect value={studyDaysArray} onChange={handleDaysChange} options={DAY_OPTIONS} />
              </SettingRow>
            </SectionCard>
          )}

          {/* MODO DE REVISÃO */}
          {activeSection === 'revisao' && (
            <SectionCard title="Modo de Revisão" icon="🔄">
              <SettingRow label="Revisar vencidas primeiro" description="Priorizar cartões com revisão atrasada">
                <Toggle value={prefs.review_overdue_first} onChange={(v) => updatePref('review_overdue_first', v)} />
              </SettingRow>
              <SettingRow label="Misturar novas e revisão" description="Intercalar cartas novas com revisões">
                <Toggle value={prefs.mix_new_and_review} onChange={(v) => updatePref('mix_new_and_review', v)} />
              </SettingRow>
              <SettingRow label="Priorizar matérias fracas" description="Focar em assuntos com menor desempenho">
                <Toggle value={prefs.prioritize_weak} onChange={(v) => updatePref('prioritize_weak', v)} />
              </SettingRow>
              <SettingRow label="Priorizar conteúdo próximo da prova" description="Dar peso maior a cartas relacionadas a provas próximas">
                <Toggle value={prefs.prioritize_near_exam} onChange={(v) => updatePref('prioritize_near_exam', v)} />
              </SettingRow>
              <SettingRow label="Modo simples" description="Interface de revisão simplificada">
                <Toggle value={prefs.simple_mode} onChange={(v) => updatePref('simple_mode', v)} />
              </SettingRow>
              <SettingRow label="Intensidade de revisão">
                <Select value={prefs.review_intensity} onChange={(v) => updatePref('review_intensity', v)} options={[
                  { value: 'leve', label: 'Leve' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'pesada', label: 'Pesada' },
                ]} />
              </SettingRow>
            </SectionCard>
          )}

          {/* MODO AVANÇADO */}
          {activeSection === 'avancado' && (
            <>
              <SectionCard title="Algoritmo FSRS" icon="🧠">
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  {!isPro && (
                    <div style={{
                      position: 'absolute', inset: 0, zIndex: 10, borderRadius: 12,
                      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                        <Icons.Lock />
                      </div>
                      <p style={{ color: '#e4e4e7', fontSize: 14, fontWeight: 600, margin: 0 }}>Exclusivo Pro</p>
                      <Link href="/upgrade" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        <Icons.Crown /> Fazer upgrade
                      </Link>
                    </div>
                  )}
                  <RetentionSlider value={srs.desiredRetention} onChange={handleRetentionChange} disabled={srsSaving || !isPro} showPreview={true} />
                </div>

                <div style={{ position: 'relative' }}>
                  {!isPro && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 10, borderRadius: 12, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ color: '#a78bfa' }}><Icons.Lock /></div>
                      <p style={{ color: '#d4d4d8', fontSize: 13, fontWeight: 600, margin: '0 0 0 8px' }}>Recurso Pro</p>
                    </div>
                  )}
                  <SettingRow label="Calibração automática" description={`Otimiza pesos a cada ~500 revisões · ${srs.reviewCountSinceCalibration} desde última`}>
                    <Toggle value={srs.calibrationEnabled} onChange={handleCalibrationToggle} disabled={!isPro} />
                  </SettingRow>
                </div>
              </SectionCard>

              <SectionCard title="Configurações Avançadas" icon="⚙️">
                <SettingRow label="FSRS ligado" description="Usar o algoritmo de repetição espaçada">
                  <Toggle value={prefs.fsrs_enabled} onChange={(v) => updatePref('fsrs_enabled', v)} />
                </SettingRow>
                <SettingRow label="Limite de intervalo" description="Intervalo máximo entre revisões (dias)">
                  <NumberInput value={prefs.interval_limit_days} onChange={(v) => updatePref('interval_limit_days', v)} min={1} max={3650} step={30} unit="d" />
                </SettingRow>
                <SettingRow label="Tolerância de carga diária" description="Máximo de cartões que o algoritmo pode agendar por dia">
                  <NumberInput value={prefs.daily_load_tolerance} onChange={(v) => updatePref('daily_load_tolerance', v)} min={10} max={1000} step={10} />
                </SettingRow>
                <SettingRow label="Reagendamento automático" description="Redistribuir ao perder dias de estudo">
                  <Toggle value={prefs.auto_reschedule_missed} onChange={(v) => updatePref('auto_reschedule_missed', v)} />
                </SettingRow>
                <SettingRow label="Enterrar cartões relacionados" description="Não mostrar siblings no mesmo dia">
                  <Toggle value={prefs.bury_siblings} onChange={(v) => updatePref('bury_siblings', v)} />
                </SettingRow>
              </SectionCard>
            </>
          )}

          {/* NOTIFICAÇÕES */}
          {activeSection === 'notificacoes' && (
            <SectionCard title="Notificações" icon="🔔">
              <SettingRow label="Lembrete de revisar"><Toggle value={prefs.notify_review} onChange={(v) => updatePref('notify_review', v)} /></SettingRow>
              <SettingRow label="Meta diária não batida"><Toggle value={prefs.notify_daily_goal} onChange={(v) => updatePref('notify_daily_goal', v)} /></SettingRow>
              <SettingRow label="Aviso de sequência (streak)"><Toggle value={prefs.notify_streak} onChange={(v) => updatePref('notify_streak', v)} /></SettingRow>
              <SettingRow label="Conteúdo novo processado" description="Ex: PDF pronto"><Toggle value={prefs.notify_content_ready} onChange={(v) => updatePref('notify_content_ready', v)} /></SettingRow>
              <SettingRow label="Renovação do plano"><Toggle value={prefs.notify_plan_renewal} onChange={(v) => updatePref('notify_plan_renewal', v)} /></SettingRow>
              <SettingRow label="Email marketing"><Toggle value={prefs.email_marketing} onChange={(v) => updatePref('email_marketing', v)} /></SettingRow>
              <SettingRow label="Push notifications"><Toggle value={prefs.push_enabled} onChange={(v) => updatePref('push_enabled', v)} /></SettingRow>
            </SectionCard>
          )}

          {/* INTERFACE */}
          {activeSection === 'interface' && (
            <SectionCard title="Interface" icon="🎨">
              <SettingRow label="Tema">
                <Select value={prefs.theme} onChange={(v) => updatePref('theme', v)} options={[
                  { value: 'dark', label: 'Escuro' }, { value: 'light', label: 'Claro' }, { value: 'system', label: 'Sistema' },
                ]} />
              </SettingRow>
              <SettingRow label="Tamanho da fonte">
                <Select value={prefs.font_size} onChange={(v) => updatePref('font_size', v)} options={[
                  { value: 'small', label: 'Pequena' }, { value: 'medium', label: 'Média' }, { value: 'large', label: 'Grande' },
                ]} />
              </SettingRow>
              <SettingRow label="Animações"><Toggle value={prefs.animations_enabled} onChange={(v) => updatePref('animations_enabled', v)} /></SettingRow>
              <SettingRow label="Mostrar contador de streak"><Toggle value={prefs.show_streak} onChange={(v) => updatePref('show_streak', v)} /></SettingRow>
              <SettingRow label="Mostrar tempo de estudo no dashboard"><Toggle value={prefs.show_study_time} onChange={(v) => updatePref('show_study_time', v)} /></SettingRow>
              <SettingRow label="Som e vibração na revisão"><Toggle value={prefs.sound_vibration} onChange={(v) => updatePref('sound_vibration', v)} /></SettingRow>
              <SettingRow label="Idioma">
                <Select value={prefs.app_language} onChange={(v) => updatePref('app_language', v)} options={[
                  { value: 'pt-BR', label: 'Português' }, { value: 'en', label: 'English' },
                ]} />
              </SettingRow>
              <SettingRow label="Formato de data">
                <Select value={prefs.date_format} onChange={(v) => updatePref('date_format', v)} options={[
                  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' }, { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' }, { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                ]} />
              </SettingRow>
            </SectionCard>
          )}

          {/* PRODUTIVIDADE */}
          {activeSection === 'produtividade' && (
            <SectionCard title="Produtividade" icon="🚀">
              <SettingRow label="Modo foco" description="Minimizar distrações durante o estudo"><Toggle value={prefs.focus_mode} onChange={(v) => updatePref('focus_mode', v)} /></SettingRow>
              <SettingRow label="Esconder distrações"><Toggle value={prefs.hide_distractions} onChange={(v) => updatePref('hide_distractions', v)} /></SettingRow>
              <SettingRow label="Timer Pomodoro"><Toggle value={prefs.pomodoro_enabled} onChange={(v) => updatePref('pomodoro_enabled', v)} /></SettingRow>
              <SettingRow label="Pausas automáticas"><Toggle value={prefs.auto_breaks} onChange={(v) => updatePref('auto_breaks', v)} /></SettingRow>
              <SettingRow label="Tocar som ao concluir sessão"><Toggle value={prefs.sound_on_complete} onChange={(v) => updatePref('sound_on_complete', v)} /></SettingRow>
              <SettingRow label="Abrir na tela de revisão" description="Ao entrar no app, ir direto para revisão"><Toggle value={prefs.open_on_review} onChange={(v) => updatePref('open_on_review', v)} /></SettingRow>
            </SectionCard>
          )}

          {/* ASSINATURA */}
          {activeSection === 'assinatura' && (
            <SectionCard title="Assinatura e Cancelamento" icon="💳">
              {subscription && <div style={{ marginBottom: 16 }}><BillingBanner subscription={subscription} /></div>}

              <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 16, lineHeight: 1.6 }}>
                Ao cancelar, os benefícios Pro ficam ativos até o fim do ciclo atual.
              </p>

              {billingFeedback && (
                <div style={{
                  borderRadius: 10, fontSize: 13, padding: '10px 12px', marginBottom: 14,
                  background: billingFeedbackType === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
                  border: billingFeedbackType === 'error' ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(34,197,94,0.3)',
                  color: billingFeedbackType === 'error' ? '#fecaca' : '#86efac',
                }}>{billingFeedback}</div>
              )}

              {subscriptionLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1aa', fontSize: 13 }}>
                  <Icons.Loader /> Carregando dados da assinatura...
                </div>
              ) : subscription?.isTrial ? (
                <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0 }}>
                  Teste gratis ativo. Recursos Pro liberados ate {cycleEndLabel}.
                </p>
              ) : subscription?.isBeta ? (
                <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0 }}>Acesso legado ativo. Recursos Pro liberados temporariamente.</p>
              ) : !hasPaidSub ? (
                <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0 }}>Nenhum plano ativo encontrado.</p>
              ) : (
                <>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                    <p style={{ fontSize: 13, color: '#d4d4d8', marginBottom: 6 }}>Plano: <strong>{subscription?.tier || 'pro'}</strong></p>
                    <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 0 }}>
                      {subscription?.cancelAtPeriodEnd ? `Cancelamento agendado para ${cycleEndLabel}.` : `Ciclo termina em ${cycleEndLabel}.`}
                    </p>
                    <p style={{ fontSize: 13, color: canRefund ? '#fcd34d' : '#71717a', marginTop: 8, marginBottom: 0 }}>
                      {canRefund ? `Reembolso disponível até ${refundDeadlineLabel}.` : 'Elegibilidade de reembolso validada pelo Stripe.'}
                    </p>
                  </div>

                  {canRefund && (
                    <button onClick={() => setRefundModalOpen(true)} disabled={refundingPlan}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '13px 18px', borderRadius: 12, border: '1px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.15)', color: '#fcd34d', fontWeight: 600, fontSize: 14, cursor: refundingPlan ? 'not-allowed' : 'pointer', marginBottom: 12, opacity: refundingPlan ? 0.7 : 1 }}>
                      {refundingPlan ? 'Processando...' : 'Solicitar reembolso integral'}
                    </button>
                  )}

                  <button onClick={() => setCancelModalOpen(true)} disabled={subscription?.cancelAtPeriodEnd || cancelingPlan || refundingPlan}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '13px 18px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.5)', background: subscription?.cancelAtPeriodEnd ? 'rgba(255,255,255,0.05)' : 'rgba(239,68,68,0.16)', color: subscription?.cancelAtPeriodEnd ? '#a1a1aa' : '#fca5a5', fontWeight: 600, fontSize: 14, cursor: subscription?.cancelAtPeriodEnd || refundingPlan ? 'not-allowed' : 'pointer' }}>
                    {subscription?.cancelAtPeriodEnd ? 'Cancelamento já agendado' : 'Cancelar plano'}
                  </button>
                </>
              )}
            </SectionCard>
          )}

        </main>
      </div>

      {/* ─── Cancel Modal ─── */}
      {cancelModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 120 }}>
          <div style={{ width: '100%', maxWidth: 520, borderRadius: 16, background: '#111', border: '1px solid rgba(255,255,255,0.1)', padding: 22 }}>
            <h3 style={{ fontSize: 20, color: '#f4f4f5', marginBottom: 12 }}>Confirmar cancelamento</h3>
            <p style={{ fontSize: 14, color: '#d4d4d8', lineHeight: 1.6, marginBottom: 10 }}>Benefícios continuam ativos até o fim do ciclo atual.</p>
            <p style={{ fontSize: 14, color: '#fca5a5', lineHeight: 1.6, marginBottom: 10 }}>Cancelamento efetivo: <strong>{cycleEndLabel}</strong></p>
            {subscription?.periodStart && <p style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.6, marginBottom: 18 }}>Ciclo: {cycleStartLabel} → {cycleEndLabel}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => setCancelModalOpen(false)} disabled={cancelingPlan || refundingPlan}
                style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#d4d4d8', fontSize: 14, cursor: 'pointer' }}>Voltar</button>
              <button onClick={handleConfirmCancelPlan} disabled={cancelingPlan || refundingPlan}
                style={{ minWidth: isMobile ? '100%' : 184, width: isMobile ? '100%' : 'auto', padding: '10px 14px', borderRadius: 10, border: 'none', background: 'rgba(239,68,68,0.9)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: cancelingPlan ? 'not-allowed' : 'pointer', opacity: cancelingPlan ? 0.7 : 1 }}>
                {cancelingPlan ? 'Agendando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Refund Modal ─── */}
      {refundModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 130 }}>
          <div style={{ width: '100%', maxWidth: 560, borderRadius: 16, background: '#111', border: '1px solid rgba(255,255,255,0.1)', padding: 22 }}>
            <h3 style={{ fontSize: 20, color: '#f4f4f5', marginBottom: 12 }}>Confirmar reembolso integral</h3>
            <p style={{ fontSize: 14, color: '#f4f4f5', lineHeight: 1.6, marginBottom: 10 }}>Estorno integral e cancelamento imediato.</p>
            <p style={{ fontSize: 14, color: '#fcd34d', lineHeight: 1.6, marginBottom: 10 }}>Disponível até <strong>{refundDeadlineLabel}</strong>.</p>
            <p style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.6, marginBottom: 18 }}>Validação automática via Stripe.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
              <button onClick={() => setRefundModalOpen(false)} disabled={refundingPlan}
                style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#d4d4d8', fontSize: 14, cursor: 'pointer' }}>Voltar</button>
              <button onClick={handleConfirmRefund} disabled={refundingPlan}
                style={{ minWidth: isMobile ? '100%' : 220, width: isMobile ? '100%' : 'auto', padding: '10px 14px', borderRadius: 10, border: 'none', background: '#f59e0b', color: '#111', fontSize: 14, fontWeight: 700, cursor: refundingPlan ? 'not-allowed' : 'pointer', opacity: refundingPlan ? 0.7 : 1 }}>
                {refundingPlan ? 'Processando...' : 'Confirmar reembolso integral'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
