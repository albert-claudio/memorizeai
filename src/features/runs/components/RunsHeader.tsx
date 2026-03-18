
import Link from 'next/link';
import type { MonthlyUsage } from '@/lib/billing/run-entitlement';
import { Icons } from './Icons';

interface RunsHeaderProps {
  usage: MonthlyUsage | null;
}

export function RunsHeader({ usage }: RunsHeaderProps) {
  const label = usage
    ? usage.isPro
      ? `${usage.simuladosUsed}/${usage.simuladosLimit} simulados este mês`
      : `${usage.flashcardsUsed}/${usage.flashcardsLimit} gerações este mês`
    : null;

  return (
    <header style={{
      padding: '16px 24px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--bg-raised)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link
          href="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--bg-muted)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
          }}
        >
          <Icons.ArrowLeft />
        </Link>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Gerar com IA</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Escolha uma fonte e o tipo de conteúdo
          </p>
        </div>
      </div>

      {label && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: 'var(--bg-muted)',
          borderRadius: 100,
          border: '1px solid var(--border)',
        }}>
          <Icons.Coins />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {label}
          </span>
        </div>
      )}
    </header>
  );
}
