import React from 'react';
import { DashboardNav } from './components/DashboardNav';
import { NotificationsBridge } from '@/components/notifications/NotificationsBridge';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column' }}>
      <NotificationsBridge />
      <DashboardNav />
      {/* Container flex com padding inferior no mobile para a barra de tabs não esconder o texto */}
      <div className="dashboard-layout-content" style={{ flex: 1, minHeight: 0 }}>
        {children}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .dashboard-layout-content {
            padding-bottom: 80px;
          }
        }
      `}</style>
    </div>
  );
}
