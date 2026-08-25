import { SkeletonBlock, SkeletonNav } from '@/components/MarketingSkeleton';

// Streamed while `ClubsPage` awaits its clubs-count query (reviews/06-web.md #1).
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]">
      <SkeletonNav />

      <section className="px-6 sm:px-10 pt-16 pb-14 max-w-4xl mx-auto text-center">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <SkeletonBlock width={260} height={30} radius={999} style={{ marginBottom: 32 }} />

          <SkeletonBlock width="80%" height={40} style={{ marginBottom: 12, maxWidth: 640 }} />
          <SkeletonBlock width="60%" height={40} style={{ marginBottom: 12, maxWidth: 480 }} />
          <SkeletonBlock width="45%" height={40} style={{ marginBottom: 24, maxWidth: 360 }} />

          <SkeletonBlock width="100%" height={16} style={{ marginBottom: 8, maxWidth: 560 }} />
          <SkeletonBlock width="80%" height={16} style={{ marginBottom: 32, maxWidth: 440 }} />

          <div className="flex flex-wrap gap-3 justify-center mb-10">
            <SkeletonBlock width={220} height={52} radius={12} />
            <SkeletonBlock width={150} height={52} radius={12} />
          </div>

          <SkeletonBlock width="100%" height={100} radius={16} style={{ maxWidth: 576 }} />
        </div>
      </section>
    </div>
  );
}
