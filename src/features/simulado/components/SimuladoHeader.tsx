
import Link from 'next/link';
import { Icons } from '@/features/deck/components/Icons';

interface SimuladoHeaderProps {
  title: string;
  currentIndex: number;
  totalQuestions: number;
  answeredCount: number;
}

export function SimuladoHeader({ title, currentIndex, totalQuestions, answeredCount }: SimuladoHeaderProps) {
  return (
    <header style={{
      padding: '16px 24px',
      borderBottom: '1px solid #1C1C1E',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: '#0A0A0A',
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
            background: '#1C1C1E',
            color: '#888',
            textDecoration: 'none',
          }}
        >
          <Icons.ArrowLeft />
        </Link>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h1>
          <p style={{ fontSize: 13, color: '#888' }}>
            Questão {currentIndex + 1} de {totalQuestions}
          </p>
        </div>
      </div>
      
      <div style={{
        padding: '8px 16px',
        background: '#1C1C1E',
        borderRadius: 100,
        fontSize: 14,
        fontWeight: 600,
      }}>
        {answeredCount}/{totalQuestions} respondidas
      </div>
    </header>
  );
}
