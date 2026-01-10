'use client';

import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { Icons } from './Icons';

// ============================================================================
// DASHBOARD HEADER - Responsive Design (Desktop + Mobile)
// ============================================================================

interface DashboardHeaderProps {
  user: User | null;
  onLogout: () => void;
}

export function DashboardHeader({ user, onLogout }: DashboardHeaderProps) {
  const router = useRouter();
  
  return (
    <>
      {/* Responsive CSS for mobile */}
      <style jsx global>{`
        .dashboard-header {
          padding: 16px 24px;
        }
        .header-logo-icon {
          width: 42px;
          height: 42px;
        }
        .header-logo-text {
          font-size: 22px;
        }
        .header-user-name {
          display: inline;
        }
        .header-btn-text {
          display: inline;
        }
        .header-btn {
          padding: 10px 18px;
          gap: 8px;
        }
        
        @media (max-width: 640px) {
          .dashboard-header {
            padding: 12px 16px;
          }
          .header-logo-icon {
            width: 36px;
            height: 36px;
          }
          .header-logo-text {
            font-size: 18px;
          }
          .header-user-name {
            display: none;
          }
          .header-btn-text {
            display: none;
          }
          .header-btn {
            padding: 10px;
            width: 40px;
            height: 40px;
            justify-content: center;
          }
        }
      `}</style>
      
      <header className="dashboard-header" style={{
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
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="header-logo-icon" style={{
            borderRadius: 12,
            background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 24px rgba(99, 102, 241, 0.4)',
          }}>
            <Icons.Brain />
          </div>
          <span className="header-logo-text" style={{ 
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}>
            Memorize<span style={{
              background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>AI</span>
          </span>
        </div>
        
        {/* Right side - User + Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="header-user-name" style={{ 
            fontSize: 14, 
            color: '#a1a1aa',
            fontWeight: 500,
          }}>
            {user?.user_metadata?.full_name || user?.email}
          </span>
          <button
            onClick={() => router.push('/dashboard/settings')}
            className="header-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              color: '#a1a1aa',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <Icons.Settings />
          </button>
          <button
            onClick={onLogout}
            className="header-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              color: '#a1a1aa',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <Icons.Logout />
            <span className="header-btn-text">Sair</span>
          </button>
        </div>
      </header>
    </>
  );
}
