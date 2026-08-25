// Shared building blocks for the marketing-page `loading.tsx` skeletons.
// Kept purely presentational (no data, no client hooks) so it can render
// instantly as the Suspense fallback for the static-hero pages that `await`
// a DB query before their first paint (see reviews/06-web.md #1).

export function SkeletonBlock({
  width,
  height,
  radius = 8,
  style,
}: {
  width: string | number;
  height: string | number;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="animate-pulse"
      style={{
        width,
        height,
        borderRadius: radius,
        background: '#141414',
        ...style,
      }}
    />
  );
}

// Shared hero shape for the three `pulse-fc-vs-*` pages: badge, two-line
// title, paragraph, then a two-card "quick verdict" row split by "vs".
export function SkeletonVsHero() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '72px 24px 48px', textAlign: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <SkeletonBlock width={180} height={26} radius={999} style={{ marginBottom: 28 }} />
        <SkeletonBlock width="70%" height={44} style={{ marginBottom: 20, maxWidth: 460 }} />
        <SkeletonBlock width="100%" height={16} style={{ marginBottom: 8, maxWidth: 520 }} />
        <SkeletonBlock width="75%" height={16} style={{ marginBottom: 48, maxWidth: 400 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', maxWidth: 640, width: '100%' }}>
          <SkeletonBlock width="100%" height={120} radius={16} />
          <SkeletonBlock width={22} height={13} radius={4} />
          <SkeletonBlock width="100%" height={120} radius={16} />
        </div>
      </div>
    </div>
  );
}

// Static approximation of NavBar's layout (logo left, links + CTA right),
// so the skeleton doesn't visibly "jump" once the real NavBar hydrates in.
export function SkeletonNav() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        maxWidth: '1280px',
        margin: '0 auto',
      }}
    >
      <SkeletonBlock width={140} height={64} radius={6} />
      <div className="hidden md:flex" style={{ alignItems: 'center', gap: '24px' }}>
        <SkeletonBlock width={50} height={13} radius={4} />
        <SkeletonBlock width={60} height={13} radius={4} />
        <SkeletonBlock width={50} height={13} radius={4} />
        <SkeletonBlock width={55} height={13} radius={4} />
        <SkeletonBlock width={65} height={13} radius={4} />
        <SkeletonBlock width={80} height={31} radius={9} />
      </div>
    </div>
  );
}
