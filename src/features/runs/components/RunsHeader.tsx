import Link from 'next/link';
import type { MonthlyUsage } from '@/lib/billing/run-entitlement';
import { Icons } from './Icons';

interface RunsHeaderProps {
  usage: MonthlyUsage | null;
}

export function RunsHeader({ usage }: RunsHeaderProps) {
  // Desativado temporariamente: geração ilimitada
  const label = null;
  /* const label = usage && !usage.isPro
    ? `${usage.flashcardsUsed}/${usage.flashcardsLimit} geracoes este mes`
    : null; */

  return (
    <>
      <style>{`
        .runs-header {
          padding: 16px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-raised);
          gap: 12px;
          flex-wrap: wrap;
        }

        @media (max-width: 480px) {
          .runs-header {
            padding: 12px 14px;
          }

          .runs-header-title {
            font-size: 17px !important;
          }

          .runs-header-subtitle {
            font-size: 12px !important;
          }

          .runs-header-usage {
            padding: 6px 12px !important;
            font-size: 12px !important;
          }
        }
      `}</style>

      <header className="runs-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href="/dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'var(--bg-muted)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <Icons.ArrowLeft />
          </Link>
          <div>
            <h1 className="runs-header-title" style={{ fontSize: 20, fontWeight: 700 }}>Treino de prova</h1>
            <p className="runs-header-subtitle" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Escolha seu objetivo, envie o material e gere um simulado guiado.
            </p>
          </div>
        </div>

        {label && (
          <div
            className="runs-header-usage"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              background: 'var(--bg-muted)',
              borderRadius: 100,
              border: '1px solid var(--border)',
            }}
          >
            <Icons.Coins />
            <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
          </div>
        )}
      </header>
    </>
  );
}
