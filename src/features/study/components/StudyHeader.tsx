
import Link from 'next/link';
import { Icons } from '@/features/deck/components/Icons';

interface StudyHeaderProps {
  deckTitle: string;
  currentIndex: number;
  totalDue: number;
}

export function StudyHeader({ deckTitle, currentIndex, totalDue }: StudyHeaderProps) {
  const progress = Math.min(((currentIndex) / totalDue) * 100, 100);

  return (
    <header style={{
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative',
      zIndex: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link 
          href="/dashboard" 
          style={{ 
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'var(--bg-muted)',
          }}
        >
          <Icons.X />
        </Link>
        
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            {deckTitle}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ 
              width: 100, 
              height: 4, 
              background: 'var(--bg-muted)', 
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{ 
                width: `${progress}%`, 
                height: '100%', 
                background: 'var(--accent)', 
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {currentIndex + 1} / {totalDue}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
