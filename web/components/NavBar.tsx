'use client';

import Link from 'next/link';

const NAV_LINKS = [
  { href: '/for-clubs',  label: 'For club directors' },
  { href: '/pricing',    label: 'Pricing' },
  { href: '/compare',    label: 'Compare' },
  { href: '/dashboard',  label: 'Log in' },
];

export default function NavBar() {
  return (
    <nav style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', maxWidth: '1280px', margin: '0 auto',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <img src="/logo.png" alt="Pulse FC" style={{ height: '64px', width: 'auto' }} />
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
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
          <Link
            href="/onboarding"
            style={{
              fontSize: '13px', fontWeight: '700', color: '#000',
              background: '#22c55e', padding: '8px 16px', borderRadius: '9px',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            Add your club
          </Link>
        </div>
      </div>
    </nav>
  );
}
