'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { processReview, type Grade } from '@/lib/fsrs';

type Tab = 'overview' | 'users' | 'finance' | 'content' | 'system' | 'beta';

type Overview = {
  metrics: Record<string, number>;
  finance: {
    activeSubscriptions: number;
    canceledSubscriptions: number;
    statusCounts: Record<string, number>;
    mrr: number | null;
    churn: number;
  };
  usage: {
    tokensByModel: Array<{ model: string; totalTokens: number; totalRuns: number; errors: number }>;
    totalTokens30d?: number;
    estimatedCostUsd30d?: number;
    recentErrors: Array<Record<string, unknown>>;
  };
  pipeline?: {
    queue: Array<Record<string, unknown>>;
    queueStatus: Array<{ label: string; value: number }>;
  };
  learning?: {
    retentionRate30d: number;
    reviewSample30d: number;
    successfulReviews30d: number;
    studyHeatmap: Array<{ label: string; value: number }>;
  };
  activity?: Array<Record<string, unknown>>;
  generatedAt?: string;
};

type UserRow = {
  id: string;
  email: string;
  isPro: boolean;
  adminOverridePro: boolean;
  subscriptionStatus: string;
  subscriptionTier: string;
  subscriptionPeriodEnd: number | null;
  stripeCustomerUrl: string | null;
  createdAt: number;
  updatedAt: number;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  deletedAt: number | null;
  counts: { decks: number; runs: number; reviews: number };
};

type UsersResponse = {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
};

type UserDetail = {
  user: {
    id: string;
    email: string;
    createdAt: number;
    lastSignInAt: string | null;
    bannedUntil: string | null;
  };
  billing: {
    isPro: boolean;
    status: string;
    tier: string;
    stripeCustomerUrl: string | null;
    subscriptions: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
  };
  usage: {
    counts: { decks: number; cards: number; reviews: number; runs: number };
    decks: Array<Record<string, unknown>>;
    runs: Array<Record<string, unknown>>;
    sources: Array<Record<string, unknown>>;
  };
};

type BetaInviteRow = {
  id: string;
  name: string;
  email: string;
  userId: string | null;
  status: string;
  sendCount: number;
  emailDeliveryStatus: string | null;
  expiresAt: number;
  trialEndsAt: number | null;
};

type ContentResponse = {
  decks: Array<Record<string, unknown>>;
  total: number;
  recentGenerations: Array<Record<string, unknown>>;
};

type SystemResponse = {
  summary: Record<string, unknown>;
  queue: Array<Record<string, unknown>>;
  emailDeliveries: Array<Record<string, unknown>>;
  webhookLogs: Array<Record<string, unknown>>;
};

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'overview', label: 'Operacao', icon: 'grid' },
  { id: 'system', label: 'Pipeline IA', icon: 'pulse' },
  { id: 'content', label: 'Conteudo', icon: 'layers' },
  { id: 'users', label: 'Usuarios', icon: 'users' },
  { id: 'finance', label: 'Financeiro', icon: 'card' },
  { id: 'beta', label: 'Beta', icon: 'spark' },
];

