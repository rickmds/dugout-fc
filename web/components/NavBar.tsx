import Link from 'next/link';

const NAV_LINKS = [
  { href: '/clubs',   label: 'Clubs' },
  { href: '/coaches', label: 'Coaches' },
  { href: '/players', label: 'Players' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/compare', label: 'Compare' },
];

export default function NavBar() {
  return (
    <nav style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', maxWidth: '1280px', margin: '0 auto',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
          <img src="/logo.png" alt="Pulse FC" width={64} height={64} style={{ height: '64px', width: 'auto' }} />
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div className="hidden md:flex" style={{ alignItems: 'center', gap: '24px' }}>
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                style={{
                  fontSize: '13px', fontWeight: '600', color: '#888',
                  textDecoration: 'none', transition: 'color 0.15s',
                }}
                className="hover:!text-white"
              >
                {label}
              </Link>
            ))}
          </div>
          <Link
            href="/login"
            className="hidden md:inline hover:!text-white"
            style={{
              fontSize: '13px', fontWeight: '600', color: '#888',
              textDecoration: 'none', transition: 'color 0.15s', whiteSpace: 'nowrap',
            }}
          >
            Log in
          </Link>
          <Link
            href="/onboarding"
            style={{
              fontSize: '13px', fontWeight: '700', color: '#000',
              background: '#22c55e', padding: '8px 16px', borderRadius: '9px',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            Sign up
          </Link>
        </div>
      </div>
    </nav>
  );
}
