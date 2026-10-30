import Link from 'next/link';
import { theme } from '@/lib/theme';

const NAV_LINKS = [
  { href: '/clubs', label: 'Clubs' },
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
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
          <img src="/logo.png" alt="Pulse FC" width={44} height={44} style={{ height: '44px', width: 'auto' }} />
          <span style={{ fontFamily: theme.fontDisplay, fontWeight: 700, fontSize: 19, color: theme.text }}>
            Pulse FC
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div className="hidden md:flex" style={{ alignItems: 'center', gap: '24px' }}>
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                style={{
                  fontSize: '13px', fontWeight: '600', color: theme.textSecondary,
                  textDecoration: 'none', transition: 'color 0.15s',
                }}
                className="hover:!text-[#2B2420]"
              >
                {label}
              </Link>
            ))}
          </div>
          <Link
            href="/login"
            className="hidden md:inline hover:!text-[#2B2420]"
            style={{
              fontSize: '13px', fontWeight: '600', color: theme.textSecondary,
              textDecoration: 'none', transition: 'color 0.15s', whiteSpace: 'nowrap',
            }}
          >
            Log in
          </Link>
          <Link
            href="/onboarding"
            style={{
              fontSize: '13px', fontWeight: '700', color: '#fff',
              background: theme.green, padding: '9px 18px', borderRadius: theme.radiusBtn,
              textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: theme.shadowBtn,
            }}
          >
            Sign up
          </Link>
        </div>
      </div>
    </nav>
  );
}
