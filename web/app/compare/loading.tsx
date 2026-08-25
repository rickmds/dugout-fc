import { SkeletonBlock, SkeletonNav } from '@/components/MarketingSkeleton';

// Streamed while `ComparePage` awaits its clubs-count query (reviews/06-web.md #1).
export default function Loading() {
  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#f0f0f0' }}>
      <div style={{ borderBottom: '1px solid #111' }}><SkeletonNav /></div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '72px 24px 56px', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <SkeletonBlock width={220} height={26} radius={999} style={{ marginBottom: 28 }} />
          <SkeletonBlock width="85%" height={36} style={{ marginBottom: 10, maxWidth: 620 }} />
          <SkeletonBlock width="55%" height={36} style={{ marginBottom: 20, maxWidth: 380 }} />
          <SkeletonBlock width="100%" height={16} style={{ marginBottom: 8, maxWidth: 580 }} />
          <SkeletonBlock width="80%" height={16} style={{ marginBottom: 48, maxWidth: 460 }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, maxWidth: 820, width: '100%' }}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} width="100%" height={110} radius={16} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