export default function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [usersData, setUsersData] = useState<UsersResponse>({ users: [], total: 0, page: 1, limit: 20 });
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [content, setContent] = useState<ContentResponse | null>(null);
  const [system, setSystem] = useState<SystemResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [impersonationLink, setImpersonationLink] = useState('');

  const [userSearch, setUserSearch] = useState('');
  const [userPlan, setUserPlan] = useState('all');
  const [userFrom, setUserFrom] = useState('');
  const [userTo, setUserTo] = useState('');
  const [page, setPage] = useState(1);

  const [betaInvites, setBetaInvites] = useState<BetaInviteRow[]>([]);
  const [betaActiveCount, setBetaActiveCount] = useState(0);
  const [betaLimit, setBetaLimit] = useState(30);
  const [betaName, setBetaName] = useState('');
  const [betaEmail, setBetaEmail] = useState('');
  const [betaMessage, setBetaMessage] = useState('');
  const [betaError, setBetaError] = useState('');
  const [betaManualCode, setBetaManualCode] = useState('');

  const totalPages = Math.max(1, Math.ceil(usersData.total / usersData.limit));

  const fetchOverview = useCallback(async () => {
    const res = await fetch('/api/admin/overview');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar overview.');
    setOverview(data);
  }, []);

  const fetchUsers = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(usersData.limit),
      plan: userPlan,
    });
    if (userSearch) params.set('search', userSearch);
    if (userFrom) params.set('from', userFrom);
    if (userTo) params.set('to', userTo);

    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar usuarios.');
    setUsersData(data);
  }, [page, userFrom, userPlan, userSearch, userTo, usersData.limit]);

  const fetchContent = useCallback(async () => {
    const res = await fetch('/api/admin/content');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar conteudo.');
    setContent(data);
  }, []);

  const fetchSystem = useCallback(async () => {
    const res = await fetch('/api/admin/system');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar sistema.');
    setSystem(data);
  }, []);

  const fetchBeta = useCallback(async () => {
    const res = await fetch('/api/admin/beta-invites');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar beta.');
    setBetaInvites(data.invites ?? []);
    setBetaActiveCount(data.activeCount ?? 0);
    setBetaLimit(data.limit ?? 30);
  }, []);

  const refreshCurrentTab = useCallback(async () => {
    setActionMessage('');
    setLoading(true);
    try {
      if (tab === 'overview' || tab === 'finance') await fetchOverview();
      if (tab === 'users') await fetchUsers();
      if (tab === 'content') await fetchContent();
      if (tab === 'system') await fetchSystem();
      if (tab === 'beta') await fetchBeta();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Erro ao carregar admin.');
    } finally {
      setLoading(false);
    }
  }, [fetchBeta, fetchContent, fetchOverview, fetchSystem, fetchUsers, tab]);

  useEffect(() => {
    refreshCurrentTab();
  }, [refreshCurrentTab]);

  const openUserDetail = async (userId: string) => {
    setLoading(true);
    setActionMessage('');
    setImpersonationLink('');
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar usuario.');
      setUserDetail(data);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Erro ao carregar usuario.');
    } finally {
      setLoading(false);
    }
  };

  const runUserAction = async (userId: string, action: 'ban' | 'unban' | 'soft_delete' | 'impersonate') => {
    const labels = {
      ban: 'banir este usuario',
      unban: 'desbanir este usuario',
      soft_delete: 'deletar esta conta',
      impersonate: 'gerar link de impersonacao',
    };
    if (!window.confirm(`Confirmar: ${labels[action]}?`)) return;

    setLoading(true);
    setActionMessage('');
    setImpersonationLink('');
    try {
      const res = await fetch(`/api/admin/users/${userId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Acao falhou.');
      if (data.url) setImpersonationLink(data.url);
      setActionMessage(data.warning || 'Acao concluida.');
      await fetchUsers();
      if (userDetail?.user.id === userId) await openUserDetail(userId);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Acao falhou.');
    } finally {
      setLoading(false);
    }
  };

  const createBetaInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setBetaError('');
    setBetaMessage('');
    setBetaManualCode('');
    const res = await fetch('/api/admin/beta-invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: betaName, email: betaEmail }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBetaError(data.error || 'Erro ao criar convite beta.');
      return;
    }
    setBetaName('');
    setBetaEmail('');
    setBetaMessage(data.message || 'Convite criado.');
    if (data.manualCode) setBetaManualCode(data.manualCode);
    await fetchBeta();
  };

  const revokeBetaInvite = async (inviteId: string) => {
    if (!window.confirm('Revogar este acesso beta?')) return;

    setBetaError('');
    setBetaMessage('');
    setBetaManualCode('');

    const res = await fetch('/api/admin/beta-invites', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId, action: 'revoke' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBetaError(data.error || 'Erro ao revogar beta.');
      return;
    }

    setBetaMessage('Acesso beta revogado.');
    await fetchBeta();
  };

  const visibleMetrics = useMemo(() => overview?.metrics ?? {}, [overview]);

  return (
    <div style={pageStyle}>
      <aside style={sidebarStyle}>
        <div style={brandStyle}>
          <div style={brandMarkStyle}>V</div>
          <div>
            <div style={brandNameStyle}>Vimens</div>
            <div style={brandSubStyle}>Admin Ops</div>
          </div>
        </div>

        <nav style={sideNavStyle}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={item.id === tab ? activeSideTabStyle : sideTabStyle}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={sidebarCardStyle}>
          <span style={sidebarCardLabelStyle}>Sessao segura</span>
          <strong style={sidebarEmailStyle}>{adminEmail}</strong>
          <span style={sidebarCardHintStyle}>MFA AAL2 ativo</span>
        </div>
      </aside>

      <main style={mainStyle}>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Painel administrativo</p>
            <h1 style={titleStyle}>{tab === 'overview' ? 'Operacao Vimens' : tabs.find((item) => item.id === tab)?.label}</h1>
          </div>
          <div style={headerActionsStyle}>
            <HealthStrip metrics={visibleMetrics} />
            <button type="button" onClick={refreshCurrentTab} style={buttonStyle} disabled={loading}>
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </header>

        {actionMessage && <Notice>{actionMessage}</Notice>}
        {impersonationLink && (
          <Notice>
            Link de impersonacao gerado. Abra preferencialmente em janela anonima:{' '}
            <a href={impersonationLink} target="_blank" rel="noreferrer" style={linkStyle}>abrir link</a>
          </Notice>
        )}

        {(tab === 'overview' || tab === 'finance') && (
          <OverviewView overview={overview} metrics={visibleMetrics} financeOnly={tab === 'finance'} />
        )}

        {tab === 'users' && (
          <section>
            <FilterBar
              search={userSearch}
              setSearch={(value) => { setPage(1); setUserSearch(value); }}
              plan={userPlan}
              setPlan={(value) => { setPage(1); setUserPlan(value); }}
              from={userFrom}
              setFrom={(value) => { setPage(1); setUserFrom(value); }}
              to={userTo}
              setTo={(value) => { setPage(1); setUserTo(value); }}
            />
            <UsersTable
              users={usersData.users}
              onDetails={openUserDetail}
              onAction={runUserAction}
            />
            <Pager page={page} totalPages={totalPages} setPage={setPage} />
            {userDetail && (
              <UserDetailPanel
                detail={userDetail}
                onClose={() => setUserDetail(null)}
                onAction={runUserAction}
              />
            )}
          </section>
        )}

        {tab === 'content' && <ContentView content={content} />}
        {tab === 'system' && <SystemView system={system} />}
        {tab === 'beta' && (
          <BetaView
            invites={betaInvites}
            activeCount={betaActiveCount}
            limit={betaLimit}
            name={betaName}
            setName={setBetaName}
            email={betaEmail}
            setEmail={setBetaEmail}
            message={betaMessage}
            error={betaError}
            manualCode={betaManualCode}
            onCreate={createBetaInvite}
            onRevoke={revokeBetaInvite}
            onRefresh={fetchBeta}
          />
        )}
      </main>
    </div>
  );
}

function OverviewView({
  overview,
  metrics,
  financeOnly,
}: {
  overview: Overview | null;
  metrics: Record<string, number>;
  financeOnly: boolean;
}) {
  if (!overview) return <Empty>Carregando dados...</Empty>;

  if (financeOnly) {
    const financeCards = [
      ['Assinaturas ativas', overview.finance.activeSubscriptions],
      ['Assinaturas canceladas', overview.finance.canceledSubscriptions],
      ['Conversao free/pro', `${pct(metrics.conversionRate ?? 0)}`],
      ['Churn aproximado', `${pct(overview.finance.churn)}`],
    ];

    return (
      <>
        <div style={metricGridStyle}>
          {financeCards.map(([label, value]) => <Metric key={String(label)} label={String(label)} value={value} />)}
        </div>
        <div style={twoColStyle}>
          <Section title="Planos">
            <KeyValue data={overview.finance.statusCounts} />
          </Section>
          <Section title="Uso de IA por modelo">
            <ModelUsageTable rows={overview.usage.tokensByModel} />
          </Section>
        </div>
      </>
    );
  }

  const sourceSuccessRate = metrics.sourceSuccessRate ?? 0;
  const retentionRate = overview.learning?.retentionRate30d ?? metrics.retentionRate30d ?? 0;
  const queueStatus = overview.pipeline?.queueStatus ?? [];
  const totalTokens = overview.usage.totalTokens30d ?? overview.usage.tokensByModel.reduce((sum, row) => sum + row.totalTokens, 0);
  const estimatedCost = overview.usage.estimatedCostUsd30d ?? 0;

  const cards = financeOnly
    ? []
    : [
        {
          label: 'Documentos processados',
          value: num(metrics.totalSources ?? 0),
          detail: `${pct(sourceSuccessRate)} sucesso de leitura`,
          tone: sourceSuccessRate >= 0.9 || (metrics.totalSources ?? 0) === 0 ? 'good' : 'warn',
        },
        {
          label: 'Flashcards gerados',
          value: num(metrics.totalCards ?? 0),
          detail: `${num(metrics.totalDecks ?? 0)} decks ativos`,
          tone: 'neutral',
        },
        {
          label: 'Retencao de conhecimento',
          value: pct(retentionRate),
          detail: `${num(overview.learning?.reviewSample30d ?? metrics.reviews30d ?? 0)} reviews em 30 dias`,
          tone: retentionRate >= 0.82 || retentionRate === 0 ? 'good' : 'warn',
        },
        {
          label: 'Tokens / custo 30d',
          value: num(totalTokens),
          detail: money(estimatedCost),
          tone: estimatedCost > 25 ? 'warn' : 'neutral',
        },
      ];

  return (
    <>
      <div style={operationGridStyle}>
        {cards.map((card) => (
          <OperationMetric
            key={card.label}
            label={card.label}
            value={card.value}
            detail={card.detail}
            tone={card.tone as 'good' | 'warn' | 'neutral'}
          />
        ))}
      </div>

      <div style={dashboardGridStyle}>
        <section style={widePanelStyle}>
          <PanelHeader title="Pipeline de IA" action="30 dias" />
          <div style={queueBarsStyle}>
            {queueStatus.map((item) => (
              <BarRow key={item.label} label={item.label} value={item.value} max={Math.max(...queueStatus.map((row) => row.value), 1)} />
            ))}
          </div>
        </section>

        <section style={panelStyleLight}>
          <PanelHeader title="Saude do sistema" />
          <HealthList metrics={metrics} />
        </section>

        <section style={panelStyleLight}>
          <PanelHeader title="Erro por modelo" />
          <ModelErrorBars rows={overview.usage.tokensByModel} />
        </section>

        <section style={panelStyleLight}>
          <PanelHeader title="Mapa de estudos" action="atividade" />
          <Heatmap rows={overview.learning?.studyHeatmap ?? []} />
        </section>

        <section style={activityPanelStyle}>
          <PanelHeader title="Atividades recentes" />
          <ActivityTable rows={overview.activity ?? []} />
        </section>

        <FsrsSimulator />
      </div>
    </>
  );
}

function NavIcon({ name }: { name: string }) {
  const path = {
    grid: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',
    pulse: 'M3 12h4l2-6 4 12 2-6h6',
    layers: 'm12 3 9 5-9 5-9-5 9-5Zm-7 9 7 4 7-4M5 16l7 4 7-4',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm22 10v-2a4 4 0 0 0-3-3.87M23 3.13a4 4 0 0 1 0 7.75',
    card: 'M3 6h18v12H3V6Zm0 4h18M7 15h4',
    spark: 'M12 2l1.7 5.2L19 9l-5.3 1.8L12 16l-1.7-5.2L5 9l5.3-1.8L12 2Zm7 12 .9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z',
  }[name] ?? 'M4 4h16v16H4V4Z';

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HealthStrip({ metrics }: { metrics: Record<string, number> }) {
  const sourceQueue = (metrics.sourcesQueued ?? 0) + (metrics.runsQueued ?? 0);
  return (
    <div style={healthStripStyle}>
      <StatusPill tone={(metrics.runsErrored24h ?? 0) > 0 ? 'warn' : 'good'} label="API de IA" value={(metrics.runsErrored24h ?? 0) > 0 ? 'instavel' : 'online'} />
      <StatusPill tone="good" label="Database" value="12ms" />
      <StatusPill tone={sourceQueue > 10 ? 'warn' : 'good'} label="Fila" value={`${sourceQueue} pendentes`} />
    </div>
  );
}

function HealthList({ metrics }: { metrics: Record<string, number> }) {
  const sourceQueue = (metrics.sourcesQueued ?? 0) + (metrics.runsQueued ?? 0);
  const failedOps = (metrics.runsErrored24h ?? 0) + (metrics.failedEmailDeliveries ?? 0) + (metrics.webhookFailures24h ?? 0);
  return (
    <div style={healthListStyle}>
      <StatusRow tone={failedOps > 0 ? 'warn' : 'good'} label="IA e webhooks" value={failedOps > 0 ? `${failedOps} alertas` : 'normal'} />
      <StatusRow tone="good" label="Database" value="latencia 12ms" />
      <StatusRow tone={sourceQueue > 10 ? 'warn' : 'good'} label="Documentos" value={`${sourceQueue} aguardando`} />
      <StatusRow tone={(metrics.pendingEmailDeliveries ?? 0) > 20 ? 'warn' : 'good'} label="Notificacoes" value={`${metrics.pendingEmailDeliveries ?? 0} pendentes`} />
    </div>
  );
}

function StatusPill({ tone, label, value }: { tone: 'good' | 'warn'; label: string; value: string }) {
  return (
    <div style={statusPillStyle}>
      <span style={tone === 'good' ? greenDotStyle : yellowDotStyle} />
      <span style={statusLabelStyle}>{label}:</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusRow({ tone, label, value }: { tone: 'good' | 'warn'; label: string; value: string }) {
  return (
    <div style={statusRowStyle}>
      <span style={tone === 'good' ? greenDotStyle : yellowDotStyle} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelHeader({ title, action }: { title: string; action?: string }) {
  return (
    <div style={panelHeaderStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {action && <span style={panelActionStyle}>{action}</span>}
    </div>
  );
}

function OperationMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  tone: 'good' | 'warn' | 'neutral';
}) {
  return (
    <div style={tone === 'good' ? operationCardGoodStyle : tone === 'warn' ? operationCardWarnStyle : operationCardStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={operationValueStyle}>{value}</div>
      <div style={operationDetailStyle}>{detail}</div>
    </div>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const width = `${Math.max(4, Math.round((value / max) * 100))}%`;
  return (
    <div style={barRowStyle}>
      <div style={barMetaStyle}>
        <span>{label}</span>
        <strong>{num(value)}</strong>
      </div>
      <div style={barTrackStyle}>
        <div style={{ ...barFillStyle, width }} />
      </div>
    </div>
  );
}

function ModelErrorBars({ rows }: { rows: Array<{ model: string; totalTokens: number; totalRuns: number; errors: number }> }) {
  if (rows.length === 0) return <Empty>Nenhum modelo usado ainda.</Empty>;
  return (
    <div style={queueBarsStyle}>
      {rows.map((row) => {
        const rate = row.totalRuns > 0 ? row.errors / row.totalRuns : 0;
        return <BarRow key={row.model} label={row.model} value={Math.round(rate * 100)} max={100} />;
      })}
    </div>
  );
}

function ModelUsageTable({ rows }: { rows: Array<{ model: string; totalTokens: number; totalRuns: number; errors: number }> }) {
  return (
    <Table
      columns={['Modelo', 'Runs', 'Tokens', 'Erros']}
      rows={rows.map((row) => [
        row.model,
        row.totalRuns,
        num(row.totalTokens),
        row.errors,
      ])}
    />
  );
}

function Heatmap({ rows }: { rows: Array<{ label: string; value: number }> }) {
  if (rows.length === 0) return <Empty>Sem atividade suficiente.</Empty>;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div style={heatmapStyle}>
      {rows.map((row) => (
        <div key={row.label} style={heatCellWrapStyle}>
          <div style={{ ...heatCellStyle, opacity: 0.25 + (row.value / max) * 0.75 }} />
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  );
}

function ActivityTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) return <Empty>Nenhuma atividade recente.</Empty>;
  return (
    <Table
      columns={['Usuario', 'Acao', 'Status', 'Horario']}
      rows={rows.slice(0, 8).map((row) => [
        String(row.user ?? '@visitante'),
        formatEvent(String(row.action ?? '-')),
        <Badge key="status" tone={String(row.status) === 'concluido' ? 'success' : 'neutral'}>{formatStatus(String(row.status ?? 'registrado'))}</Badge>,
        time(String(row.time ?? '')),
      ])}
    />
  );
}

function FsrsSimulator() {
  const [grade, setGrade] = useState<Grade>(2);
  const [difficulty, setDifficulty] = useState(5);
  const [stability, setStability] = useState(2.4);
  const [daysSinceReview, setDaysSinceReview] = useState(3);
  const [simNow] = useState(() => Date.now());

  const result = processReview(
    {
      difficulty,
      stability,
      last_review_at: simNow - daysSinceReview * 24 * 60 * 60 * 1000,
      next_review_at: simNow,
    },
    grade,
    simNow,
    undefined,
    false
  );

  return (
    <section style={simulatorPanelStyle}>
      <PanelHeader title="Simulador FSRS V5" action="debug" />
      <div style={simulatorGridStyle}>
        <label style={fieldStyle}>
          Nota
          <select style={inputStyle} value={grade} onChange={(event) => setGrade(Number(event.target.value) as Grade)}>
            <option value={0}>Errei</option>
            <option value={1}>Dificil</option>
            <option value={2}>Bom</option>
            <option value={3}>Facil</option>
          </select>
        </label>
        <label style={fieldStyle}>
          Dificuldade
          <input style={inputStyle} type="number" min={1} max={10} step={0.1} value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))} />
        </label>
        <label style={fieldStyle}>
          Estabilidade
          <input style={inputStyle} type="number" min={0.1} step={0.1} value={stability} onChange={(event) => setStability(Number(event.target.value))} />
        </label>
        <label style={fieldStyle}>
          Intervalo atual
          <input style={inputStyle} type="number" min={0} step={0.5} value={daysSinceReview} onChange={(event) => setDaysSinceReview(Number(event.target.value))} />
        </label>
      </div>
      <div style={simulatorResultStyle}>
        <Metric label="Proxima revisao" value={formatDays(result.intervalDays)} />
        <Metric label="Nova dificuldade" value={result.newState.difficulty.toFixed(2)} />
        <Metric label="Retencao prevista" value={pct(result.retrievability)} />
      </div>
    </section>
  );
}

function FilterBar(props: {
  search: string;
  setSearch: (value: string) => void;
  plan: string;
  setPlan: (value: string) => void;
  from: string;
  setFrom: (value: string) => void;
  to: string;
  setTo: (value: string) => void;
}) {
  return (
    <div style={filterStyle}>
      <input style={inputStyle} placeholder="Buscar email" value={props.search} onChange={(e) => props.setSearch(e.target.value)} />
      <select style={inputStyle} value={props.plan} onChange={(e) => props.setPlan(e.target.value)}>
        <option value="all">Todos os planos</option>
        <option value="free">Free</option>
        <option value="pro">Pro</option>
        <option value="active">Active</option>
        <option value="canceled">Canceled</option>
        <option value="past_due">Past due</option>
      </select>
      <input style={inputStyle} type="date" value={props.from} onChange={(e) => props.setFrom(e.target.value)} />
      <input style={inputStyle} type="date" value={props.to} onChange={(e) => props.setTo(e.target.value)} />
    </div>
  );
}

function UsersTable({
  users,
  onDetails,
  onAction,
}: {
  users: UserRow[];
  onDetails: (userId: string) => void;
  onAction: (userId: string, action: 'ban' | 'unban' | 'soft_delete' | 'impersonate') => void;
}) {
  if (users.length === 0) return <Empty>Nenhum usuario encontrado.</Empty>;
  return (
    <Table
      columns={['Email', 'Plano', 'Cadastro', 'Uso', 'Stripe', 'Acoes']}
      rows={users.map((user) => [
        <button key="email" type="button" onClick={() => onDetails(user.id)} style={linkButtonStyle}>{user.email || user.id}</button>,
        <Badge key="plan" tone={user.isPro ? 'success' : 'neutral'}>{user.subscriptionTier}/{user.subscriptionStatus}</Badge>,
        date(user.createdAt),
        `${user.counts.decks} decks / ${user.counts.reviews} reviews`,
        user.stripeCustomerUrl ? <a key="stripe" href={user.stripeCustomerUrl} target="_blank" rel="noreferrer" style={linkStyle}>Stripe</a> : '-',
        <div key="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <SmallButton onClick={() => onDetails(user.id)}>Detalhes</SmallButton>
          <SmallButton onClick={() => onAction(user.id, user.bannedUntil ? 'unban' : 'ban')}>{user.bannedUntil ? 'Desbanir' : 'Banir'}</SmallButton>
          <SmallButton onClick={() => onAction(user.id, 'impersonate')}>Impersonar</SmallButton>
          <DangerButton onClick={() => onAction(user.id, 'soft_delete')}>Deletar</DangerButton>
        </div>,
      ])}
    />
  );
}

function UserDetailPanel({
  detail,
  onClose,
  onAction,
}: {
  detail: UserDetail;
  onClose: () => void;
  onAction: (userId: string, action: 'ban' | 'unban' | 'soft_delete' | 'impersonate') => void;
}) {
  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={sectionTitleStyle}>{detail.user.email}</h2>
          <p style={mutedStyle}>{detail.user.id}</p>
        </div>
        <button type="button" onClick={onClose} style={smallButtonStyle}>Fechar</button>
      </div>
      <div style={gridStyle}>
        <Metric label="Decks" value={detail.usage.counts.decks} />
        <Metric label="Cards" value={detail.usage.counts.cards} />
        <Metric label="Reviews" value={detail.usage.counts.reviews} />
        <Metric label="Runs" value={detail.usage.counts.runs} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <SmallButton onClick={() => onAction(detail.user.id, detail.user.bannedUntil ? 'unban' : 'ban')}>
          {detail.user.bannedUntil ? 'Desbanir' : 'Banir'}
        </SmallButton>
        <SmallButton onClick={() => onAction(detail.user.id, 'impersonate')}>Impersonar</SmallButton>
        {detail.billing.stripeCustomerUrl && <a href={detail.billing.stripeCustomerUrl} target="_blank" rel="noreferrer" style={buttonLinkStyle}>Abrir Stripe</a>}
        <DangerButton onClick={() => onAction(detail.user.id, 'soft_delete')}>Deletar conta</DangerButton>
      </div>
      <div style={twoColStyle}>
        <Section title="Runs recentes">
          <CompactRows rows={detail.usage.runs} primary="objective" secondary="status" />
        </Section>
        <Section title="Pagamentos">
          <CompactRows rows={detail.billing.payments} primary="status" secondary="amountPaid" />
        </Section>
      </div>
    </div>
  );
}

function ContentView({ content }: { content: ContentResponse | null }) {
  if (!content) return <Empty>Carregando conteudo...</Empty>;
  return (
    <div style={twoColStyle}>
      <Section title={`Baralhos (${content.total})`}>
        <Table
          columns={['Titulo', 'Usuario', 'Cards', 'Reviews', 'Atualizado']}
          rows={content.decks.map((deck) => [
            String(deck.title ?? ''),
            String(deck.userEmail ?? ''),
            String(deck.cards ?? 0),
            String(deck.reviews ?? 0),
            date(Number(deck.updatedAt ?? 0)),
          ])}
        />
      </Section>
      <Section title="Geracoes IA recentes">
        <CompactRows rows={content.recentGenerations} primary="objective" secondary="status" />
      </Section>
    </div>
  );
}

function SystemView({ system }: { system: SystemResponse | null }) {
  if (!system) return <Empty>Carregando sistema...</Empty>;
  return (
    <>
      <div style={gridStyle}>
        {Object.entries(system.summary).slice(0, 10).map(([key, value]) => (
          <Metric key={key} label={key} value={typeof value === 'object' ? JSON.stringify(value) : String(value)} />
        ))}
      </div>
      <div style={twoColStyle}>
        <Section title="Fila de runs">
          <CompactRows rows={system.queue} primary="status" secondary="error_message" />
        </Section>
        <Section title="Emails pendentes/erro">
          <CompactRows rows={system.emailDeliveries} primary="status" secondary="failure_reason" />
        </Section>
      </div>
      <Section title="Webhooks com erro">
        <CompactRows rows={system.webhookLogs} primary="event_type" secondary="error_message" />
      </Section>
    </>
  );
}

function BetaView(props: {
  invites: BetaInviteRow[];
  activeCount: number;
  limit: number;
  name: string;
  setName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  message: string;
  error: string;
  manualCode: string;
  onCreate: (event: React.FormEvent) => void;
  onRevoke: (inviteId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <Section title={`Beta privado (${props.activeCount}/${props.limit})`}>
      <form onSubmit={props.onCreate} style={filterStyle}>
        <input style={inputStyle} type="text" placeholder="Nome completo" value={props.name} onChange={(e) => props.setName(e.target.value)} />
        <input style={inputStyle} type="email" placeholder="email@exemplo.com" value={props.email} onChange={(e) => props.setEmail(e.target.value)} />
        <button type="submit" style={buttonStyle}>Adicionar ao beta</button>
        <button type="button" onClick={props.onRefresh} style={buttonStyle}>Atualizar</button>
      </form>
      {props.error && <Notice tone="error">{props.error}</Notice>}
      {props.message && <Notice>{props.message}</Notice>}
      {props.manualCode && <Notice>Codigo manual: {props.manualCode}</Notice>}
      <Table
        columns={['Nome', 'Email', 'Status', 'Entrega', 'Envios', 'Acesso', 'Acao']}
        rows={props.invites.map((invite) => [
          invite.name || '-',
          invite.email,
          invite.status,
          invite.emailDeliveryStatus ?? 'pendente',
          invite.sendCount,
          invite.status === 'revoked'
            ? 'revogado'
            : invite.userId
              ? 'Pro liberado'
              : 'aguardando conta',
          invite.status === 'revoked'
            ? '-'
            : <DangerButton key={invite.id} onClick={() => props.onRevoke(invite.id)}>Revogar</DangerButton>,
        ])}
      />
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return <Empty>Nenhum dado.</Empty>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>{columns.map((column) => <th key={column} style={thStyle}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} style={trStyle}>
              {row.map((cell, cellIndex) => <td key={cellIndex} style={tdStyle}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactRows({ rows, primary, secondary }: { rows: Array<Record<string, unknown>>; primary: string; secondary: string }) {
  if (rows.length === 0) return <Empty>Nenhum dado.</Empty>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((row, index) => (
        <div key={String(row.id ?? index)} style={miniRowStyle}>
          <strong style={{ color: '#F8FAFC' }}>{String(row[primary] ?? '-')}</strong>
          <span style={mutedStyle}>{String(row[secondary] ?? '')}</span>
        </div>
      ))}
    </div>
  );
}

function KeyValue({ data }: { data: Record<string, number> }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {Object.entries(data).map(([key, value]) => (
        <div key={key} style={miniRowStyle}>
          <span>{key}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function Pager({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (page: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
      <button type="button" style={smallButtonStyle} disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
      <span style={mutedStyle}>Pagina {page} de {totalPages}</span>
      <button type="button" style={smallButtonStyle} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Proxima</button>
    </div>
  );
}

function Badge({ tone, children }: { tone: 'success' | 'neutral'; children: React.ReactNode }) {
  return <span style={tone === 'success' ? successBadgeStyle : badgeStyle}>{children}</span>;
}

function Notice({ children, tone = 'success' }: { children: React.ReactNode; tone?: 'success' | 'error' }) {
  return <div style={tone === 'error' ? errorNoticeStyle : noticeStyle}>{children}</div>;
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={smallButtonStyle}>{children}</button>;
}

function DangerButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={dangerButtonStyle}>{children}</button>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={emptyStyle}>{children}</div>;
}

function num(value: number) {
  return value.toLocaleString('pt-BR');
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
}

function pct(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function date(value: number) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function time(value: string) {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatEvent(event: string) {
  const labels: Record<string, string> = {
    upload_start: 'Upload iniciado',
    upload_complete: 'Upload concluido',
    run_created: 'Geracao criada',
    run_completed: 'Geracao concluida',
    login_success: 'Login',
    checkout_complete: 'Checkout concluido',
    subscription_canceled: 'Assinatura cancelada',
  };
  return labels[event] ?? event.replaceAll('_', ' ');
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    concluido: 'Concluido',
    processando: 'Processando',
    registrado: 'Registrado',
  };
  return labels[status] ?? status;
}

function formatDays(days: number) {
  if (days < 1 / 24) return `${Math.round(days * 24 * 60)} min`;
  if (days < 1) return `${Math.round(days * 24)} h`;
  if (days < 30) return `${Math.round(days)} dias`;
  return `${Math.round(days / 30)} meses`;
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#06040B',
  color: '#F8FAFC',
  display: 'grid',
  gridTemplateColumns: '248px minmax(0, 1fr)',
};
const sidebarStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #11091F 0%, #08050F 100%)',
  color: '#F8FAFC',
  padding: 22,
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  minHeight: '100vh',
  position: 'sticky',
  top: 0,
};
const brandStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 };
const brandMarkStyle: React.CSSProperties = { width: 38, height: 38, borderRadius: 8, background: '#8B5CF6', color: '#FFFFFF', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 20, boxShadow: '0 12px 30px rgba(139,92,246,0.35)' };
const brandNameStyle: React.CSSProperties = { fontSize: 18, fontWeight: 900 };
const brandSubStyle: React.CSSProperties = { fontSize: 12, color: '#A78BFA', marginTop: 2 };
const sideNavStyle: React.CSSProperties = { display: 'grid', gap: 6 };
const sideTabStyle: React.CSSProperties = { border: 0, background: 'transparent', color: '#B8A6D9', borderRadius: 8, padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'left' };
const activeSideTabStyle: React.CSSProperties = { ...sideTabStyle, color: '#FFFFFF', background: 'rgba(139,92,246,0.22)', boxShadow: 'inset 3px 0 0 #A78BFA' };
const sidebarCardStyle: React.CSSProperties = { marginTop: 'auto', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 8, padding: 14, background: 'rgba(139,92,246,0.1)' };
const sidebarCardLabelStyle: React.CSSProperties = { display: 'block', color: '#B8A6D9', fontSize: 12, marginBottom: 8 };
const sidebarEmailStyle: React.CSSProperties = { display: 'block', color: '#fff', overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.4 };
const sidebarCardHintStyle: React.CSSProperties = { display: 'block', color: '#7DD3A0', fontSize: 12, marginTop: 10 };
const mainStyle: React.CSSProperties = { minWidth: 0, padding: 28, maxWidth: 1480, width: '100%', margin: '0 auto', background: 'radial-gradient(circle at top right, rgba(124,58,237,0.22), transparent 34%), #06040B' };
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, marginBottom: 22 };
const headerActionsStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' };
const eyebrowStyle: React.CSSProperties = { color: '#A78BFA', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 5px' };
const titleStyle: React.CSSProperties = { fontSize: 30, fontWeight: 900, margin: 0, letterSpacing: 0 };
const mutedStyle: React.CSSProperties = { color: '#A99AC2', fontSize: 13, margin: 0 };
const healthStripStyle: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };
const statusPillStyle: React.CSSProperties = { height: 36, display: 'flex', alignItems: 'center', gap: 7, padding: '0 11px', background: '#130D21', border: '1px solid rgba(167,139,250,0.18)', borderRadius: 999, fontSize: 12, color: '#F8FAFC' };
const statusLabelStyle: React.CSSProperties = { color: '#B8A6D9' };
const greenDotStyle: React.CSSProperties = { width: 8, height: 8, borderRadius: 999, background: '#22C55E', boxShadow: '0 0 0 3px rgba(34,197,94,0.12)' };
const yellowDotStyle: React.CSSProperties = { width: 8, height: 8, borderRadius: 999, background: '#F59E0B', boxShadow: '0 0 0 3px rgba(245,158,11,0.14)' };
const operationGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 16 };
const operationCardStyle: React.CSSProperties = { background: '#130D21', border: '1px solid rgba(167,139,250,0.18)', borderRadius: 8, padding: 18, minHeight: 126, boxShadow: '0 18px 50px rgba(0,0,0,0.24)' };
const operationCardGoodStyle: React.CSSProperties = { ...operationCardStyle, borderColor: 'rgba(34,197,94,0.28)' };
const operationCardWarnStyle: React.CSSProperties = { ...operationCardStyle, borderColor: 'rgba(245,158,11,0.42)', background: '#18101F' };
const metricLabelStyle: React.CSSProperties = { color: '#A78BFA', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, fontWeight: 800 };
const operationValueStyle: React.CSSProperties = { fontSize: 30, fontWeight: 900, lineHeight: 1.05, color: '#FFFFFF' };
const operationDetailStyle: React.CSSProperties = { color: '#B8A6D9', fontSize: 13, marginTop: 12 };
const dashboardGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1.25fr 0.9fr 0.9fr', gap: 16, alignItems: 'stretch' };
const panelStyleLight: React.CSSProperties = { background: '#0F0A1A', border: '1px solid rgba(167,139,250,0.16)', borderRadius: 8, padding: 16, minWidth: 0, boxShadow: '0 16px 40px rgba(0,0,0,0.22)' };
const widePanelStyle: React.CSSProperties = { ...panelStyleLight, gridColumn: 'span 2' };
const activityPanelStyle: React.CSSProperties = { ...panelStyleLight, gridColumn: 'span 2' };
const simulatorPanelStyle: React.CSSProperties = { ...panelStyleLight, background: 'linear-gradient(135deg, #1E1236 0%, #10091D 100%)', color: '#F8FAFC', borderColor: 'rgba(196,181,253,0.26)' };
const panelHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 };
const sectionTitleStyle: React.CSSProperties = { fontSize: 16, margin: 0, fontWeight: 900, letterSpacing: 0, color: 'inherit' };
const panelActionStyle: React.CSSProperties = { color: '#DDD6FE', background: 'rgba(139,92,246,0.18)', borderRadius: 999, padding: '4px 9px', fontSize: 12, fontWeight: 800 };
const queueBarsStyle: React.CSSProperties = { display: 'grid', gap: 13 };
const barRowStyle: React.CSSProperties = { display: 'grid', gap: 7 };
const barMetaStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#C4B5FD' };
const barTrackStyle: React.CSSProperties = { height: 10, borderRadius: 999, background: '#211635', overflow: 'hidden' };
const barFillStyle: React.CSSProperties = { height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #7C3AED 0%, #C084FC 100%)' };
const healthListStyle: React.CSSProperties = { display: 'grid', gap: 10 };
const statusRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '12px 1fr auto', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid rgba(167,139,250,0.12)', fontSize: 13 };
const heatmapStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 9 };
const heatCellWrapStyle: React.CSSProperties = { display: 'grid', gap: 8, justifyItems: 'center', color: '#C4B5FD', fontSize: 12 };
const heatCellStyle: React.CSSProperties = { width: '100%', aspectRatio: '1 / 1', borderRadius: 8, background: '#8B5CF6' };
const simulatorGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 };
const fieldStyle: React.CSSProperties = { display: 'grid', gap: 6, color: '#DDD6FE', fontSize: 12, fontWeight: 800 };
const simulatorResultStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 };
const metricGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 16 };
const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 };
const twoColStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, alignItems: 'start' };
const sectionStyle: React.CSSProperties = { ...panelStyleLight, marginBottom: 16 };
const cardStyle: React.CSSProperties = { background: '#171027', border: '1px solid rgba(167,139,250,0.14)', borderRadius: 8, padding: 14 };
const metricValueStyle: React.CSSProperties = { fontSize: 22, fontWeight: 900, color: '#FFFFFF' };
const filterStyle: React.CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, background: '#0F0A1A', border: '1px solid rgba(167,139,250,0.16)', borderRadius: 8, padding: 12 };
const inputStyle: React.CSSProperties = { minHeight: 38, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.22)', background: '#130D21', color: '#F8FAFC', minWidth: 0 };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', minWidth: 700 };
const thStyle: React.CSSProperties = { textAlign: 'left', color: '#A78BFA', fontSize: 11, textTransform: 'uppercase', padding: '10px 8px', borderBottom: '1px solid rgba(167,139,250,0.18)', letterSpacing: '0.06em' };
const tdStyle: React.CSSProperties = { padding: '12px 8px', borderBottom: '1px solid rgba(167,139,250,0.1)', fontSize: 13, verticalAlign: 'top', color: '#EDE9FE' };
const trStyle: React.CSSProperties = { background: 'transparent' };
const buttonStyle: React.CSSProperties = { padding: '9px 13px', borderRadius: 8, border: '1px solid rgba(196,181,253,0.35)', background: '#7C3AED', color: '#fff', cursor: 'pointer', fontWeight: 800, boxShadow: '0 10px 24px rgba(124,58,237,0.28)' };
const smallButtonStyle: React.CSSProperties = { ...buttonStyle, padding: '6px 9px', fontSize: 12 };
const dangerButtonStyle: React.CSSProperties = { ...smallButtonStyle, borderColor: '#DC2626', background: '#DC2626', color: '#fff' };
const buttonLinkStyle: React.CSSProperties = { ...smallButtonStyle, textDecoration: 'none', display: 'inline-block' };
const linkStyle: React.CSSProperties = { color: '#C4B5FD', textDecoration: 'none', fontWeight: 700 };
const linkButtonStyle: React.CSSProperties = { background: 'none', border: 0, color: '#C4B5FD', cursor: 'pointer', padding: 0, textAlign: 'left', fontWeight: 700 };
const badgeStyle: React.CSSProperties = { display: 'inline-block', padding: '4px 9px', borderRadius: 999, background: 'rgba(139,92,246,0.18)', color: '#DDD6FE', fontSize: 12, fontWeight: 800 };
const successBadgeStyle: React.CSSProperties = { ...badgeStyle, background: '#DCFCE7', color: '#166534' };
const noticeStyle: React.CSSProperties = { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#86EFAC', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13 };
const errorNoticeStyle: React.CSSProperties = { ...noticeStyle, background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.28)', color: '#FCA5A5' };
const panelStyle: React.CSSProperties = { ...sectionStyle, marginTop: 16, borderColor: 'rgba(196,181,253,0.34)' };
const miniRowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: 10, background: '#171027', borderRadius: 8, fontSize: 13, color: '#EDE9FE' };
const emptyStyle: React.CSSProperties = { padding: 24, textAlign: 'center', color: '#A99AC2', fontSize: 14 };
