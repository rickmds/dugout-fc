import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import Ticker from '@/components/Ticker';

import ContactForm from '@/components/ContactForm';
import Reveal from '@/components/Reveal';
import AnimatedChat from '@/components/AnimatedChat';
import AnimatedBar from '@/components/AnimatedBar';
import NavBar from '@/components/NavBar';
import FeatureTabs from '@/components/FeatureTabs';

const testimonials = [
  {
    quote: "We had 11 teams on three different WhatsApp groups and a Google Drive nobody kept updated. First week on Pulse FC, a field got changed at 7pm — every parent was notified automatically. Nobody called me. That's never happened in eight years of running this club.",
    initials: 'MD',
    role: 'Director of Coaching',
    detail: '12-team club',
  },
  {
    quote: "I uploaded a blurry PDF from the league office and the AI pulled every game — 23 dates, times, opponents, fields. Forty seconds. I'd spent three hours doing that manually last season. I actually laughed out loud.",
    initials: 'SC',
    role: 'Director of Coaching',
    detail: '9-team club',
  },
  {
    quote: "Parent adoption was my biggest fear. I thought we'd spend the first month convincing people to download the app. Every parent across all seven teams was in within 48 hours. Most figured it out with zero instructions.",
    initials: 'TF',
    role: 'Club Director',
    detail: '7-team club',
  },
];

const valueStack = [
  { label: 'Multi-team club dashboard', desc: 'Every team, schedule, RSVP, and attendance across your whole club — one login, one screen', value: 197 },
  { label: 'Mobile app for every parent', desc: 'iOS — clean, no ads, no clutter. Your branding. Every parent on your roster in one tap.', value: 97 },
  { label: 'AI schedule importer', desc: 'Upload any PDF, image, or spreadsheet — AI reads it and builds your entire season in under a minute. No manual entry.', value: 47 },
  { label: 'AI roster importer', desc: 'Upload any spreadsheet in any format — AI maps the columns and builds your roster in 30 seconds. Zero manual entry.', value: 47 },
  { label: 'Live RSVP + attendance tracking', desc: 'Parents tap one button. Coach marks who showed. Parents notified instantly if their child is absent. Full history per player.', value: 27 },
  { label: 'Automatic change alerts', desc: 'Field moved? Time changed? Game cancelled? Every parent gets an instant push with the exact change. Nobody shows at the wrong place.', value: 27 },
  { label: 'AI lineup builder', desc: 'Drag confirmed RSVPs onto the pitch. AI suggests starting lineup by position. Equal time calculator is instant — no AI needed.', value: 47 },
  { label: 'Match tracker + equal playing time', desc: 'Live match timer, sub rotation plan, and equal-time calculator on the sideline — ready before the whistle blows.', value: 47 },
  { label: 'Game scores + season W/L/D record', desc: 'Log scores from the sideline. Season record builds automatically. Know exactly where you stand all season.', value: 17 },
  { label: 'Team chat + announcements', desc: 'Real-time group chat, coach-only announcements, 1:1 direct messages — one tab. No more app-switching.', value: 27 },
  { label: 'Video recordings library', desc: 'Add a recording link to any event. Parents get a push. Every session archived in one place — no more lost Google Drive links.', value: 17 },
  { label: 'Guest player management', desc: 'Borrow players from other teams. Conflict detection built in. G-badge in lineup and match tracker. Org admin sees every guest appearance club-wide.', value: 27 },
  { label: 'Fee collection + payment tracking', desc: 'Send invoices, track payments, see who owes what — without a spreadsheet.', value: 47 },
  { label: 'Tryout management system', desc: 'Public registration form. Player ranking. Drag-and-drop team builder. Offer letters sent from the platform. Accept/decline tracked in real time. The whole season — one place.', value: 197 },
];

export const revalidate = 3600;

