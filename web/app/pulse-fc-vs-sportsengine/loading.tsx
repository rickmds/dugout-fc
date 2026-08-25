import { SkeletonNav, SkeletonVsHero } from '@/components/MarketingSkeleton';

// Streamed while `PulseVsSportsEnginePage` awaits its clubs-count query (reviews/06-web.md #1).
export default function Loading() {
  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#f0f0f0' }}>
      <div style={{ borderBottom: '1px solid #111' }}><SkeletonNav /></div>
      <SkeletonVsHero />
    </div>
  );
}
