import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import Ticker from '@/components/Ticker';

import Reveal from '@/components/Reveal';
import NavBar from '@/components/NavBar';
import FeatureTabs from '@/components/FeatureTabs';

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

export const revalidate = 3600;

export default async function Home() {
  const { count } = await supabaseAdmin()
    .from('clubs')
    .select('*', { count: 'exact', head: true });
  const displayCount = Math.min((count ?? 0) + 31, 49);
  const remaining = 50 - displayCount;

  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]">

      {/* Nav */}
      <NavBar />

      {/* Hero */}
      <section className="px-6 sm:px-10 pt-14 pb-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_500px] gap-10 items-center">

          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2.5 text-[#22c55e] text-[12px] font-semibold border border-[#22c55e25] bg-[#22c55e0a] px-4 py-2 rounded-full mb-10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse flex-shrink-0" />
              For clubs, coaches &amp; parents — one app
            </div>

            <h1 className="font-extrabold text-white leading-[0.92] tracking-[-0.02em] mb-9"
              style={{ fontSize: 'clamp(46px, 7.5vw, 96px)' }}>
              Stop running<br />
              your club from<br />
              <span className="text-[#22c55e]">a group chat.</span>
            </h1>

            <p className="text-[#aaa] text-[18px] leading-[1.75] font-medium mb-4 max-w-lg">
              Pulse FC replaces your WhatsApp groups, your schedule PDFs, your RSVP spreadsheet, and your tryout chaos — with one platform every parent actually opens. Set up in 20 minutes.
            </p>
            <p className="text-[#888] text-[15px] leading-relaxed mb-10 max-w-md">
              Season imported in 40 seconds. RSVPs auto-lock before game time. Field change? Every parent notified before you put your phone down.
            </p>

            <div className="flex flex-wrap gap-3 mb-8">
              <Link href="/onboarding"
                className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[15px] px-7 py-3.5 rounded-xl hover:bg-[#1db954] transition-colors">
                Set up your club tonight →
              </Link>
              <a href="#how"
                className="inline-flex items-center gap-2 text-[#888] text-[15px] font-medium px-7 py-3.5 rounded-xl border border-[#222] hover:border-[#2e2e2e] hover:text-[#bbb] transition-all">
                See how it works
              </a>
            </div>

            <p className="text-[#888] text-[12px] mb-8">Free for 1 team · No credit card · 20-minute setup · 30-day money-back guarantee</p>

            <div className="flex items-center gap-3">
              <p className="text-[#888] text-[12px] font-medium">Now live on the App Store</p>
              <a href="https://apps.apple.com/us/app/pulse-fc/id6797330659" target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
                <img src="/app-store-badge.svg" alt="Download on the App Store" width={108} height={36} style={{ height: '36px', width: 'auto' }} />
              </a>
            </div>
          </div>

          {/* Right — Stacked hero screenshots */}
          <div className="hidden lg:flex justify-center items-start">
            <div style={{ position: 'relative', width: 488, height: 560, overflow: 'visible' }}>

              {/* Ambient glow */}
              <div style={{
                position: 'absolute', left: '50%', top: '40%',
                transform: 'translate(-50%, -50%)',
                width: 300, height: 300, borderRadius: '50%',
                background: 'radial-gradient(ellipse, rgba(34,197,94,0.1) 0%, transparent 70%)',
                pointerEvents: 'none', zIndex: 0,
              }} />

              {/* Back left — Schedule, starts at top:56 */}
              {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
              <img src="/screenshots/ScheduleTB.png" alt="Schedule view"
                style={{
                  position: 'absolute', left: 0, top: 56, width: 210, display: 'block',
                  transform: 'perspective(700px) rotateY(14deg) rotate(-6deg)',
                  filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.55))',
                  zIndex: 1, opacity: 0.72,
                }}
              />

              {/* Chip 1 — 8px above left phone (phone top=56, chip bottom=48, chip top=18) */}
              <div style={{
                position: 'absolute', top: 18, left: 4, zIndex: 10,
                background: '#111', border: '1px solid #2a2a2a',
                borderRadius: 99, padding: '5px 12px',
                display: 'flex', alignItems: 'center', gap: 7,
                whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
              }}>
                <span style={{ fontSize: 10 }}>📅</span>
                <span style={{ color: '#ccc', fontSize: 11, fontWeight: 600 }}>AI imported 23 games</span>
              </div>

              {/* Front center — Home */}
              {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
              <img src="/screenshots/HomeTB.png" alt="Pulse FC — your club at a glance"
                style={{
                  position: 'absolute', left: '50%', top: 0,
                  transform: 'translateX(-50%)',
                  width: 285, display: 'block',
                  filter: 'drop-shadow(0 32px 64px rgba(0,0,0,0.9))',
                  zIndex: 3,
                }}
              />

              {/* Back right — Roster, starts at top:72 */}
              {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
              <img src="/screenshots/rosterTB.png" alt="Team roster"
                style={{
                  position: 'absolute', right: 14, top: 72, width: 210, display: 'block',
                  transform: 'perspective(700px) rotateY(-14deg) rotate(6deg)',
                  filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.55))',
                  zIndex: 2, opacity: 0.72,
                }}
              />

              {/* Chip 2 — 8px above right phone (phone top=72, chip bottom=64, chip top=34) */}
              <div style={{
                position: 'absolute', top: 34, right: 14, zIndex: 10,
                background: '#111', border: '1px solid #2a2a2a',
                borderRadius: 99, padding: '5px 12px',
                display: 'flex', alignItems: 'center', gap: 7,
                whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
              }}>
                <span style={{ fontSize: 10 }}>👥</span>
                <span style={{ color: '#ccc', fontSize: 11, fontWeight: 600 }}>Every player, one tap</span>
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
      <section style={{ borderTop: '1px solid #111', background: '#060606' }} className="px-6 sm:px-10 py-20">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <p className="text-[#888] text-[11px] font-bold uppercase tracking-[0.18em] mb-3 text-center">Where do you fit in?</p>
            <h2 className="font-extrabold text-white leading-tight mb-12 tracking-tight text-center"
              style={{ fontSize: 'clamp(26px, 3.5vw, 44px)' }}>
              Built for whoever you are at the club.
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-5">
            {paths.map(({ href, label, headline, body }, i) => (
              <Reveal key={href} delay={i * 100}>
                <Link href={href} className="group h-full flex flex-col p-7 rounded-2xl transition-colors"
                  style={{ background: '#111', border: '1px solid #232323' }}>
                  <p className="text-[#22c55e] text-[11px] font-bold uppercase tracking-[0.12em] mb-4">{label}</p>
                  <p className="text-white font-extrabold text-[19px] leading-snug mb-2 flex-1">{headline}</p>
                  <p className="text-[#999] text-[13.5px] leading-[1.6] mb-5">{body}</p>
                  <span className="text-[#22c55e] text-[13px] font-bold group-hover:underline">Learn more →</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-28 text-center">
        <Reveal>
          <h2 className="font-extrabold text-white leading-[0.95] tracking-tight mb-6 max-w-3xl mx-auto"
            style={{ fontSize: 'clamp(34px, 5vw, 64px)' }}>
            Every week you wait is<br />
            <span style={{ color: '#22c55e' }}>another week of chaos.</span>
          </h2>
          <p className="text-[#888] text-[14px] mb-10">30-day money-back guarantee · No credit card to start · Cancel anytime</p>
          <Link href="/onboarding"
            className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[16px] px-10 py-4 rounded-2xl hover:bg-[#1db954] transition-colors">
            Set up your club tonight →
          </Link>
          <p className="text-[#22c55e] text-[12px] mt-6 font-semibold opacity-80">Founding club offer: {remaining} spots remaining · 40% off any paid plan, forever</p>
        </Reveal>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #0f0f0f' }} className="px-6 sm:px-10 py-8 flex items-center justify-between max-w-7xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
        <img src="/logo.png" alt="Pulse FC" width={36} height={36} style={{ height: '36px', width: 'auto' }} />

        <div className="flex items-center gap-6">
          <Link href="/clubs" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Clubs</Link>
          <Link href="/coaches" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Coaches</Link>
          <Link href="/players" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Players</Link>
          <Link href="/pricing" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Pricing</Link>
          <Link href="/compare" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Compare</Link>
          <Link href="/login" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Log in</Link>
          <a href="https://apps.apple.com/us/app/pulse-fc/id6797330659" target="_blank" rel="noopener noreferrer" className="hidden sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
            <img src="/app-store-badge.svg" alt="Download on the App Store" width={84} height={28} style={{ height: '28px', width: 'auto' }} />
          </a>
        </div>
      </footer>

    </div>
  );
}
