
import Link from 'next/link';
import type { Source } from '@/lib/types';
import { Icons } from './Icons';

interface SourceStepProps {
  loadingSources: boolean;
  sources: Source[];
  selectedSource: Source | null;
  onSelectSource: (source: Source) => void;
}

export function SourceStep({ loadingSources, sources, selectedSource, onSelectSource }: SourceStepProps) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>
          1. Escolha a fonte
        </h2>
        <Link
          href="/dashboard/upload"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
            borderRadius: 10,
            color: 'white',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 2px 12px rgba(34, 197, 94, 0.3)',
            transition: 'all 0.2s ease',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Novo PDF
        </Link>
      </div>

      {loadingSources ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Icons.Loader />
        </div>
      ) : sources.length === 0 ? (
        <div style={{
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 40,
          textAlign: 'center',
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#22C55E',
          }}>
            <Icons.File />
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 8, fontSize: 15, fontWeight: 500 }}>
            Nenhum PDF processado ainda
          </p>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13 }}>
            Faça upload de um PDF para começar a gerar conteúdo com IA
          </p>
          <Link
            href="/dashboard/upload"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 28px',
              background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
              borderRadius: 12,
              color: 'white',
              textDecoration: 'none',
              fontSize: 15,
              fontWeight: 600,
              boxShadow: '0 4px 16px rgba(34, 197, 94, 0.3)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Fazer Upload de PDF
          </Link>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: 12,
        }}>
          {sources.map(source => (
            <button
              key={source.id}
              onClick={() => onSelectSource(source)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 20,
                background: selectedSource?.id === source.id
                  ? 'rgba(99, 102, 241, 0.1)'
                  : 'var(--bg-raised)',
                border: selectedSource?.id === source.id
                  ? '2px solid var(--accent)'
                  : '1px solid var(--border)',
                borderRadius: 14,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: selectedSource?.id === source.id
                  ? 'var(--accent)'
                  : 'var(--bg-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: selectedSource?.id === source.id
                  ? 'white'
                  : 'var(--text-muted)',
              }}>
                <Icons.File />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                  {source.filename}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {source.total_pages ? `${source.total_pages} páginas` : 'Processado'}
                </p>
              </div>
              {selectedSource?.id === source.id && (
                <div style={{ color: 'var(--accent)' }}>
                  <Icons.Check />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
