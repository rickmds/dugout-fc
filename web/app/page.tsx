import Link from 'next/link';
import Ticker from '@/components/Ticker';

import Reveal from '@/components/Reveal';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import FeatureTabs from '@/components/FeatureTabs';
import AndroidTesterCTA from '@/components/AndroidTesterCTA';
import { theme } from '@/lib/theme';

const paths = [
  {
    href: '/clubs',
    label: 'Club Directors & Boards',
    headline: 'Every family that leaves had a reason.',
    body: 'See the math on what disorganization actually costs your club.',
  },
  {
    href: '/coaches',
    label: 'Coaches & Team Managers',
    headline: "Get your Saturday back.",
    body: 'AI schedule import, one-tap RSVP, and a lineup builder that takes seconds.',
  },
  {
    href: '/players',
    label: 'Parents & Players',
    headline: 'Stop scrolling a group text.',
    body: 'One app for schedule, RSVP, and team chat — always current.',
  },
];

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.text }}>

      {/* Nav */}
      <NavBar />

      {/* Hero */}
      <section className="px-6 sm:px-10 pt-14 pb-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_500px] gap-10 items-center">

          {/* Left */}
          <div>
            <div
              className="inline-flex items-center gap-2.5 text-[12px] font-semibold px-4 py-2 rounded-full mb-10"
              style={{ color: theme.greenDark, border: `1px solid ${theme.greenTintBorder}`, background: theme.greenTint }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" style={{ background: theme.green }} />
              For clubs, coaches &amp; parents — one app
            </div>

            <h1
              className="font-extrabold leading-[0.95] tracking-[-0.01em] mb-9"
              style={{ fontSize: 'clamp(44px, 7vw, 88px)', color: theme.text, fontFamily: theme.fontDisplay }}
            >
              Stop running<br />
              your club from<br />
              <span style={{ color: theme.green }}>a group chat.</span>
            </h1>

            <p className="text-[18px] leading-[1.75] font-medium mb-4 max-w-lg" style={{ color: theme.textSecondary }}>
              Pulse FC replaces your WhatsApp groups, your schedule PDFs, your RSVP spreadsheet, and your tryout chaos — with one platform every parent actually opens. Set up in 20 minutes.
            </p>
            <p className="text-[15px] leading-relaxed mb-10 max-w-md" style={{ color: theme.textMuted }}>
              Season imported in 40 seconds. RSVPs auto-lock before game time. Field change? Every parent notified before you put your phone down.
            </p>

            <div className="flex flex-wrap gap-3 mb-8">
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 font-bold text-[15px] px-7 py-3.5 transition-colors"
                style={{ background: theme.green, color: '#fff', borderRadius: theme.radiusBtn, boxShadow: theme.shadowBtn }}
              >
                Set up your club tonight →
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 text-[15px] font-medium px-7 py-3.5 transition-all"
                style={{ color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: theme.radiusBtn }}
              >
                See how it works
              </a>
            </div>

            <p className="text-[12px] mb-8" style={{ color: theme.textMuted }}>Free for 1 team · No credit card · 20-minute setup</p>

            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-[12px] font-medium" style={{ color: theme.textMuted }}>Now live on the App Store</p>
              <a href="https://apps.apple.com/us/app/pulse-fc/id6797330659" target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
                <img src="/app-store-badge.svg" alt="Download on the App Store" width={108} height={36} style={{ height: '36px', width: 'auto' }} />
              </a>
              <AndroidTesterCTA size="hero" />
            </div>
          </div>

          {/* Right — Stacked hero screenshots */}
          <div className="hidden lg:flex justify-center items-start">
            <div style={{ position: 'relative', width: 488, height: 560, overflow: 'visible' }}>

              {/* Ambient glow */}
              <div style={{
                position: 'absolute', left: '50%', top: '40%',
                transform: 'translate(-50%, -50%)',
                width: 340, height: 340, borderRadius: '50%',
                background: 'radial-gradient(ellipse, rgba(63,168,107,0.16) 0%, transparent 70%)',
                pointerEvents: 'none', zIndex: 0,
              }} />

              {/* Back left — Schedule, starts at top:56 */}
              {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
              <img src="/screenshots/ScheduleTB.png" alt="Schedule view"
                style={{
                  position: 'absolute', left: 0, top: 56, width: 210, display: 'block',
                  transform: 'perspective(700px) rotateY(14deg) rotate(-6deg)',
                  filter: 'drop-shadow(0 10px 24px rgba(43,36,32,0.18))',
                  zIndex: 1, opacity: 0.85,
                }}
              />

              {/* Chip 1 — above left phone */}
              <div style={{
                position: 'absolute', top: 18, left: 4, zIndex: 10,
                background: theme.surface, border: `1px solid ${theme.border}`,
                borderRadius: 99, padding: '5px 12px',
                display: 'flex', alignItems: 'center', gap: 7,
                whiteSpace: 'nowrap', boxShadow: theme.shadowCard,
              }}>
                <span style={{ fontSize: 10 }}>📅</span>
                <span style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 600 }}>AI imported 23 games</span>
              </div>

              {/* Front center — Home */}
              {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
              <img src="/screenshots/HomeTB.png" alt="Pulse FC — your club at a glance"
                style={{
                  position: 'absolute', left: '50%', top: 0,
                  transform: 'translateX(-50%)',
                  width: 285, display: 'block',
                  filter: 'drop-shadow(0 24px 48px rgba(43,36,32,0.22))',
                  zIndex: 3,
                }}
              />

              {/* Back right — Roster, starts at top:72 */}
              {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
              <img src="/screenshots/rosterTB.png" alt="Team roster"
                style={{
                  position: 'absolute', right: 14, top: 72, width: 210, display: 'block',
                  transform: 'perspective(700px) rotateY(-14deg) rotate(6deg)',
                  filter: 'drop-shadow(0 10px 24px rgba(43,36,32,0.18))',
                  zIndex: 2, opacity: 0.85,
                }}
              />

              {/* Chip 2 — above right phone */}
              <div style={{
                position: 'absolute', top: 34, right: 14, zIndex: 10,
                background: theme.surface, border: `1px solid ${theme.border}`,
                borderRadius: 99, padding: '5px 12px',
                display: 'flex', alignItems: 'center', gap: 7,
                whiteSpace: 'nowrap', boxShadow: theme.shadowCard,
              }}>
                <span style={{ fontSize: 10 }}>👥</span>
                <span style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 600 }}>Every player, one tap</span>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div className="mt-4">
        <Ticker />
      </div>

      <FeatureTabs />

      {/* Pick your path */}
      <section style={{ borderTop: `1px solid ${theme.border}`, background: theme.surface }} className="px-6 sm:px-10 py-20">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-3 text-center" style={{ color: theme.textMuted }}>Where do you fit in?</p>
            <h2
              className="font-extrabold leading-tight mb-12 tracking-tight text-center"
              style={{ fontSize: 'clamp(26px, 3.5vw, 44px)', color: theme.text, fontFamily: theme.fontDisplay }}
            >
              Built for whoever you are at the club.
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-5">
            {paths.map(({ href, label, headline, body }, i) => (
              <Reveal key={href} delay={i * 100}>
                <Link
                  href={href}
                  className="group h-full flex flex-col p-7 transition-all"
                  style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: theme.radiusCard }}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-4" style={{ color: theme.green }}>{label}</p>
                  <p className="font-extrabold text-[19px] leading-snug mb-2 flex-1" style={{ color: theme.text }}>{headline}</p>
                  <p className="text-[13.5px] leading-[1.6] mb-5" style={{ color: theme.textSecondary }}>{body}</p>
                  <span className="text-[13px] font-bold group-hover:underline" style={{ color: theme.green }}>Learn more →</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ borderTop: `1px solid ${theme.border}` }} className="px-6 sm:px-10 py-28 text-center">
        <Reveal>
          <h2
            className="font-extrabold leading-[0.98] tracking-tight mb-6 max-w-3xl mx-auto"
            style={{ fontSize: 'clamp(32px, 5vw, 60px)', color: theme.text, fontFamily: theme.fontDisplay }}
          >
            Every week you wait is<br />
            <span style={{ color: theme.green }}>another week of chaos.</span>
          </h2>
          <p className="text-[14px] mb-10" style={{ color: theme.textMuted }}>No credit card to start · Free while we onboard founding clubs · Cancel anytime</p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 font-bold text-[16px] px-10 py-4 transition-colors"
            style={{ background: theme.green, color: '#fff', borderRadius: 18, boxShadow: theme.shadowBtn }}
          >
            Set up your club tonight →
          </Link>
          <p className="text-[12px] mt-6 font-semibold" style={{ color: theme.greenDark }}>Founding club pricing — 40% off any paid plan, forever, while we onboard our first clubs directly</p>
        </Reveal>
      </section>

      <Footer />

    </div>
  );
}
