import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import Ticker from '@/components/Ticker';
import AppMockup from '@/components/AppMockup';
import PhoneFrame from '@/components/PhoneFrame';
import ContactForm from '@/components/ContactForm';
import Reveal from '@/components/Reveal';
import AnimatedChat from '@/components/AnimatedChat';
import AnimatedBar from '@/components/AnimatedBar';
import LineupBuilder from '@/components/LineupBuilder';
import NavBar from '@/components/NavBar';

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
  { label: 'Multi-team club dashboard', desc: 'Every team, schedule, RSVP, and attendance in one place', value: 197 },
  { label: 'Mobile app for every parent', desc: 'iOS — no tech skills required, no training needed', value: 97 },
  { label: 'AI schedule importer', desc: 'Upload any PDF, image, or spreadsheet — whole season imported in seconds', value: 47 },
  { label: 'Live RSVP + attendance tracking', desc: 'Parents tap one button. Coaches see a live headcount. Auto-locks before game time.', value: 27 },
  { label: 'AI lineup builder', desc: 'Drag confirmed players onto the pitch. AI suggests the starting lineup by position.', value: 47 },
  { label: 'Match tracker + equal playing time', desc: 'Live match timer, sub tracking, and instant equal-time calculator for the sideline.', value: 47 },
  { label: 'Team chat + announcements', desc: 'Real-time group chat, coach-only announcements, and direct messages — in one tab.', value: 27 },
  { label: 'Fee collection + payment tracking', desc: 'Send invoices, record payments, know who owes what', value: 47 },
  { label: 'Tryout management system', desc: 'Registration forms, player ranking, team builder, offer letters, acceptance tracking', value: 197 },
];

