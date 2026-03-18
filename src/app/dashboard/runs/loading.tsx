import { Skeleton } from '@/components/ui/Skeleton';

export default function RunsLoading() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base, #000)' }}>
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
          <Skeleton width={42} height={42} borderRadius={12} />
          <div>
            <Skeleton width={160} height={22} style={{ marginBottom: 6 }} />
            <Skeleton width={100} height={12} />
          </div>
        </div>
        <Skeleton width={140} height={36} borderRadius={10} />
      </header>

      {/* Main content */}
      <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        {/* Step 1: Source */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Skeleton width={32} height={32} borderRadius="50%" />
            <Skeleton width={200} height={20} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                height={64}
                borderRadius={14}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Step 2: Objective */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Skeleton width={32} height={32} borderRadius="50%" />
            <Skeleton width={240} height={20} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                height={80}
                borderRadius={14}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Step 3: Quantity */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Skeleton width={32} height={32} borderRadius="50%" />
            <Skeleton width={180} height={20} />
          </div>
          <Skeleton height={48} borderRadius={14} />
        </div>

        {/* Generate button */}
        <Skeleton height={56} borderRadius={14} />
      </main>
    </div>
  );
}
