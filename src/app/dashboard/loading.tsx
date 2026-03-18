import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Header skeleton */}
      <header
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 15, 15, 0.8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skeleton width={42} height={42} borderRadius={12} />
          <Skeleton width={120} height={22} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skeleton width={80} height={32} borderRadius={8} />
          <Skeleton width={36} height={36} borderRadius={10} />
        </div>
      </header>

      {/* Main content */}
      <main style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Page header skeleton */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Skeleton width={200} height={32} />
            <Skeleton width={60} height={24} borderRadius={20} />
          </div>
          <Skeleton width={180} height={14} />
        </div>

        {/* Cards grid skeleton */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
