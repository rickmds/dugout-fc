import Link from 'next/link';
import Ticker from '@/components/Ticker';
import LivePreview from '@/components/LivePreview';
import ContactForm from '@/components/ContactForm';
import Reveal from '@/components/Reveal';
import AnimatedChat from '@/components/AnimatedChat';
import AnimatedBar from '@/components/AnimatedBar';
import FoundingGrid from '@/components/FoundingGrid';
import LineupBuilder from '@/components/LineupBuilder';

const SPOTS_TOTAL = 25;
const SPOTS_TAKEN = 5;
const SPOTS_LEFT  = SPOTS_TOTAL - SPOTS_TAKEN;

const testimonials = [
  {
    quote: 'I used to spend Thursday nights answering the same questions in the parent WhatsApp. First week we used Dugout FC, I had zero messages the night before a game. First time that\'s happened in four years of coaching.',
    name: 'Jamie Walsh',
    role: 'Head Coach',
    club: 'Riverside United U12s',
  },
  {
    quote: 'I took a photo of the blurry PDF the league emailed us and the AI got every game right. Dates, times, locations, opponents — the whole season done in about 40 seconds. I\'ve been doing this manually for three years.',
    name: 'Claire Nguyen',
    role: 'Club Secretary',
    club: 'Northgate FC',
  },
  {
    quote: 'We run five teams. Coordinating across three different coaches was a nightmare. Now I can see the whole club — every team\'s schedule, every RSVP — without making a single phone call.',
    name: 'Tom Brenwick',
    role: 'Club Administrator',
    club: 'Westfield Youth Soccer',
  },
];

