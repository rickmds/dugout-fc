import { SkeletonBlock, SkeletonNav } from '@/components/MarketingSkeleton';

// Streamed while `Home` awaits its clubs-count query (see reviews/06-web.md #1).
// Mirrors the real page's above-the-fold shape so there's no blank tab on a
// cold ISR cache (e.g. right after a deploy).
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]">
      <SkeletonNav />

      <section className="px-6 sm:px-10 pt-14 pb-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_500px] gap-10 items-center">
          <div>
            <SkeletonBlock width={260} height={30} radius={999} style={{ marginBottom: 40 }} />

            <div style={{ marginBottom: 36 }}>
              <SkeletonBlock width="90%" height={64} style={{ marginBottom: 12 }} />
              <SkeletonBlock width="70%" height={64} style={{ marginBottom: 12 }} />
              <SkeletonBlock width="55%" height={64} />
            </div>

            <SkeletonBlock width="100%" height={16} style={{ marginBottom: 10, maxWidth: 480 }} />
            <SkeletonBlock width="85%" height={16} style={{ marginBottom: 40, maxWidth: 480 }} />

            <div className="flex flex-wrap gap-3 mb-8">
              <SkeletonBlock width={220} height={52} radius={12} />
              <SkeletonBlock width={160} height={52} radius={12} />
            </div>
          </div>

          <div className="hidden lg:flex justify-center items-start">
            <SkeletonBlock width={285} height={480} radius={24} />
          </div>
        </div>
      </section>
    </div>
  );
}
