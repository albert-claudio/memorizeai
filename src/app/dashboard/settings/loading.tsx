import { Skeleton } from '@/components/ui/Skeleton';

export default function SettingsLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'rgba(10,10,10,0.95)',
      }}>
        <Skeleton width={20} height={20} borderRadius={4} />
        <Skeleton width={150} height={22} />
      </header>

      <div style={{ display: 'flex', maxWidth: 960, margin: '0 auto' }}>
        {/* Sidebar */}
        <nav style={{ width: 220, padding: '24px 12px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} height={40} borderRadius={10} style={{ marginBottom: 4 }} />
          ))}
        </nav>

        {/* Content */}
        <main style={{ flex: 1, padding: '32px 32px 64px' }}>
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, padding: '20px 24px',
          }}>
            <Skeleton width={200} height={20} style={{ marginBottom: 20 }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div>
                  <Skeleton width={180} height={14} style={{ marginBottom: 6 }} />
                  <Skeleton width={260} height={12} />
                </div>
                <Skeleton width={52} height={30} borderRadius={15} />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