const features = [
  {
    n: '01',
    title: 'Your entire season schedule, in under a minute.',
    body: 'Take a photo. Upload a PDF. Drop in a spreadsheet. AI reads whatever format your league sends and creates every event automatically — date, time, location, opponent. No manual entry.',
    checks: ['Works with any file format', 'Flags anything it\'s unsure about', 'One-click confirm and you\'re live'],
    visual: (
      <div className="rounded-2xl overflow-hidden" style={{ background: '#0c0c0c', border: '1px solid #181818' }}>
        {/* Import header */}
        <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #161616', background: '#0a0a0a' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#141414', border: '1px solid #202020' }}>
              <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                <rect x="1" y="1" width="9" height="12" rx="1.5" stroke="#555" strokeWidth="1.2"/>
                <path d="M9 1l3 3" stroke="#555" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M9 1v3h3" stroke="#555" strokeWidth="1.2"/>
                <path d="M3.5 7.5h5M3.5 9.5h3.5" stroke="#555" strokeWidth="1" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className="text-white text-[12px] font-semibold leading-none mb-0.5">season_2026.pdf</p>
              <p className="text-[#22c55e] text-[10px] font-bold">✓ 14 games imported</p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-[#22c55e] px-2.5 py-1 rounded-lg"
            style={{ background: '#22c55e10', border: '1px solid #22c55e20' }}>
            Confirmed
          </span>
        </div>

        {/* Column headers */}
        <div className="grid px-4 py-2" style={{ gridTemplateColumns: '90px 48px 1fr 56px 44px', gap: '0 8px', borderBottom: '1px solid #111' }}>
          {['Date', 'Time', 'Opponent / Venue', 'Surface', 'Kit'].map(h => (
            <span key={h} className="text-[9px] font-bold uppercase tracking-widest text-[#333]">{h}</span>
          ))}
        </div>

        {/* Game rows */}
        <div className="flex flex-col divide-y divide-[#111]">
          {[
            { date: 'Sat 5 Jul',  time: '10:00', opp: 'Riverside Utd',  venue: 'Riverside Park',    surface: 'Grass', kit: 'Home' },
            { date: 'Sat 12 Jul', time: '11:30', opp: 'Northgate FC',   venue: 'Northgate Sports',  surface: 'Turf',  kit: 'Away' },
            { date: 'Sat 19 Jul', time: '09:00', opp: 'Valley Eagles',  venue: 'Valley Rec. Ctr',   surface: 'Grass', kit: 'Home' },
            { date: 'Sat 26 Jul', time: '14:00', opp: 'Westfield SC',   venue: 'Main Street Field', surface: 'Turf',  kit: 'Home' },
            { date: 'Sat 2 Aug',  time: '10:30', opp: 'Lakeview FC',    venue: 'Lakeview Complex',  surface: 'Grass', kit: 'Away' },
          ].map((g, i) => (
            <div key={i} className="grid items-center px-4 py-2.5"
              style={{ gridTemplateColumns: '90px 48px 1fr 56px 44px', gap: '0 8px' }}>
              <span className="text-white text-[11px] font-semibold">{g.date}</span>
              <span className="text-[#555] text-[11px] font-mono">{g.time}</span>
              <div className="min-w-0">
                <p className="text-[#ccc] text-[11px] font-semibold truncate leading-none mb-0.5">{g.opp}</p>
                <p className="text-[#3a3a3a] text-[9.5px] truncate">{g.venue}</p>
              </div>
              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md text-center"
                style={g.surface === 'Grass'
                  ? { background: '#0d1f10', color: '#4ade80', border: '1px solid #22c55e18' }
                  : { background: '#141020', color: '#a78bfa', border: '1px solid #8b5cf618' }}>
                {g.surface}
              </span>
              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md text-center"
                style={g.kit === 'Home'
                  ? { background: '#0e1a0e', color: '#22c55e', border: '1px solid #22c55e18' }
                  : { background: '#1a1209', color: '#f59e0b', border: '1px solid #f59e0b18' }}>
                {g.kit}
              </span>
            </div>
          ))}
        </div>

        <div className="px-4 py-2.5 text-center" style={{ borderTop: '1px solid #111' }}>
          <span className="text-[#2a2a2a] text-[10px]">+ 9 more games in your schedule</span>
        </div>
      </div>
    ),
  },
  {
    n: '02',
    title: 'Know exactly who\'s coming. Before you even ask.',
    body: 'Parents get a push notification. They tap one button. You see a live headcount update in real time. Set a lock time and RSVPs close automatically — no chasing, no surprises on game day.',
    checks: ['Attending or Not Attending only — no maybe', 'Auto-locks before game time', 'Full attendance history per player'],
    visual: (
      <div className="rounded-2xl overflow-hidden" style={{ background: '#0c0c0c', border: '1px solid #181818' }}>
        {/* Game header */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #161616', background: '#0a0a0a' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[#3a3a3a] text-[10px] font-bold uppercase tracking-widest mb-1">Sat 5 Jul · 10:00am</p>
              <p className="text-white font-extrabold text-[15px] leading-tight">vs Maroons SC</p>
              <p className="text-[#3a3a3a] text-[11px] mt-0.5">Riverside Park · Home kit</p>
            </div>
            <span className="text-[10px] font-bold text-[#22c55e] flex-shrink-0"
              style={{ background: '#22c55e10', border: '1px solid #22c55e20', padding: '3px 10px', borderRadius: 99 }}>
              2 days
            </span>
          </div>
        </div>

        {/* Availability bar */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #161616' }}>
          <div className="flex justify-between items-baseline mb-3">
            <span className="text-white font-bold text-[13px]">Squad availability</span>
            <span className="text-[#22c55e] font-extrabold text-[13px]">11 / 14</span>
          </div>
          <AnimatedBar total={14} filled={11} />
        </div>

        {/* Player list */}
        <div className="px-5 py-4">
          <div className="flex flex-col gap-1.5 mb-3">
            {[
              { init: 'SM', name: 'Sarah Mitchell', yes: true  },
              { init: 'DP', name: 'David Park',     yes: true  },
              { init: 'RK', name: 'Ryan Kowalski',  yes: false },
              { init: 'EL', name: 'Ethan Lopez',    yes: true  },
              { init: 'LT', name: 'Lisa Torres',    yes: true  },
            ].map((p) => (
              <div key={p.init} className="flex items-center gap-3 py-2 px-3 rounded-xl"
                style={{ background: '#111', border: '1px solid #181818' }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-extrabold flex-shrink-0"
                  style={p.yes
                    ? { background: '#0e2016', border: '1px solid #22c55e22', color: '#22c55e' }
                    : { background: '#1e0f0f', border: '1px solid #f8717122', color: '#f87171' }}>
                  {p.init}
                </div>
                <span className="text-[#888] text-[12px] flex-1">{p.name}</span>
                <span className="text-[11px] font-bold"
                  style={{ color: p.yes ? '#22c55e' : '#f87171' }}>
                  {p.yes ? '✓ Attending' : '✗ Not going'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[#252525] text-[10px] text-center">+ 9 more players</p>
        </div>

        {/* RSVP lock */}
        <div className="px-5 py-3 flex items-center justify-between"
          style={{ background: '#090909', borderTop: '1px solid #141414' }}>
          <span className="text-[#333] text-[11px]">RSVPs close automatically in</span>
          <span className="text-[#555] text-[11px] font-extrabold">14h 23m</span>
        </div>
      </div>
    ),
  },
  {
    n: '03',
    title: 'Build your lineup in seconds.',
    body: 'Drag your confirmed players onto a pitch. AI suggests a starting eleven based on who\'s coming and their positions. Adjust, then hand the board over at kickoff.',
    checks: ['All major formations supported', 'Only shows confirmed players', 'AI sub rotation for equal play time'],
    visual: <LineupBuilder />,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]">

      {/* Nav */}
      <nav className="px-6 sm:px-10 py-5 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full bg-[#22c55e] flex-shrink-0" style={{ boxShadow: '0 0 8px #22c55e50' }} />
          <span className="font-extrabold text-white text-[14px] tracking-tight">DUGOUT FC</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="hidden sm:flex items-center gap-2 text-[#444] text-[12px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] flex-shrink-0 animate-pulse" />
            {SPOTS_LEFT} founding spots left
          </span>
          <Link href="/dashboard"
            className="hidden sm:block text-[13px] font-semibold text-[#555] hover:text-white transition-colors">
            Coach login
          </Link>
          <Link href="/onboarding"
            className="text-[13px] font-bold text-black bg-[#22c55e] px-4 py-2 rounded-lg hover:bg-[#1db954] transition-colors">
            Add your club
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 sm:px-10 pt-14 pb-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-16 items-center">

          {/* Left */}
          <div>
            <Link href="/onboarding"
              className="inline-flex items-center gap-2.5 text-[#22c55e] text-[12px] font-semibold border border-[#22c55e25] bg-[#22c55e0a] px-4 py-2 rounded-full hover:border-[#22c55e45] transition-colors mb-10 group">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse flex-shrink-0" />
              {SPOTS_LEFT} Founding Club spots left — free forever
              <span className="text-[#22c55e66] group-hover:text-[#22c55e] transition-colors">→</span>
            </Link>

            <h1 className="font-extrabold text-white leading-[0.92] tracking-[-0.02em] mb-9"
              style={{ fontSize: 'clamp(60px, 9.5vw, 120px)' }}>
              Built<br />
              for<br />
              <span className="text-[#22c55e]">Saturday.</span>
            </h1>

            <p className="text-[#888] text-[18px] leading-[1.75] font-medium mb-10 max-w-md">
              Dugout FC handles schedules, RSVPs, lineups, and parent comms — so you spend your week coaching, not{' '}
              <span className="line-through decoration-[#2e2e2e] text-[#444]">managing a group chat</span>.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/onboarding"
                className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[15px] px-7 py-3.5 rounded-xl hover:bg-[#1db954] transition-colors">
                Add your club →
              </Link>
              <a href="#how"
                className="inline-flex items-center gap-2 text-[#555] text-[15px] font-medium px-7 py-3.5 rounded-xl border border-[#222] hover:border-[#2e2e2e] hover:text-[#777] transition-all">
                See how it works
              </a>
            </div>
          </div>

          {/* Right — Live Preview */}
          <div className="hidden lg:flex justify-end">
            <LivePreview />
          </div>

        </div>
      </section>

      {/* Ticker */}
      <div className="mt-10">
        <Ticker />
      </div>

      {/* Before / After */}
      <section className="px-6 sm:px-10 pt-24 pb-28 max-w-7xl mx-auto">
        <div className="mb-16">
          <p className="text-[#444] text-[11px] font-bold uppercase tracking-[0.18em] mb-5">Sound familiar?</p>
          <h2 className="font-extrabold text-white leading-tight tracking-tight max-w-xl"
            style={{ fontSize: 'clamp(30px, 4vw, 48px)' }}>
            Sunday night.<br />Same questions. Same chaos.
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">

          {/* Left — chaos */}
          <Reveal>
            <p className="text-[#444] text-[11px] font-bold uppercase tracking-[0.15em] mb-5">Your WhatsApp group</p>
            <AnimatedChat />
          </Reveal>

          {/* Right — fix */}
          <Reveal delay={150} className="lg:pt-10">
            <p className="text-[#444] text-[11px] font-bold uppercase tracking-[0.15em] mb-5">With Dugout FC</p>
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl p-5" style={{ background: '#0e0e0e', border: '1px solid #1e1e1e' }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] text-[#3a3a3a] font-bold uppercase tracking-widest mb-1.5">Saturday · vs Maroons SC</p>
                    <p className="text-white font-bold text-[16px] leading-tight">10:00am · Riverside Park</p>
                    <p className="text-[#444] text-[12px] mt-0.5">Home kit · Grass pitch</p>
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
                  <span className="text-[#3a3a3a]">2 pending · 1 out</span>
                </div>
              </div>

              <div className="rounded-2xl p-5" style={{ background: '#0e0e0e', border: '1px solid #1e1e1e' }}>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] flex-shrink-0 opacity-60" />
                  <p className="text-[10px] text-[#3a3a3a] font-bold uppercase tracking-widest">Pinned announcement</p>
                </div>
                <p className="text-white font-semibold text-[14px] mb-1">Home kit · arrive by 9:30am</p>
                <p className="text-[#555] text-[13px] leading-relaxed">Green tops, black shorts. Coach has the cones.</p>
              </div>

              <div className="flex items-center gap-3 px-1 pt-1">
                <div className="flex -space-x-2">
                  {['SM','DP','LT','JK','MH'].map((init) => (
                    <div key={init} className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold text-[#444]"
                      style={{ background: '#161616', border: '2px solid #080808' }}>{init}</div>
                  ))}
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold text-[#444]"
                    style={{ background: '#161616', border: '2px solid #080808' }}>+9</div>
                </div>
                <p className="text-[#4a4a4a] text-[12px]">All 14 parents notified. Nobody needed to ask.</p>
              </div>
            </div>
          </Reveal>

        </div>
      </section>

      {/* Testimonials */}
      <section style={{ borderTop: '1px solid #111', borderBottom: '1px solid #111', background: '#060606' }}
        className="px-6 sm:px-10 py-20">
        <div className="max-w-7xl mx-auto">
          <p className="text-[#3a3a3a] text-[11px] font-bold uppercase tracking-[0.18em] mb-12">What coaches are saying</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={i * 120}>
                <div className="flex flex-col h-full" style={{ background: '#0c0c0c', border: '1px solid #181818', borderRadius: 20, padding: 28 }}>
                  <div className="text-[#22c55e] font-extrabold mb-4 leading-none select-none" style={{ fontSize: 48, lineHeight: 0.8, opacity: 0.5 }}>"</div>
                  <p className="text-[#999] text-[15px] leading-[1.75] flex-1 mb-7">{t.quote}</p>
                  <div className="flex items-center gap-3 pt-4" style={{ borderTop: '1px solid #181818' }}>
                    <div className="w-9 h-9 rounded-full bg-[#161616] border border-[#222] flex items-center justify-center text-[10px] font-extrabold text-[#555] flex-shrink-0">
                      {t.name.split(' ').map(p => p[0]).join('')}
                    </div>
                    <div>
                      <p className="text-white font-bold text-[13px] leading-none mb-1">{t.name}</p>
                      <p className="text-[#3a3a3a] text-[11px]">{t.role} · {t.club}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 3 Features */}
      <section id="how" style={{ borderTop: '1px solid #111' }}>
        {features.map((f, i) => (
          <div key={f.n} style={{ borderBottom: '1px solid #0f0f0f', background: i % 2 === 1 ? '#060606' : 'transparent' }}>
            <div className="max-w-7xl mx-auto px-6 sm:px-10 py-20 grid lg:grid-cols-2 gap-14 xl:gap-20 items-center">
              {/* Text side */}
              <Reveal className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <div className="font-extrabold leading-none mb-6 select-none tracking-tight"
                  style={{ fontSize: 'clamp(48px, 5vw, 72px)', color: '#1e1e1e', fontVariantNumeric: 'tabular-nums' }}>
                  {f.n}
                </div>
                <h2 className="font-extrabold text-white leading-tight mb-5 tracking-tight"
                  style={{ fontSize: 'clamp(22px, 2.6vw, 32px)' }}>
                  {f.title}
                </h2>
                <p className="text-[#686868] text-[17px] leading-[1.75] mb-8">{f.body}</p>
                <div className="flex flex-col gap-3">
                  {f.checks.map((c) => (
                    <div key={c} className="flex items-start gap-3 text-[13px] text-[#5a5a5a] font-medium">
                      <span className="text-[#22c55e] font-extrabold text-[10px] mt-1 flex-shrink-0">✓</span>
                      {c}
                    </div>
                  ))}
                </div>
              </Reveal>
              {/* Visual side */}
              <Reveal delay={150} className={i % 2 === 1 ? 'lg:order-1' : ''}>
                {f.visual}
              </Reveal>
            </div>
          </div>
        ))}
      </section>

      {/* Founding Club */}
      <section className="px-6 sm:px-10 py-28 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 xl:gap-24 items-start">
          <Reveal>
            <p className="text-[#444] text-[11px] font-bold uppercase tracking-[0.15em] mb-10">A note from the founder</p>
            <div className="text-[#22c55e] font-extrabold select-none mb-4" style={{ fontSize: 64, lineHeight: 0.75, opacity: 0.4 }}>"</div>
            <blockquote className="text-[#aaa] text-[18px] leading-[1.75] font-medium mb-10"
              style={{ borderLeft: '2px solid #222', paddingLeft: 24 }}>
              I built this because I coach U14s and the admin was eating my Sundays.
              I wanted something that just worked — no spreadsheets, no group chat chaos,
              no calling around to find out who was coming.
              <br /><br />
              The first 25 clubs that sign up get every feature, free forever.
              That's not a promotional line — it's a genuine thank-you to the coaches
              who trust something early enough to help shape it.
            </blockquote>
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-full bg-[#22c55e] flex items-center justify-center text-black font-extrabold text-sm flex-shrink-0">RC</div>
              <div>
                <p className="text-white font-bold text-[14px] leading-none mb-1">Rick</p>
                <p className="text-[#444] text-[12px]">Founder, Dugout FC · U14 head coach, MDS Academy</p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <FoundingGrid total={SPOTS_TOTAL} taken={SPOTS_TAKEN} spotsLeft={SPOTS_LEFT} />
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-32 text-center">
        <Reveal>
          <p className="text-[#3a3a3a] text-[11px] font-bold uppercase tracking-[0.2em] mb-8">{SPOTS_LEFT} founding spots remaining</p>
          <h2 className="font-extrabold text-white leading-[0.95] tracking-tight mb-7 max-w-3xl mx-auto"
            style={{ fontSize: 'clamp(38px, 5.5vw, 68px)' }}>
            Spend Saturday coaching.<br />
            Not <span className="line-through text-[#333] decoration-[#2a2a2a]">managing</span>.
          </h2>
          <p className="text-[#555] text-[18px] mb-12 max-w-sm mx-auto font-medium leading-relaxed">
            Set up your club in 10 minutes. Everything runs itself after that.
          </p>
          <Link href="/onboarding"
            className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[16px] px-10 py-4 rounded-2xl hover:bg-[#1db954] transition-colors">
            Add your club →
          </Link>
        </Reveal>
      </section>

      {/* Contact */}
      <section style={{ borderTop: '1px solid #111' }} className="px-6 sm:px-10 py-20">
        <div className="max-w-lg mx-auto">
          <Reveal>
            <h2 className="font-extrabold text-white mb-2" style={{ fontSize: 'clamp(26px, 3vw, 38px)' }}>
              Something on your mind?
            </h2>
            <p className="text-[#444] text-[15px] mb-10 leading-relaxed">
              Ask about the platform, your club, or the founding program.<br />
              We reply personally — usually the same day.
            </p>
          </Reveal>
          <ContactForm />
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #0f0f0f' }} className="px-6 sm:px-10 py-8 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-4 h-4 rounded-full bg-[#22c55e] flex-shrink-0 opacity-50" />
          <span className="font-extrabold text-[#2a2a2a] text-[13px] tracking-tight">DUGOUT FC</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/privacy" className="text-[#2a2a2a] text-[12px] hover:text-[#555] transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="text-[#2a2a2a] text-[12px] hover:text-[#555] transition-colors">Terms</Link>
          <Link href="/dashboard" className="text-[#2a2a2a] text-[12px] hover:text-[#555] transition-colors">Coach Dashboard</Link>
          <p className="text-[#1e1e1e] text-[12px]">Built for coaches · © {new Date().getFullYear()}</p>
        </div>
      </footer>

    </div>
  );
}
