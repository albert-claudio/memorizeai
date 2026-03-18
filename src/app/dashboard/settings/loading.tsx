import { Skeleton } from '@/components/ui/Skeleton';

export default function SettingsLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Header skeleton */}
      <header
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 15, 15, 0.8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Skeleton width={20} height={20} borderRadius={4} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skeleton width={42} height={42} borderRadius={12} />
            <Skeleton width={150} height={22} />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main style={{ padding: '32px 24px', maxWidth: 700, margin: '0 auto' }}>
        {/* Title */}
        <Skeleton width={280} height={28} style={{ marginBottom: 8 }} />
        <Skeleton width={380} height={14} style={{ marginBottom: 32 }} />

        {/* Retention Slider section */}
        <section
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16,
            padding: 24,
            marginBottom: 32,
          }}
        >
          <Skeleton width={200} height={18} style={{ marginBottom: 16 }} />
          <Skeleton height={40} borderRadius={10} style={{ marginBottom: 12 }} />
          <Skeleton width={120} height={12} />
        </section>

        {/* Info section */}
        <section
          style={{
            background: 'rgba(99, 102, 241, 0.05)',
            border: '1px solid rgba(99, 102, 241, 0.12)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 32,
          }}
        >
          <Skeleton width={160} height={16} style={{ marginBottom: 10 }} />
          <Skeleton height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="80%" height={14} />
        </section>

        {/* Calibration section */}
        <section
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 32,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Skeleton width={40} height={40} borderRadius={10} />
              <div>
                <Skeleton width={180} height={16} style={{ marginBottom: 6 }} />
                <Skeleton width={220} height={12} />
              </div>
            </div>
            <Skeleton width={52} height={30} borderRadius={15} />
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16, display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <Skeleton width={160} height={12} style={{ marginBottom: 6 }} />
              <Skeleton width={40} height={20} />
            </div>
            <div style={{ flex: 1 }}>
              <Skeleton width={120} height={12} style={{ marginBottom: 6 }} />
              <Skeleton width={80} height={14} />
            </div>
          </div>
        </section>

        {/* Subscription section */}
        <section
          style={{
            background: 'rgba(239, 68, 68, 0.04)',
            border: '1px solid rgba(239, 68, 68, 0.12)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 32,
          }}
        >
          <Skeleton width={240} height={18} style={{ marginBottom: 12 }} />
          <Skeleton height={14} style={{ marginBottom: 6 }} />
          <Skeleton width="70%" height={14} style={{ marginBottom: 16 }} />
          <Skeleton height={46} borderRadius={12} />
        </section>

        {/* Back link */}
        <div style={{ textAlign: 'center' }}>
          <Skeleton width={160} height={14} style={{ margin: '0 auto' }} />
        </div>
      </main>
    </div>
  );
}