const features = [
  {
    n: '01',
    title: 'Your entire season schedule in under a minute.',
    body: 'Take a photo. Upload a PDF. Drop in a spreadsheet. AI reads whatever format your league sends and creates every event — date, time, location, opponent. No manual entry. No errors.',
    checks: ['Works with any file format', 'Flags anything it\'s unsure about', 'One-click confirm and you\'re live'],
    visual: (
      <div className="rounded-2xl overflow-hidden" style={{ background: '#0c0c0c', border: '1px solid #181818' }}>
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
        <div className="grid px-4 py-2" style={{ gridTemplateColumns: '90px 48px 1fr 60px', gap: '0 8px', borderBottom: '1px solid #111' }}>
          {['Date', 'Time', 'Opponent / Venue', 'Type'].map(h => (
            <span key={h} className="text-[9px] font-bold uppercase tracking-widest text-[#888]">{h}</span>
          ))}
        </div>
        <div className="flex flex-col divide-y divide-[#111]">
          {[
            { date: 'Sat 5 Jul',  time: '10:00', opp: 'Riverside Utd',  venue: 'Riverside Park',    type: 'Game'     },
            { date: 'Sat 12 Jul', time: '11:30', opp: 'Northgate FC',   venue: 'Northgate Sports',  type: 'Game'     },
            { date: 'Sat 19 Jul', time: '09:00', opp: 'Valley Eagles',  venue: 'Valley Rec. Ctr',   type: 'Game'     },
            { date: 'Sat 23 Jul', time: '17:00', opp: 'Training',       venue: 'Home Field',         type: 'Training' },
            { date: 'Sat 26 Jul', time: '14:00', opp: 'Westfield SC',   venue: 'Main Street Field', type: 'Game'     },
          ].map((g, i) => (
            <div key={i} className="grid items-center px-4 py-2.5"
              style={{ gridTemplateColumns: '90px 48px 1fr 60px', gap: '0 8px' }}>
              <span className="text-white text-[11px] font-semibold">{g.date}</span>
              <span className="text-[#888] text-[11px] font-mono">{g.time}</span>
              <div className="min-w-0">
                <p className="text-[#ccc] text-[11px] font-semibold truncate leading-none mb-0.5">{g.opp}</p>
                <p className="text-[#888] text-[9.5px] truncate">{g.venue}</p>
              </div>
              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md text-center"
                style={g.type === 'Game'
                  ? { background: '#0e1a0e', color: '#22c55e', border: '1px solid #22c55e18' }
                  : { background: '#1a1209', color: '#f59e0b', border: '1px solid #f59e0b18' }}>
                {g.type}
              </span>
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 text-center" style={{ borderTop: '1px solid #111' }}>
          <span className="text-[#888] text-[10px]">+ 9 more games in your schedule</span>
        </div>
      </div>
    ),
  },
  {
    n: '02',
    title: 'Know exactly who\'s coming. Before you even ask.',
    body: 'Parents get a push notification. They tap one button. You see a live headcount update in real time. Set a lock time and RSVPs close automatically — no chasing, no surprises on game day.',
    checks: ['Attending or Not Attending only — no maybes', 'Auto-locks before game time', 'Full attendance history per player'],
    visual: (
      <div className="flex flex-col items-center sm:flex-row sm:items-start gap-5">
        <div className="flex-shrink-0">
        <PhoneFrame>
          {/* App header */}
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #161616', background: '#0a0a0a' }}>
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[#555] text-[9px] font-bold uppercase tracking-widest">MDS Academy · U14 Boys</p>
              <div className="w-5 h-5 rounded-full bg-[#22c55e] flex items-center justify-center text-black font-extrabold" style={{ fontSize: 7 }}>RC</div>
            </div>
          </div>
          {/* Event card */}
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #161616' }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[#666] text-[8px] font-bold uppercase tracking-widest mb-0.5">Sat 5 Jul · 10:00am</p>
                <p className="text-white font-extrabold text-[13px] leading-tight">vs Maroons SC</p>
                <p className="text-[#666] text-[9px] mt-0.5">Riverside Park · Home kit</p>
              </div>
              <span className="text-[8px] font-bold text-[#22c55e] flex-shrink-0"
                style={{ background: '#22c55e10', border: '1px solid #22c55e20', padding: '2px 7px', borderRadius: 99 }}>
                2 days
              </span>
            </div>
            <div className="mt-3">
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-white font-bold text-[10px]">Squad availability</span>
                <span className="text-[#22c55e] font-extrabold text-[10px]">11 / 14</span>
              </div>
              <AnimatedBar total={14} filled={11} />
            </div>
          </div>
          {/* Player list */}
          <div className="px-4 py-3">
            <p className="text-[#444] text-[8px] font-bold uppercase tracking-widest mb-2">Recent RSVPs</p>
            <div className="flex flex-col gap-1.5">
              {[
                { init: 'SM', name: 'Sarah M.',  yes: true  },
                { init: 'DP', name: 'David P.',  yes: true  },
                { init: 'RK', name: 'Ryan K.',   yes: false },
                { init: 'EL', name: 'Ethan L.',  yes: true  },
                { init: 'LT', name: 'Lisa T.',   yes: true  },
              ].map((p) => (
                <div key={p.init} className="flex items-center gap-2 py-1.5 px-2.5 rounded-xl"
                  style={{ background: '#111', border: '1px solid #181818' }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ fontSize: 7, fontWeight: 800,
                      ...(p.yes
                        ? { background: '#0e2016', border: '1px solid #22c55e22', color: '#22c55e' }
                        : { background: '#1e0f0f', border: '1px solid #f8717122', color: '#f87171' }) }}>
                    {p.init}
                  </div>
                  <span className="text-[#aaa] flex-1" style={{ fontSize: 10 }}>{p.name}</span>
                  <span className="font-bold flex-shrink-0"
                    style={{ fontSize: 9, color: p.yes ? '#22c55e' : '#f87171' }}>
                    {p.yes ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {/* Lock footer */}
          <div className="px-4 py-2.5 flex items-center justify-between"
            style={{ background: '#090909', borderTop: '1px solid #141414' }}>
            <span style={{ fontSize: 9, color: '#555' }}>RSVPs close in</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#555' }}>14h 23m</span>
          </div>
          {/* Tab bar */}
          <div className="flex justify-around items-center py-2" style={{ borderTop: '1px solid #1a1a1a', background: '#0a0a0a' }}>
            {[
              { label: 'Home', active: false },
              { label: 'Schedule', active: true },
              { label: 'Roster', active: false },
              { label: 'Chat', active: false },
            ].map((t) => (
              <div key={t.label} className="flex flex-col items-center gap-0.5">
                <div className="w-4 h-0.5 rounded-full" style={{ background: t.active ? '#22c55e' : 'transparent' }} />
                <span style={{ fontSize: 7, fontWeight: 700, color: t.active ? '#22c55e' : '#333' }}>{t.label}</span>
              </div>
            ))}
          </div>
        </PhoneFrame>
        </div>
        <div className="flex flex-col gap-3 sm:pt-6 w-full sm:flex-1 sm:min-w-0">
          {/* Live headcount */}
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #1e1e1e' }}>
            <p className="text-[#888] text-[10px] font-bold uppercase tracking-widest mb-2.5">Live headcount</p>
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className="text-white font-extrabold text-[28px] leading-none">11</span>
              <span className="text-[#555] text-[16px] font-medium">/14</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: '#1a1a1a' }}>
              <div className="h-full rounded-full" style={{ width: '79%', background: '#22c55e' }} />
            </div>
            <p className="text-[#888] text-[10px]">10 going · 1 out · 3 no reply</p>
          </div>
          {/* Auto-lock */}
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #1e1e1e' }}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[#888] text-[10px] font-bold uppercase tracking-widest">Auto-lock</p>
              <span className="text-[10px] font-bold text-[#22c55e]" style={{ background: '#22c55e10', border: '1px solid #22c55e20', padding: '1px 7px', borderRadius: 99 }}>Active</span>
            </div>
            <p className="text-white font-bold text-[13px] mb-0.5">Closes in 14h 23m</p>
            <p className="text-[#888] text-[11px]">Sat 5 Jul · 8:00am — 2hrs before kickoff</p>
          </div>
          {/* Push notification preview */}
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #1e1e1e' }}>
            <p className="text-[#888] text-[10px] font-bold uppercase tracking-widest mb-2.5">Push notification sent</p>
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: '#22c55e', fontSize: 12 }}>⚽</div>
              <div>
                <p className="text-white text-[11px] font-bold mb-0.5">Are you coming Saturday?</p>
                <p className="text-[#888] text-[10px] leading-relaxed">vs Maroons SC · 10:00am · Riverside Park</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    n: '03',
    title: 'Build your lineup in seconds, not 45 minutes.',
    body: 'Drag your confirmed players onto a pitch. AI suggests a starting lineup based on positions and who\'s confirmed. Tap Equal Time and it instantly tells you the target minutes per player and how often to rotate. Hand the board over at kickoff.',
    checks: ['4v4, 7v7, 9v9, and 11v11 formations', 'Only shows confirmed RSVPs', 'Equal playing time — instant, no AI needed'],
    visual: (
      <div className="flex flex-col items-center sm:flex-row sm:items-start gap-5">
        <LineupBuilder />
        <div className="flex flex-col gap-3 sm:pt-6 w-full sm:flex-1 sm:min-w-0">
          {/* AI suggest card */}
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #1e1e1e' }}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] font-bold" style={{ color: '#E879A0' }}>✦ AI Suggested</span>
            </div>
            <p className="text-white font-bold text-[13px] mb-1">4-3-3 Classic</p>
            <p className="text-[#888] text-[11px] leading-relaxed">11 players placed by position from 13 confirmed RSVPs.</p>
          </div>
          {/* Equal time card */}
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #1e1e1e' }}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[11px] font-bold text-[#888]">⏱ Equal Time</span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-white font-extrabold text-[26px] leading-none" style={{ color: '#E879A0' }}>18'</span>
              <span className="text-[#888] text-[11px]">per player</span>
            </div>
            <p className="text-[#888] text-[11px]">Sub every 9 min · 13 players · 80 min game</p>
          </div>
          {/* Confirmed count */}
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #1e1e1e' }}>
            <p className="text-[#888] text-[10px] font-bold uppercase tracking-widest mb-2">Availability</p>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-white font-extrabold text-[22px] leading-none">13</span>
              <span className="text-[#555] text-[14px] font-medium">/15</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1a1a' }}>
              <div className="h-full rounded-full" style={{ width: '87%', background: '#22c55e' }} />
            </div>
            <p className="text-[#888] text-[10px] mt-1.5">confirmed · 2 no reply</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    n: '04',
    title: 'One channel for everything. Zero noise.',
    body: 'Team chat for real-time conversation. Announcements for anything that matters — coaches post, parents read, and an email goes out automatically. Direct messages for 1:1 with any parent. No more screenshot-forwarding between WhatsApp groups.',
    checks: ['Team chat, announcements, and direct messages', 'Email blast from inside the app', 'Coaches control what parents can see'],
    visual: (
      <div className="rounded-2xl overflow-hidden" style={{ background: '#0c0c0c', border: '1px solid #181818' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #161616', background: '#0a0a0a' }}>
          <div className="flex gap-3 mb-0">
            {['Team Chat', 'Announcements', 'Direct'].map((tab, i) => (
              <span key={tab} className="text-[10px] font-bold pb-2"
                style={{ color: i === 1 ? '#22c55e' : '#444', borderBottom: i === 1 ? '2px solid #22c55e' : '2px solid transparent' }}>
                {tab}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col divide-y divide-[#111]">
          {[
            { title: 'Saturday game — field change', body: 'Game moved to Riverside South. Same time. Arrive by 9:15.', time: '7:42 PM', pinned: true },
            { title: 'Home kit this week', body: 'Green tops, black shorts. Coaches will have spare bibs if needed.', time: 'Yesterday', pinned: false },
            { title: 'Tournament permission slips', body: 'Digital form sent to all parents. Deadline Friday 5pm.', time: 'Mon', pinned: false },
          ].map((a, i) => (
            <div key={i} className="px-4 py-3.5 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5"
                style={{ background: '#0e2016', border: '1px solid #22c55e20' }}>
                <span style={{ fontSize: 10 }}>📢</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-white text-[11px] font-bold truncate">{a.title}</p>
                  <span className="text-[#444] text-[9px] flex-shrink-0">{a.time}</span>
                </div>
                <p className="text-[#666] text-[10px] leading-relaxed line-clamp-2">{a.body}</p>
              </div>
              {a.pinned && (
                <span className="text-[8px] font-bold text-[#22c55e] flex-shrink-0 mt-1"
                  style={{ background: '#22c55e10', border: '1px solid #22c55e20', padding: '1px 6px', borderRadius: 99 }}>
                  PINNED
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid #111', background: '#090909' }}>
          <div className="flex-1 rounded-xl px-3 py-2 text-[10px] text-[#444]"
            style={{ background: '#111', border: '1px solid #1a1a1a' }}>
            Post an announcement…
          </div>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#22c55e10', border: '1px solid #22c55e20' }}>
            <span style={{ fontSize: 10 }}>✉️</span>
          </div>
        </div>
      </div>
    ),
  },
];

export const revalidate = 3600;

export default async function Home() {
  const { count } = await supabaseAdmin()
    .from('clubs')
    .select('*', { count: 'exact', head: true });
  const displayCount = Math.min((count ?? 0) + 31, 49);
  const remaining = 50 - displayCount;
  const barWidth = Math.round((displayCount / 50) * 100);

  const totalValue = valueStack.reduce((s, v) => s + v.value, 0);

  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]">

      {/* Nav */}
      <NavBar />

      {/* Hero */}
      <section className="px-6 sm:px-10 pt-14 pb-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-16 items-center">

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
              Pulse FC gives Directors of Coaching a professional platform for every team, every schedule, every parent, and every communication — set up in 20 minutes.
            </p>
            <p className="text-[#888] text-[15px] leading-relaxed mb-10 max-w-md">
              No more WhatsApp chaos. No more schedule spreadsheets. No more chasing RSVPs the night before a game.
            </p>

            <div className="flex flex-wrap gap-3 mb-8">
              <Link href="/onboarding"
                className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[15px] px-7 py-3.5 rounded-xl hover:bg-[#1db954] transition-colors">
                Add your club free →
              </Link>
              <a href="#how"
                className="inline-flex items-center gap-2 text-[#888] text-[15px] font-medium px-7 py-3.5 rounded-xl border border-[#222] hover:border-[#2e2e2e] hover:text-[#bbb] transition-all">
                See how it works
              </a>
            </div>

            <p className="text-[#888] text-[12px] mb-8">Free for 1 team · No credit card · 20-minute setup · 30-day money-back guarantee</p>

            <div className="flex items-center gap-3">
              <p className="text-[#888] text-[12px] font-medium">Now live on the App Store</p>
              <a href="https://apps.apple.com/app/id6784509100" target="_blank" rel="noopener noreferrer">
                <img src="/app-store-badge.svg" alt="Download on the App Store" style={{ height: '36px', width: 'auto' }} />
              </a>
            </div>
          </div>

          {/* Right — App Mockup */}
          <div className="hidden lg:flex justify-center">
            <AppMockup />
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
        <div className="mb-16 max-w-2xl">
          <p className="text-[#888] text-[11px] font-bold uppercase tracking-[0.18em] mb-5">Sound familiar?</p>
          <h2 className="font-extrabold text-white leading-tight tracking-tight"
            style={{ fontSize: 'clamp(28px, 4vw, 52px)' }}>
            You built something real.<br />Your tools haven't kept up.
          </h2>
          <div className="mt-8 flex flex-col gap-4">
            {[
              { icon: '📱', pain: 'Thursday night. 31 unread messages. "What time?" "Which field?" "What kit?" Same questions. Every week.' },
              { icon: '📍', pain: 'Game day: two families show at the wrong field. Your schedule PDF is three updates out of date.' },
              { icon: '📋', pain: 'Tryout season: player info across four spreadsheets, three email chains, and a notebook you can\'t find.' },
              { icon: '❓', pain: 'Lineup day: you\'re guessing who RSVP\'d because half texted you and half texted the assistant.' },
            ].map(({ icon, pain }) => (
              <div key={pain} className="flex items-start gap-4 p-4 rounded-xl"
                style={{ background: '#111', border: '1px solid #232323' }}>
                <span className="text-[20px] flex-shrink-0 mt-0.5">{icon}</span>
                <p className="text-[#999] text-[14px] leading-relaxed">{pain}</p>
              </div>
            ))}
          </div>
          <p className="text-[#888] text-[14px] mt-6 italic">This is what it looks like to run a professional club on tools built for something else.</p>
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

      {/* Features */}
      <section id="how" style={{ borderTop: '1px solid #111' }}>
        {features.map((f, i) => (
          <div key={f.n} style={{ borderBottom: '1px solid #0f0f0f', background: i % 2 === 1 ? '#060606' : 'transparent' }}>
            <div className="max-w-7xl mx-auto px-6 sm:px-10 py-20 grid lg:grid-cols-2 gap-14 xl:gap-20 items-center">
              <Reveal className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <div className="font-extrabold leading-none mb-6 select-none tracking-tight"
                  style={{ fontSize: 'clamp(48px, 5vw, 72px)', color: '#1e1e1e', fontVariantNumeric: 'tabular-nums' }}>
                  {f.n}
                </div>
                <h2 className="font-extrabold text-white leading-tight mb-5 tracking-tight"
                  style={{ fontSize: 'clamp(22px, 2.6vw, 32px)' }}>
                  {f.title}
                </h2>
                <p className="text-[#999] text-[17px] leading-[1.75] mb-8">{f.body}</p>
                <div className="flex flex-col gap-3">
                  {f.checks.map((c) => (
                    <div key={c} className="flex items-start gap-3 text-[13px] text-[#aaa] font-medium">
                      <span className="text-[#22c55e] font-extrabold text-[10px] mt-1 flex-shrink-0">✓</span>
                      {c}
                    </div>
                  ))}
                </div>
              </Reveal>
              <Reveal delay={150} className={i % 2 === 1 ? 'lg:order-1' : ''}>
                {f.visual}
              </Reveal>
            </div>
          </div>
        ))}
      </section>

      {/* Value Stack */}
      <section style={{ borderTop: '1px solid #111', background: '#060606' }}
        className="px-6 sm:px-10 py-24">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <p className="text-[#888] text-[11px] font-bold uppercase tracking-[0.18em] mb-4">Everything included</p>
            <h2 className="font-extrabold text-white leading-tight mb-4 tracking-tight"
              style={{ fontSize: 'clamp(26px, 3.5vw, 44px)' }}>
              Here's what you get when<br />you add your club.
            </h2>
            <p className="text-[#888] text-[16px] mb-12">Every feature. No add-ons. No upsells for things that should be included.</p>

            <div className="flex flex-col gap-3 mb-10">
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
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[#888] text-[11px] line-through">${item.value}/mo</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl p-6" style={{ background: '#0a1a0a', border: '1px solid #22c55e20' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[#888] text-[14px]">Total value if bought separately</p>
                <p className="text-[#888] text-[18px] font-extrabold line-through">${totalValue}/mo</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-white font-extrabold text-[16px]">You pay with Pulse FC</p>
                <div className="text-right">
                  <p className="text-[#22c55e] font-extrabold text-[26px] leading-none">From $49<span className="text-[16px]">/mo</span></p>
                  <p className="text-[#22c55e] text-[11px] opacity-60">or free for 1 team</p>
                </div>
              </div>
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
              The 30-Day "Get Your<br />Evenings Back" Guarantee.
            </h2>
            <p className="text-[#999] text-[17px] leading-[1.75] mb-6">
              Set up your club tonight. Run it for 30 days.
            </p>
            <p className="text-[#999] text-[17px] leading-[1.75] mb-6">
              If Pulse FC doesn't save you at least <span className="text-white font-semibold">3 hours a week on admin</span> — or if you don't love it for any reason at all — email us and we'll refund every cent.
            </p>
            <p className="text-[#999] text-[17px] leading-[1.75]">
              No forms. No arguing. No questions. One email and it's done.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <div className="flex flex-col gap-5">
              {[
                { title: 'Zero risk setup', body: 'Free plan for 1 team, up to 12 players. No credit card needed to get started.' },
                { title: 'Cancel any time', body: 'Month to month. No contracts. Leave whenever you want, keep your data.' },
                { title: '30-day full refund', body: 'Not saving time in the first 30 days? Email info@pulse-fc.app. Refunded immediately.' },
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
              that coaches could actually use, and that didn't need a 45-minute setup call.
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
          <h2 className="font-extrabold text-white leading-[0.95] tracking-tight mb-6 max-w-3xl mx-auto"
            style={{ fontSize: 'clamp(36px, 5.5vw, 68px)' }}>
            Your club deserves better<br />than a WhatsApp group.
          </h2>
          <p className="text-[#888] text-[18px] mb-4 max-w-lg mx-auto font-medium leading-relaxed">
            20 minutes to set up. A season's worth of evenings back.
          </p>
          <p className="text-[#888] text-[14px] mb-12">Risk-free. 30-day money-back guarantee.</p>
          <p className="text-[#555] text-[14px] italic mb-8 max-w-md mx-auto">
            Worst case: 20 minutes and it&rsquo;s not for you.<br />Best case: you never answer &ldquo;what time?&rdquo; again.
          </p>
          <Link href="/onboarding"
            className="inline-flex items-center gap-2 bg-[#22c55e] text-black font-bold text-[16px] px-10 py-4 rounded-2xl hover:bg-[#1db954] transition-colors">
            Add your club free →
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
        <img src="/logo.png" alt="Pulse FC" style={{ height: '36px', width: 'auto' }} />
        
        <div className="flex items-center gap-6">
          <Link href="/pricing" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Pricing</Link>
          <Link href="/compare" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Compare</Link>
          <Link href="/privacy" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Privacy</Link>
          <Link href="/terms" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Terms</Link>
          <Link href="/dashboard" className="text-[#888] text-[12px] hover:text-[#bbb] transition-colors">Coach Login</Link>
          <a href="https://apps.apple.com/app/id6784509100" target="_blank" rel="noopener noreferrer" className="hidden sm:block">
            <img src="/app-store-badge.svg" alt="Download on the App Store" style={{ height: '28px', width: 'auto' }} />
          </a>
        </div>
      </footer>

    </div>
  );
}
