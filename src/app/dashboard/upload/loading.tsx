import { Skeleton } from '@/components/ui/Skeleton';

export default function UploadLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f4f4f5' }}>
      {/* Header skeleton */}
      <header
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'rgba(15, 15, 15, 0.8)',
        }}
      >
        <Skeleton width={42} height={42} borderRadius={12} />
        <div>
          <Skeleton width={200} height={20} style={{ marginBottom: 6 }} />
          <Skeleton width={280} height={12} />
        </div>
      </header>

      {/* Main content */}
      <main style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
        {/* Drop Zone skeleton */}
        <div
          style={{
            border: '2px dashed rgba(255,255,255,0.08)',
            borderRadius: 20,
            padding: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Skeleton width={80} height={80} borderRadius={20} />
          <Skeleton width={200} height={16} />
          <Skeleton width={160} height={14} />
          <Skeleton width={220} height={12} />
        </div>

        {/* Description text */}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Skeleton width={320} height={12} style={{ margin: '0 auto' }} />
        </div>
      </main>
    </div>
  );
}
