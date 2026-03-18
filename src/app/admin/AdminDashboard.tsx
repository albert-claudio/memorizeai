'use client';

import { useEffect, useState, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface Stats {
  totalUsers: number;
  proUsers: number;
  runsToday: number;
  runs7d: number;
  tokensByModel: { model: string; totalTokens: number; totalRuns: number }[];
}

interface UserRow {
  id: string;
  email: string;
  isPro: boolean;
  adminOverridePro: boolean;
  subscriptionStatus: string;
  subscriptionTier: string;
  createdAt: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  // Password gate
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');

  // Dashboard state
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [togglingUser, setTogglingUser] = useState<string | null>(null);
  const limit = 20;

  // Helper: headers with admin password
  const adminHeaders = useCallback(
    (extra?: Record<string, string>) => ({
      'x-admin-password': password,
      ...extra,
    }),
    [password]
  );

  // Handle password submit
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/admin/stats', {
        headers: adminHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setAuthenticated(true);
      } else {
        const err = await res.json();
        setAuthError(err.error || 'Senha inválida.');
      }
    } catch {
      setAuthError('Erro de conexão.');
    }
  };

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/stats', {
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (!data.error) setStats(data);
    } finally {
      setLoading(false);
    }
  }, [authenticated, adminHeaders]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    if (!authenticated) return;
    setUsersLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(search && { search }),
    });
    try {
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (!data.error) {
        setUsers(data.users);
        setTotalUsers(data.total);
      }
    } finally {
      setUsersLoading(false);
    }
  }, [authenticated, page, search, adminHeaders]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Toggle pro
  const handleTogglePro = async (userId: string, currentOverride: boolean) => {
    setTogglingUser(userId);
    try {
      const res = await fetch('/api/admin/toggle-pro', {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId, grantPro: !currentOverride }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, adminOverridePro: !currentOverride } : u
          )
        );
        fetchStats();
      }
    } finally {
      setTogglingUser(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const totalPages = Math.ceil(totalUsers / limit);

  // ── PASSWORD GATE ──────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <form
          onSubmit={handlePasswordSubmit}
          style={{
            background: '#0A0A0A',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 20,
            padding: '48px 40px',
            maxWidth: 380,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#f4f4f5',
              marginBottom: 8,
              letterSpacing: '-0.02em',
            }}
          >
            Admin
          </h1>
          <p style={{ fontSize: 13, color: '#71717a', marginBottom: 28 }}>
            Digite a senha administrativa para acessar
          </p>
          <input
            type="password"
            placeholder="Senha admin"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            style={{
              ...inputStyle,
              width: '100%',
              marginBottom: 16,
              textAlign: 'center',
              fontSize: 16,
              letterSpacing: '0.1em',
            }}
          />
          {authError && (
            <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{authError}</p>
          )}
          <button
            type="submit"
            disabled={!password}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              background: password
                ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)'
                : 'rgba(255,255,255,0.05)',
              color: password ? 'white' : '#52525b',
              cursor: password ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
            }}
          >
            Acessar
          </button>
          <p style={{ fontSize: 11, color: '#3f3f46', marginTop: 20 }}>
            {adminEmail}
          </p>
        </form>
      </div>
    );
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#000' }}>
      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(10,10,10,0.95)',
          backdropFilter: 'blur(20px)',
          padding: '16px 0',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: '#f4f4f5' }}>
              Admin Dashboard
            </span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                color: 'white',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Admin
            </span>
          </div>
          <span style={{ fontSize: 13, color: '#71717a' }}>{adminEmail}</span>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {/* Stats Cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spinner />
          </div>
        ) : stats ? (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
                marginBottom: 40,
              }}
            >
              <StatCard label="Total de Usuários" value={stats.totalUsers} icon="👥" />
              <StatCard label="Usuários Pro" value={stats.proUsers} icon="👑" accent />
              <StatCard label="Runs Hoje" value={stats.runsToday} icon="⚡" />
              <StatCard label="Runs (7 dias)" value={stats.runs7d} icon="📊" />
            </div>

            {/* Tokens by Model */}
            <Section title="Tokens Consumidos por Modelo" subtitle="Últimos 30 dias">
              {stats.tokensByModel.length === 0 ? (
                <EmptyMsg>Nenhum dado de tokens no período.</EmptyMsg>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <Th>Modelo</Th>
                        <Th align="right">Total Tokens</Th>
                        <Th align="right">Total Runs</Th>
                        <Th align="right">Tokens/Run</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.tokensByModel.map((m) => (
                        <tr key={m.model} style={rowStyle}>
                          <Td>
                            <span style={{ fontWeight: 600, color: '#f4f4f5' }}>{m.model}</span>
                          </Td>
                          <Td align="right">{m.totalTokens.toLocaleString('pt-BR')}</Td>
                          <Td align="right">{m.totalRuns.toLocaleString('pt-BR')}</Td>
                          <Td align="right">
                            {m.totalRuns > 0
                              ? Math.round(m.totalTokens / m.totalRuns).toLocaleString('pt-BR')
                              : '—'}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        ) : (
          <EmptyMsg>Erro ao carregar estatísticas.</EmptyMsg>
        )}

        {/* Users Table */}
        <Section title="Gestão de Usuários" subtitle={`${totalUsers} usuário${totalUsers !== 1 ? 's' : ''}`}>
          {/* Search */}
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <input
              type="text"
              placeholder="Buscar por email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={inputStyle}
            />
            <button type="submit" style={searchBtnStyle}>
              Buscar
            </button>
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setPage(1);
                }}
                style={{ ...searchBtnStyle, background: 'rgba(255,255,255,0.05)' }}
              >
                Limpar
              </button>
            )}
          </form>

          {usersLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spinner />
            </div>
          ) : users.length === 0 ? (
            <EmptyMsg>Nenhum usuário encontrado.</EmptyMsg>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <Th>Email</Th>
                      <Th>Status</Th>
                      <Th>Tier</Th>
                      <Th align="center">Pro Override</Th>
                      <Th>Criado em</Th>
                      <Th align="center">Ação</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} style={rowStyle}>
                        <Td>
                          <span style={{ fontWeight: 500, color: '#e4e4e7', fontSize: 13 }}>
                            {u.email || u.id.slice(0, 8) + '...'}
                          </span>
                        </Td>
                        <Td>
                          <StatusBadge status={u.subscriptionStatus} />
                        </Td>
                        <Td>
                          <span style={{ color: '#a1a1aa', fontSize: 13 }}>{u.subscriptionTier}</span>
                        </Td>
                        <Td align="center">
                          {u.adminOverridePro ? (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 10,
                                fontSize: 11,
                                fontWeight: 600,
                                background: 'rgba(34, 197, 94, 0.15)',
                                color: '#22C55E',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                              }}
                            >
                              ATIVO
                            </span>
                          ) : (
                            <span style={{ color: '#52525b', fontSize: 12 }}>—</span>
                          )}
                        </Td>
                        <Td>
                          <span style={{ color: '#71717a', fontSize: 12 }}>
                            {u.createdAt
                              ? new Date(u.createdAt).toLocaleDateString('pt-BR')
                              : '—'}
                          </span>
                        </Td>
                        <Td align="center">
                          <button
                            onClick={() => handleTogglePro(u.id, u.adminOverridePro)}
                            disabled={togglingUser === u.id}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 600,
                              border: 'none',
                              cursor: togglingUser === u.id ? 'wait' : 'pointer',
                              transition: 'all 0.2s ease',
                              background: u.adminOverridePro
                                ? 'rgba(239, 68, 68, 0.12)'
                                : 'rgba(99, 102, 241, 0.12)',
                              color: u.adminOverridePro ? '#f87171' : '#818CF8',
                              opacity: togglingUser === u.id ? 0.5 : 1,
                            }}
                          >
                            {togglingUser === u.id
                              ? '...'
                              : u.adminOverridePro
                                ? 'Revogar Pro'
                                : 'Conceder Pro'}
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 12,
                    marginTop: 24,
                  }}
                >
                  <PagBtn disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    ← Anterior
                  </PagBtn>
                  <span style={{ color: '#71717a', fontSize: 13 }}>
                    Página {page} de {totalPages}
                  </span>
                  <PagBtn disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    Próxima →
                  </PagBtn>
                </div>
              )}
            </>
          )}
        </Section>
      </main>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent
          ? 'linear-gradient(145deg, #0A0A0A 0%, rgba(99, 102, 241, 0.08) 100%)'
          : '#0A0A0A',
        border: `1px solid ${accent ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 16,
        padding: '24px 20px',
        ...(accent && { boxShadow: '0 0 40px rgba(99, 102, 241, 0.1)' }),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.03em' }}>
        {value.toLocaleString('pt-BR')}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#f4f4f5',
            letterSpacing: '-0.02em',
            marginBottom: 4,
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p style={{ fontSize: 13, color: '#71717a', fontWeight: 500 }}>{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'center' | 'right' }) {
  return (
    <th
      style={{
        padding: '10px 14px',
        fontSize: 11,
        fontWeight: 600,
        color: '#52525b',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        textAlign: align ?? 'left',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'left' | 'center' | 'right' }) {
  return (
    <td
      style={{
        padding: '12px 14px',
        fontSize: 13,
        color: '#a1a1aa',
        textAlign: align ?? 'left',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    active: {
      bg: 'rgba(34, 197, 94, 0.1)',
      text: '#22C55E',
      border: 'rgba(34, 197, 94, 0.25)',
    },
    past_due: {
      bg: 'rgba(245, 158, 11, 0.1)',
      text: '#F59E0B',
      border: 'rgba(245, 158, 11, 0.25)',
    },
    canceled: {
      bg: 'rgba(239, 68, 68, 0.1)',
      text: '#EF4444',
      border: 'rgba(239, 68, 68, 0.25)',
    },
  };
  const c = colors[status] ?? {
    bg: 'rgba(255,255,255,0.05)',
    text: '#71717a',
    border: 'rgba(255,255,255,0.08)',
  };

  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {status}
    </span>
  );
}

function PagBtn({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        color: disabled ? '#3f3f46' : '#a1a1aa',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        border: '3px solid rgba(255,255,255,0.08)',
        borderTopColor: '#6366F1',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto',
      }}
    />
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '40px 20px',
        color: '#52525b',
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  background: '#0A0A0A',
  borderRadius: 12,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.06)',
};

const rowStyle: React.CSSProperties = {
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  transition: 'background 0.15s ease',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 14px',
  background: '#0A0A0A',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#e4e4e7',
  fontSize: 14,
  outline: 'none',
};

const searchBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  border: '1px solid rgba(99, 102, 241, 0.3)',
  background: 'rgba(99, 102, 241, 0.1)',
  color: '#818CF8',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  whiteSpace: 'nowrap',
};
