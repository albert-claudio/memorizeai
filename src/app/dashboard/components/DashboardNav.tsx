'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { Icons } from './Icons';

const NAV_ITEMS = [
  { label: 'Início', href: '/dashboard', icon: Icons.Home, exact: true },
  { label: 'Decks', href: '/dashboard/decks', icon: Icons.Cards, exact: false },
  { label: 'Simulados', href: '/dashboard/simulados', icon: Icons.FileQuestion, exact: false },
  { label: 'Desempenho', href: '/dashboard/desempenho', icon: Icons.Trophy, exact: false },
  { label: 'Config.', href: '/dashboard/settings', icon: Icons.Settings, exact: false },
];

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
      }
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <>
      <style jsx global>{`
        /* Desktop Top Header */
        .dashboard-global-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          height: 64px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(15, 15, 15, 0.8);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
        }

        .nav-brand-container {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 140px;
        }

        .nav-links-container {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .nav-actions-container {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 16px;
          min-width: 140px;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 10px;
          color: #a1a1aa;
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s ease;
        }

        .nav-link:hover {
          color: #e4e4e7;
          background: rgba(255, 255, 255, 0.04);
        }

        .nav-link.active {
          color: #fff;
          background: rgba(255, 255, 255, 0.08);
        }

        /* Mobile Bottom Tab Bar */
        .mobile-bottom-bar {
          display: none;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 64px;
          background: rgba(15, 15, 15, 0.9);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255,255,255,0.06);
          z-index: 50;
          padding-bottom: env(safe-area-inset-bottom);
        }

        .mobile-tab-link {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          color: #71717a;
          text-decoration: none;
          transition: all 0.2s ease;
          padding-top: 6px;
        }

        .mobile-tab-link.active {
          color: #A855F7;
        }

        .mobile-tab-label {
          font-size: 10px;
          font-weight: 600;
        }

        @media (max-width: 768px) {
          .nav-links-container {
            display: none;
          }
          .mobile-bottom-bar {
            display: flex;
          }
          .dashboard-global-nav {
            padding: 0 16px;
          }
          .nav-header-username {
            display: none !important;
          }
        }
      `}</style>

      {/* Desktop & Mobile Top Header */}
      <header className="dashboard-global-nav">
        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <div className="nav-brand-container">
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(99, 102, 241, 0.3)',
            }}>
              <div style={{ transform: 'scale(0.8)' }}>
                 <Icons.Brain />
              </div>
            </div>
            <span style={{ 
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: '-0.02em',
              background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Vimens
            </span>
          </div>
        </Link>

        {/* Desktop Links Center */}
        <div className="nav-links-container">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact 
              ? pathname === item.href 
              : pathname.startsWith(item.href);
              
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <item.icon />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Actions Right */}
        <div className="nav-actions-container">
          <span className="nav-header-username" style={{ 
            fontSize: 13, 
            color: '#a1a1aa',
            fontWeight: 500,
          }}>
            {user?.user_metadata?.full_name || user?.email}
          </span>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              color: '#a1a1aa',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="Sair"
          >
            <Icons.Logout />
          </button>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <nav className="mobile-bottom-bar">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact 
            ? pathname === item.href 
            : pathname.startsWith(item.href);
            
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`mobile-tab-link ${isActive ? 'active' : ''}`}
            >
              <div style={{ transform: 'scale(0.9)' }}>
                 <item.icon />
              </div>
              <span className="mobile-tab-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