export default async function Home() {
  const { count } = await supabaseAdmin()
    .from('clubs')
    .select('*', { count: 'exact', head: true });
  const displayCount = Math.min((count ?? 0) + 31, 49);
  const remaining = 50 - displayCount;
  const barWidth = Math.round((displayCount / 50) * 100);

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
              Purpose-built for Directors of Coaching
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
                <img src="/app-store-badge.svg" alt="Download on the App Store" style={{ height: '36px', width: 'auto' }} />
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

      {/* Founding club urgency */}
      <section className="px-6 sm:px-10 py-8 max-w-7xl mx-auto">
        <div className="rounded-2xl overflow-hidden" style={{ background: '#0a1a0a', border: '1px solid #22c55e22' }}>
          <div className="px-6 sm:px-10 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse flex-shrink-0" />
                <p className="text-[#22c55e] text-[11px] font-bold uppercase tracking-[0.18em]">Founding club offer</p>
              </div>
              <p className="text-white font-extrabold text-[22px] leading-tight tracking-tight mb-1">
                Lock in 40% off, forever.
              </p>
              <p className="text-[#888] text-[14px] leading-relaxed">
                First 50 clubs to join get 40% off any paid plan — permanently.{' '}
                <span className="text-[#aaa] font-medium">{remaining} spots remaining.</span>
              </p>
            </div>
            <div className="flex items-center gap-8 flex-shrink-0">
              <div className="text-center">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-white font-extrabold text-[40px] leading-none">{displayCount}</span>
                  <span className="text-[#555] text-[22px] font-medium">/50</span>
                </div>
                <p className="text-[#888] text-[11px] font-medium mt-1">clubs joined</p>
              </div>
              <div style={{ width: 1, height: 48, background: '#1a2a1a' }} />
              <Link href="/onboarding"
                className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[14px] px-6 py-3 rounded-xl hover:bg-[#1db954] transition-colors whitespace-nowrap">
                Claim your spot →
              </Link>
            </div>
          </div>
          <div style={{ height: 4, background: '#0d0d0d' }}>
            <div style={{ width: `${barWidth}%`, height: '100%', background: '#22c55e', borderRadius: '0 4px 4px 0' }} />
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div className="mt-4">
        <Ticker />
      </div>

      {/* Pain — Before / After */}
      <section className="px-6 sm:px-10 pt-28 pb-28 max-w-7xl mx-auto">
        <div className="mb-16">
          <p className="text-[#888] text-[11px] font-bold uppercase tracking-[0.18em] mb-5">Sound familiar?</p>
          <h2 className="font-extrabold text-white leading-tight tracking-tight max-w-2xl"
            style={{ fontSize: 'clamp(28px, 4vw, 52px)' }}>
            You built something real.<br />Your tools haven&apos;t kept up.
          </h2>
          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            {[
              { icon: '📱', pain: 'Thursday night. 31 unread messages. "What time?" "Which field?" "What kit?" Same questions, every week. You answer them the same way every week. That time is gone and you\'re not getting it back.' },
              { icon: '📍', pain: 'You changed the field at 7pm. You texted 14 parents. Three saw it. Two families drove to the wrong place. You found out from a text during warm-ups.' },
              { icon: '📋', pain: 'Tryout season: four spreadsheets, three email chains, one offer sent to the wrong family. The waitlist emails are still sitting in your drafts. It\'s been two weeks.' },
              { icon: '❓', pain: 'Lineup day: you\'re building it from screenshots of who replied to a text. One player you counted isn\'t coming. You find out five minutes before kickoff.' },
            ].map(({ icon, pain }) => (
              <div key={pain} className="flex items-start gap-4 p-4 rounded-xl"
                style={{ background: '#111', border: '1px solid #232323' }}>
                <span className="text-[20px] flex-shrink-0 mt-0.5">{icon}</span>
                <p className="text-[#999] text-[14px] leading-relaxed">{pain}</p>
              </div>
            ))}
          </div>
          <p className="text-[#888] text-[14px] mt-6 italic">This is what it looks like to run a professional club on tools built for something else.</p>

          {/* Testimonial — $16k result */}
          <div className="mt-10 rounded-2xl p-7" style={{ background: '#0a0a0a', border: '1px solid #1e1e1e' }}>
            <div className="text-[#22c55e] font-extrabold select-none mb-3" style={{ fontSize: 40, lineHeight: 0.75, opacity: 0.5 }}>&ldquo;</div>
            <p className="text-[#ddd] text-[17px] leading-[1.8] font-medium mb-5">
              We lost 11 families last season. When I did exit interviews, three of them said they felt &ldquo;out of the loop&rdquo; on schedules and communications. That&rsquo;s <span className="text-white font-bold">$16,000 in registration fees.</span> Pulse FC paid for itself in the first month.
            </p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-black font-extrabold text-[12px] flex-shrink-0" style={{ background: '#22c55e' }}>J.O.</div>
              <p className="text-[#555] text-[13px]">Director of Coaching · 280-player club</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <Reveal>
            <p className="text-[#888] text-[11px] font-bold uppercase tracking-[0.15em] mb-5">Your WhatsApp group</p>
            <AnimatedChat />
          </Reveal>
          <Reveal delay={150} className="lg:pt-10">
            <p className="text-[#888] text-[11px] font-bold uppercase tracking-[0.15em] mb-5">With Pulse FC</p>
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl p-5" style={{ background: '#0e0e0e', border: '1px solid #1e1e1e' }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] text-[#888] font-bold uppercase tracking-widest mb-1.5">Saturday · vs Maroons SC</p>
                    <p className="text-white font-bold text-[16px] leading-tight">10:00am · Riverside Park</p>
                    <p className="text-[#888] text-[12px] mt-0.5">Home kit · Grass pitch</p>
                  </div>
                  <span className="text-[11px] font-bold text-[#22c55e] flex-shrink-0 mt-0.5"
                    style={{ background: '#22c55e12', border: '1px solid #22c55e20', padding: '3px 10px', borderRadius: 99 }}>
                    2 days
                  </span>
                </div>
                <div className="mb-3.5">
                  <AnimatedBar total={14} filled={11} />
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-[#22c55e] font-semibold">11 attending</span>
                  <span className="text-[#888]">2 pending · 1 out</span>
                </div>
              </div>
              <div className="rounded-2xl p-5" style={{ background: '#0e0e0e', border: '1px solid #1e1e1e' }}>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] flex-shrink-0 opacity-60" />
                  <p className="text-[10px] text-[#888] font-bold uppercase tracking-widest">Pinned announcement</p>
                </div>
                <p className="text-white font-semibold text-[14px] mb-1">Home kit · arrive by 9:30am</p>
                <p className="text-[#888] text-[13px] leading-relaxed">Green tops, black shorts. Coach has the cones.</p>
              </div>
              <div className="flex items-center gap-3 px-1 pt-1">
                <div className="flex -space-x-2">
                  {['SM','DP','LT','JK','MH'].map((init) => (
                    <div key={init} className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold text-[#888]"
                      style={{ background: '#161616', border: '2px solid #080808' }}>{init}</div>
                  ))}
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold text-[#888]"
                    style={{ background: '#161616', border: '2px solid #080808' }}>+9</div>
                </div>
                <p className="text-[#888] text-[12px]">All 14 parents notified. Nobody needed to ask.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ borderTop: '1px solid #111', borderBottom: '1px solid #111', background: '#060606' }}
        className="px-6 sm:px-10 py-20">
        <div className="max-w-7xl mx-auto">
          <p className="text-[#888] text-[11px] font-bold uppercase tracking-[0.18em] mb-2">Early feedback from the field</p>
          <h2 className="text-white font-extrabold mb-12" style={{ fontSize: 'clamp(22px, 2.8vw, 34px)' }}>
            What directors of coaching are saying.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <Reveal key={t.initials} delay={i * 120}>
                <div className="flex flex-col h-full" style={{ background: '#0c0c0c', border: '1px solid #181818', borderRadius: 20, padding: 28 }}>
                  <div className="flex gap-0.5 mb-5">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <span key={s} className="text-[#22c55e] text-[14px]">★</span>
                    ))}
                  </div>
                  <p className="text-[#bbb] text-[15px] leading-[1.75] flex-1 mb-7">&ldquo;{t.quote}&rdquo;</p>
                  <div className="flex items-center gap-3 pt-4" style={{ borderTop: '1px solid #181818' }}>
                    <div className="w-9 h-9 rounded-full bg-[#161616] border border-[#222] flex items-center justify-center text-[10px] font-extrabold text-[#888] flex-shrink-0">
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-white font-bold text-[13px] leading-none mb-1">{t.role}</p>
                      <p className="text-[#888] text-[11px]">{t.detail}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <FeatureTabs />

      {/* ROI Math Strip */}
      <section style={{ borderTop: '1px solid #111', background: '#060606' }}
        className="px-6 sm:px-10 py-16">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <p className="text-[#777] text-[11px] font-bold uppercase tracking-[0.18em] mb-4 text-center">The business case</p>
            <h2 className="font-extrabold text-white leading-tight mb-12 tracking-tight text-center"
              style={{ fontSize: 'clamp(22px, 3vw, 36px)' }}>
              Admin problems are revenue problems.
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-px rounded-2xl overflow-hidden mb-8"
            style={{ background: '#141414', border: '1px solid #1a1a1a' }}>
            {[
              { stat: '$1,600', label: 'Average annual registration fee', sub: 'per family, per year' },
              { stat: '4–6', label: 'Families lost to poor comms', sub: 'per season, per club' },
              { stat: '$9,600', label: 'Revenue left on the table', sub: 'conservative estimate' },
            ].map(({ stat, label, sub }) => (
              <div key={label} className="flex flex-col items-center justify-center py-10 px-6 text-center"
                style={{ background: '#0d0d0d' }}>
                <span className="text-white font-extrabold leading-none tracking-tight mb-2"
                  style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}>{stat}</span>
                <span className="text-[#888] text-[12px] font-medium mb-1">{label}</span>
                <span className="text-[#555] text-[10px]">{sub}</span>
              </div>
            ))}
          </div>
          <Reveal>
            <div className="p-6 rounded-2xl" style={{ background: '#0a1a0a', border: '1px solid #22c55e20' }}>
              <p className="text-[#22c55e] font-bold text-[15px] mb-1">The math is simple.</p>
              <p className="text-[#999] text-[14px] leading-relaxed">
                Pulse FC Club plan costs $99/month — $1,188/year. If it keeps just one family from leaving, you&rsquo;re up $412. Keep three families and you&rsquo;re up $3,612. The software pays for itself before the season is halfway done.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Value Stack */}
      <section style={{ borderTop: '1px solid #111', background: '#060606' }}
        className="px-6 sm:px-10 py-24">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <p className="text-[#888] text-[11px] font-bold uppercase tracking-[0.18em] mb-4">Everything included</p>
            <h2 className="font-extrabold text-white leading-tight mb-4 tracking-tight"
              style={{ fontSize: 'clamp(26px, 3.5vw, 44px)' }}>
              Everything you need.<br />Nothing held back.
            </h2>
            <p className="text-[#888] text-[16px] mb-12">Every feature, every team, every AI tool — for one flat price. No add-ons. No per-team fees. No paying extra for things that should be included.</p>

            <div className="grid sm:grid-cols-2 gap-3 mb-10">
              {valueStack.map((item) => (
                <div key={item.label} className="flex items-start gap-4 p-5 rounded-2xl"
                  style={{ background: '#111', border: '1px solid #232323' }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: '#0e2016', border: '1px solid #22c55e30' }}>
                    <span className="text-[#22c55e] text-[10px] font-extrabold">✓</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[14px] leading-none mb-1">{item.label}</p>
                    <p className="text-[#888] text-[12px] leading-relaxed">{item.desc}</p>
                  </div>

                </div>
              ))}
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e1e1e' }}>
              <div style={{ background: '#0a0a0a', borderBottom: '1px solid #1a1a1a', padding: '12px 20px' }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: '#555', textTransform: 'uppercase', letterSpacing: '0.14em', margin: 0 }}>
                  What the market charges for the same features
                </p>
              </div>
              {[
                { name: 'TeamSnap', price: '$15.99/mo', note: 'per team · no AI features', color: '#444' as const, highlight: false },
                { name: 'SportsEngine', price: '$79/mo', note: 'no AI · complex setup · starts at $79', color: '#444' as const, highlight: false },
                { name: 'Pulse FC', price: 'From $9.99/mo', note: 'all AI features · all teams · free to start', color: '#22c55e' as const, highlight: true },
              ].map(({ name, price, note, color, highlight }) => (
                <div key={name} style={{
                  background: highlight ? '#0a1a0a' : '#0d0d0d',
                  borderBottom: '1px solid #141414',
                  padding: '14px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color, margin: 0, marginBottom: 3 }}>{name}</p>
                    <p style={{ fontSize: 11, color: '#444', margin: 0 }}>{note}</p>
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 800, color, margin: 0 }}>{price}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center">
              <Link href="/pricing" className="text-[#888] text-[13px] hover:text-[#ccc] transition-colors underline underline-offset-4">
                View full pricing →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Guarantee */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-24 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <Reveal>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
              style={{ background: '#0e2016', border: '1px solid #22c55e30' }}>
              <svg width="28" height="32" viewBox="-2 -2 32 36" fill="none">
                <path d="M14 1L2 6v9c0 8.25 5.14 15.96 12 18 6.86-2.04 12-9.75 12-18V6L14 1z" stroke="#22c55e" strokeWidth="1.8" strokeLinejoin="round" fill="#22c55e12"/>
                <path d="M9 16l3.5 3.5L19 12" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[#22c55e] text-[11px] font-bold uppercase tracking-[0.18em] mb-4">The guarantee</p>
            <h2 className="font-extrabold text-white leading-tight mb-6 tracking-tight"
              style={{ fontSize: 'clamp(26px, 3.2vw, 42px)' }}>
              The 30-Day &quot;Get Your<br />Evenings Back&quot; Guarantee.
            </h2>
            <p className="text-[#999] text-[17px] leading-[1.75] mb-6">
              Set up your club tonight. Run it for 30 days.
            </p>
            <p className="text-[#999] text-[17px] leading-[1.75] mb-6">
              If Pulse FC doesn&apos;t save you at least <span className="text-white font-semibold">3 hours a week on admin</span> — or if you don&apos;t love it for any reason at all — email us and we&apos;ll refund every cent.
            </p>
            <p className="text-[#999] text-[17px] leading-[1.75]">
              No forms. No arguing. No questions. One email and it&apos;s done.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <div className="flex flex-col gap-5">
              {[
                { title: 'Zero risk setup', body: 'Free plan for 1 team, up to 12 players. No credit card needed to get started.' },
                { title: 'Cancel any time', body: 'Month to month. No contracts. Leave whenever you want, keep your data.' },
                { title: '30-day full refund', body: 'Not saving time in the first 30 days? Email support@pulse-fc.app. Refunded immediately.' },
                { title: '20-minute setup', body: 'From signup to your whole club live in one evening. We\'ve timed it.' },
              ].map(({ title, body }) => (
                <div key={title} className="flex items-start gap-4 p-5 rounded-2xl"
                  style={{ background: '#111', border: '1px solid #232323' }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: '#0e2016', border: '1px solid #22c55e30' }}>
                    <span className="text-[#22c55e] text-[10px] font-extrabold">✓</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-[14px] mb-1">{title}</p>
                    <p className="text-[#888] text-[13px] leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Founder note */}
      <section style={{ borderTop: '1px solid #111', background: '#060606' }}
        className="px-6 sm:px-10 py-24">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <p className="text-[#888] text-[11px] font-bold uppercase tracking-[0.15em] mb-8">Built by a coach, for coaches</p>
            <div className="text-[#22c55e] font-extrabold select-none mb-4" style={{ fontSize: 64, lineHeight: 0.75, opacity: 0.4 }}>&ldquo;</div>
            <blockquote className="text-[#ccc] text-[20px] leading-[1.8] font-medium mb-10"
              style={{ borderLeft: '2px solid #222', paddingLeft: 28 }}>
              I built this because I coach U14s and the admin was eating my evenings.
              Spreadsheets, three WhatsApp groups, chasing RSVPs at 11pm on a Thursday.
              <br /><br />
              I wanted one app that just worked — that parents would actually open,
              that coaches could actually use, and that didn&apos;t need a 45-minute setup call.
              <br /><br />
              So I built it. And then I kept coaching.
            </blockquote>
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-full bg-[#22c55e] flex items-center justify-center text-black font-extrabold text-sm flex-shrink-0">RC</div>
              <div>
                <p className="text-white font-bold text-[14px] leading-none mb-1">Rick Breheny</p>
                <p className="text-[#888] text-[12px]">Founder, Pulse FC · U14 Head Coach, MDS Academy</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-32 text-center">
        <Reveal>
          <p className="text-[#888] text-[11px] font-bold uppercase tracking-[0.18em] mb-6">The decision</p>
          <h2 className="font-extrabold text-white leading-[0.95] tracking-tight mb-8 max-w-3xl mx-auto"
            style={{ fontSize: 'clamp(36px, 5.5vw, 68px)' }}>
            Every week you wait is another week of chaos,<br />
            <span style={{ color: '#22c55e' }}>for you and your families.</span>
          </h2>
          <p className="text-[#999] text-[18px] mb-3 max-w-xl mx-auto font-medium leading-relaxed">
            The clubs that win registrations aren&rsquo;t always the best on the field. They&rsquo;re the ones that look the most professional off it.
          </p>
          <p className="text-[#666] text-[15px] mb-12 max-w-lg mx-auto leading-relaxed">
            Set up takes 20 minutes. The time you get back starts tonight. And if it doesn&rsquo;t save you at least 3 hours a week — email us. Full refund. No questions.
          </p>
          <Link href="/onboarding"
            className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[16px] px-10 py-4 rounded-2xl hover:bg-[#1db954] transition-colors">
            Set up your club tonight →
          </Link>
          <p className="text-[#22c55e] text-[12px] mt-5 font-semibold opacity-80">Founding club offer: {remaining} spots remaining · 40% off any paid plan, forever</p>
          <p className="text-[#555] text-[12px] mt-2">Free plan available · Cancel anytime · No credit card required</p>
        </Reveal>
      </section>

      {/* Contact */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-20">
        <div className="max-w-lg mx-auto">
          <Reveal>
            <h2 className="font-extrabold text-white mb-2" style={{ fontSize: 'clamp(26px, 3vw, 38px)' }}>
              Questions before you commit?
            </h2>
            <p className="text-[#888] text-[15px] mb-10 leading-relaxed">
              Ask about the platform, your club size, or anything else.<br />
              Rick replies personally — usually the same day.
            </p>
          </Reveal>
          <ContactForm />
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #0f0f0f' }} className="px-6 sm:px-10 py-8 flex items-center justify-between max-w-7xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
        <img src="/logo.png" alt="Pulse FC" style={{ height: '36px', width: 'auto' }} />
        
        <div className="flex items-center gap-6">
          <Link href="/pricing" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Pricing</Link>
          <Link href="/compare" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Compare</Link>
          <Link href="/privacy" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Privacy</Link>
          <Link href="/terms" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Terms</Link>
          <Link href="/dashboard" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Coach Login</Link>
          <a href="https://apps.apple.com/us/app/pulse-fc/id6797330659" target="_blank" rel="noopener noreferrer" className="hidden sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, left as <img> for this marketing page */}
            <img src="/app-store-badge.svg" alt="Download on the App Store" style={{ height: '28px', width: 'auto' }} />
          </a>
        </div>
      </footer>

    </div>
  );
}
