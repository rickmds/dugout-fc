import Link from 'next/link';
import { theme } from '@/lib/theme';

const LINKS = [
  { href: '/clubs', label: 'Clubs' },
  { href: '/coaches', label: 'Coaches' },
  { href: '/players', label: 'Players' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/compare', label: 'Compare' },
];

export default function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${theme.border}`, background: theme.surface }}>
      <div
        className="px-6 sm:px-10 py-10 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6"
      >
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
          <img src="/logo.png" alt="Pulse FC" width={32} height={32} style={{ height: 32, width: 'auto' }} />
          <span style={{ fontFamily: theme.fontDisplay, fontWeight: 700, fontSize: 16, color: theme.text }}>
            Pulse FC
          </span>
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{ fontSize: 13, fontWeight: 600, color: theme.textSecondary, textDecoration: 'none' }}
              className="hover:!text-[var(--green)]"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/login"
            style={{ fontSize: 13, fontWeight: 600, color: theme.textSecondary, textDecoration: 'none' }}
            className="hover:!text-[var(--green)]"
          >
            Log in
          </Link>
          <Link
            href="/privacy"
            style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textDecoration: 'none' }}
            className="hover:!text-[var(--green)]"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, textDecoration: 'none' }}
            className="hover:!text-[var(--green)]"
          >
            Terms
          </Link>
        </div>

        <a href="https://apps.apple.com/us/app/pulse-fc/id6797330659" target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
          <img src="/app-store-badge.svg" alt="Download on the App Store" width={108} height={36} style={{ height: 36, width: 'auto' }} />
        </a>
      </div>
    </footer>
  );
}
