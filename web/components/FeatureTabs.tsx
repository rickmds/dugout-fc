'use client';

import { useState, useEffect } from 'react';
import PhoneFrame from '@/components/PhoneFrame';
import AnimatedBar from '@/components/AnimatedBar';
import LineupBuilder from '@/components/LineupBuilder';

const INTERVAL = 5000;

const scheduleGames = [
  { date: 'Sat 5 Jul',  time: '10:00', opp: 'Riverside Utd', venue: 'Riverside Park',    type: 'Game'     },
  { date: 'Sat 12 Jul', time: '11:30', opp: 'Northgate FC',  venue: 'Northgate Sports',  type: 'Game'     },
  { date: 'Sat 19 Jul', time: '09:00', opp: 'Valley Eagles', venue: 'Valley Rec. Ctr',   type: 'Game'     },
  { date: 'Sat 23 Jul', time: '17:00', opp: 'Training',      venue: 'Home Field',        type: 'Training' },
  { date: 'Sat 26 Jul', time: '14:00', opp: 'Westfield SC',  venue: 'Main Street Field', type: 'Game'     },
];

const tabDefs = [
  {
    id: 'schedule',
    icon: '📅',
    label: 'Schedule import',
    subtitle: 'Season set up in under a minute',
    accent: '#E879A0',
    ai: true,
    checks: ['Any PDF, image, or spreadsheet', 'Flags uncertain rows for review', 'One-click confirm and you\'re live'],
    visual: (
      <div className="rounded-2xl overflow-hidden" style={{ background: '#0c0c0c', border: '1px solid #181818' }}>
        <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #161616', background: '#0a0a0a' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#141414', border: '1px solid #202020' }}>
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
          <span className="text-[10px] font-bold text-[#22c55e] px-2.5 py-1 rounded-lg" style={{ background: '#22c55e10', border: '1px solid #22c55e20' }}>Confirmed</span>
        </div>
        {/* Desktop / tablet — table */}
        <div className="hidden sm:grid px-4 py-2" style={{ gridTemplateColumns: '90px 48px 1fr 60px', gap: '0 8px', borderBottom: '1px solid #111' }}>
          {['Date', 'Time', 'Opponent / Venue', 'Type'].map(h => (
            <span key={h} className="text-[9px] font-bold uppercase tracking-widest text-[#888]">{h}</span>
          ))}
        </div>
        <div className="hidden sm:flex flex-col divide-y divide-[#111]">
          {scheduleGames.map((g, i) => (
            <div key={i} className="grid items-center px-4 py-2.5" style={{ gridTemplateColumns: '90px 48px 1fr 60px', gap: '0 8px' }}>
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
        {/* Mobile — stacked cards */}
        <div className="sm:hidden flex flex-col divide-y divide-[#111]">
          {scheduleGames.map((g, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[#888] text-[10px] font-mono mb-1">{g.date} · {g.time}</p>
                <p className="text-white text-[13px] font-semibold truncate leading-tight">{g.opp}</p>
                <p className="text-[#888] text-[11px] truncate">{g.venue}</p>
              </div>
              <span className="text-[9.5px] font-bold px-2 py-1 rounded-md text-center flex-shrink-0"
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
    id: 'rsvp',
    icon: '✅',
    label: 'RSVP & attendance',
    subtitle: 'Know exactly who\'s coming',
    accent: '#22c55e',
    ai: false,
    checks: ['Attending or Not Attending — no maybes', 'RSVP auto-locks before game time', 'Parents notified instantly if child absent'],
    visual: (
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex-shrink-0 flex justify-center">
          <PhoneFrame>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #161616', background: '#0a0a0a' }}>
              <div className="flex items-center justify-between">
                <p className="text-[#555] text-[9px] font-bold uppercase tracking-widest">MDS Academy · U14 Boys</p>
                <div className="w-5 h-5 rounded-full bg-[#22c55e] flex items-center justify-center text-black font-extrabold" style={{ fontSize: 7 }}>RC</div>
              </div>
            </div>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #161616' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[#666] text-[8px] font-bold uppercase tracking-widest mb-0.5">Sat 5 Jul · 10:00am</p>
                  <p className="text-white font-extrabold text-[13px] leading-tight">vs Maroons SC</p>
                  <p className="text-[#666] text-[9px] mt-0.5">Riverside Park · Home kit</p>
                </div>
                <span className="text-[8px] font-bold text-[#22c55e] flex-shrink-0" style={{ background: '#22c55e10', border: '1px solid #22c55e20', padding: '2px 7px', borderRadius: 99 }}>2 days</span>
              </div>
              <div className="mt-3">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-white font-bold text-[10px]">Squad availability</span>
                  <span className="text-[#22c55e] font-extrabold text-[10px]">11 / 14</span>
                </div>
                <AnimatedBar total={14} filled={11} />
              </div>
            </div>
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
                  <div key={p.init} className="flex items-center gap-2 py-1.5 px-2.5 rounded-xl" style={{ background: '#111', border: '1px solid #181818' }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ fontSize: 7, fontWeight: 800, ...(p.yes ? { background: '#0e2016', border: '1px solid #22c55e22', color: '#22c55e' } : { background: '#1e0f0f', border: '1px solid #f8717122', color: '#f87171' }) }}>
                      {p.init}
                    </div>
                    <span className="text-[#aaa] flex-1" style={{ fontSize: 10 }}>{p.name}</span>
                    <span className="font-bold flex-shrink-0" style={{ fontSize: 9, color: p.yes ? '#22c55e' : '#f87171' }}>{p.yes ? '✓' : '✗'}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: '#090909', borderTop: '1px solid #141414' }}>
              <span style={{ fontSize: 9, color: '#555' }}>RSVPs close in</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#555' }}>14h 23m</span>
            </div>
          </PhoneFrame>
        </div>
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #22c55e30' }}>
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
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #22c55e30' }}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[#888] text-[10px] font-bold uppercase tracking-widest">Auto-lock</p>
              <span className="text-[10px] font-bold text-[#22c55e]" style={{ background: '#22c55e10', border: '1px solid #22c55e20', padding: '1px 7px', borderRadius: 99 }}>Active</span>
            </div>
            <p className="text-white font-bold text-[13px] mb-0.5">Closes in 14h 23m</p>
            <p className="text-[#888] text-[11px]">Sat 5 Jul · 8:00am — 2 hrs before kickoff</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #22c55e30' }}>
            <p className="text-[#888] text-[10px] font-bold uppercase tracking-widest mb-2.5">Push sent</p>
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: '#22c55e', fontSize: 12 }}>⚽</div>
              <div>
                <p className="text-white text-[11px] font-bold mb-0.5">Are you coming Saturday?</p>
                <p className="text-[#888] text-[10px]">vs Maroons SC · 10:00am · Riverside Park</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'lineup',
    icon: '⚽',
    label: 'Lineup builder',
    subtitle: 'Built in seconds, not 45 minutes',
    accent: '#E879A0',
    ai: true,
    checks: ['Only shows confirmed RSVPs', 'AI suggests lineup by position', 'Equal time calculator — instant, offline'],
    visual: (
      <div className="flex flex-col sm:flex-row gap-6">
        <LineupBuilder />
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #E879A030' }}>
            <span className="text-[11px] font-bold" style={{ color: '#E879A0' }}>✦ AI Suggested</span>
            <p className="text-white font-bold text-[13px] mt-2 mb-1">4-3-3 Classic</p>
            <p className="text-[#888] text-[11px]">11 players placed from 13 confirmed RSVPs.</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #E879A030' }}>
            <span className="text-[11px] font-bold text-[#888]">⏱ Equal Time</span>
            <div className="flex items-baseline gap-1.5 mt-2 mb-1">
              <span className="font-extrabold text-[26px] leading-none" style={{ color: '#E879A0' }}>18&prime;</span>
              <span className="text-[#888] text-[11px]">per player</span>
            </div>
            <p className="text-[#888] text-[11px]">Sub every 9 min · 13 players · 80 min game</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #E879A030' }}>
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
    id: 'chat',
    icon: '💬',
    label: 'Team communications',
    subtitle: 'One channel, zero noise',
    accent: '#22c55e',
    ai: false,
    checks: ['Team chat, announcements, and DMs in one tab', 'Email blast from inside the app', 'Coaches control what parents see'],
    visual: (
      <div className="rounded-2xl overflow-hidden" style={{ background: '#0c0c0c', border: '1px solid #181818' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #161616', background: '#0a0a0a' }}>
          <div className="flex gap-3">
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
              <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: '#0e2016', border: '1px solid #22c55e20' }}>
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
                <span className="text-[8px] font-bold text-[#22c55e] flex-shrink-0 mt-1" style={{ background: '#22c55e10', border: '1px solid #22c55e20', padding: '1px 6px', borderRadius: 99 }}>PINNED</span>
              )}
            </div>
          ))}
        </div>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid #111', background: '#090909' }}>
          <div className="flex-1 rounded-xl px-3 py-2 text-[10px] text-[#444]" style={{ background: '#111', border: '1px solid #1a1a1a' }}>Post an announcement…</div>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#22c55e10', border: '1px solid #22c55e20' }}>
            <span style={{ fontSize: 10 }}>✉️</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'matchday',
    icon: '🏃',
    label: 'Match day',
    subtitle: 'Run the match from your phone',
    accent: '#22c55e',
    ai: false,
    checks: ['Live timer with real-time sub tracking', 'Equal time calculator — works offline', 'Log scores · season record auto-updates'],
    visual: (
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="mx-auto sm:mx-0" style={{ flexShrink: 0, width: 168 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <div style={{ position: 'absolute', inset: -16, background: 'radial-gradient(ellipse at 50% 45%, rgba(34,197,94,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <img src="/screenshots/match-trackerTB-crop.png" alt="Match tracker" style={{ position: 'relative', width: '100%', display: 'block', filter: 'drop-shadow(0 16px 40px rgba(0,0,0,0.6))' }} />
          </div>
        </div>
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #22c55e30' }}>
            <p className="text-[#888] text-[10px] font-bold uppercase tracking-widest mb-2">Live match timer</p>
            <span className="font-extrabold text-[32px] leading-none font-mono" style={{ color: '#22c55e' }}>63:54</span>
            <p className="text-[#888] text-[11px] mt-1">2nd half · 3 subs made · 2 remaining</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #22c55e30' }}>
            <p className="text-[#888] text-[10px] font-bold uppercase tracking-widest mb-2">Equal playing time</p>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="font-extrabold text-[26px] leading-none" style={{ color: '#E879A0' }}>18&prime;</span>
              <span className="text-[#888] text-[11px]">target per player</span>
            </div>
            <p className="text-[#888] text-[11px]">Sub every 9 min · 13 players · 80 min game</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#0e0e0e', border: '1px solid #22c55e30' }}>
            <p className="text-[#888] text-[10px] font-bold uppercase tracking-widest mb-2.5">Season record</p>
            <div className="flex gap-5">
              {[{ v: '8', l: 'Won', c: '#22c55e' }, { v: '2', l: 'Lost', c: '#f87171' }, { v: '1', l: 'Drawn', c: '#888' }].map(({ v, l, c }) => (
                <div key={l} className="text-center">
                  <p className="font-extrabold text-[22px] leading-none mb-0.5" style={{ color: c }}>{v}</p>
                  <p className="text-[#555] text-[10px] font-bold">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

export default function FeatureTabs() {
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActive(i => (i + 1) % tabDefs.length);
    }, INTERVAL);
    return () => clearInterval(t);
  }, [tick]);

  const select = (i: number) => {
    setActive(i);
    setTick(c => c + 1);
  };

  const tab = tabDefs[active];

  return (
    <section id="how" style={{ borderTop: '1px solid #111', position: 'relative', overflow: 'hidden' }}>
      {/* Ambient section wash — blurred solid blobs, no gradient banding. Smaller + softer on mobile so it doesn't wash out the text. */}
      <div className="absolute rounded-full pointer-events-none w-[140px] h-[140px] opacity-[0.08] blur-[60px] sm:w-[340px] sm:h-[340px] sm:opacity-[0.14] sm:blur-[120px]" style={{
        top: -20, left: '4%', background: '#22c55e', zIndex: 0,
        animation: 'ambientPulse 8s ease-in-out infinite',
      }} />
      <div className="absolute rounded-full pointer-events-none w-[140px] h-[140px] opacity-[0.07] blur-[60px] sm:w-[340px] sm:h-[340px] sm:opacity-[0.13] sm:blur-[120px]" style={{
        bottom: -20, right: '3%', background: '#E879A0', zIndex: 0,
        animation: 'ambientPulse 8s ease-in-out infinite 4s',
      }} />
      <div className="max-w-7xl mx-auto px-5 sm:px-10 py-16 sm:py-24" style={{ position: 'relative', zIndex: 1 }}>

        <div className="mb-14 max-w-2xl">
          <div className="inline-flex items-center gap-2.5 text-[#22c55e] text-[11px] font-bold border border-[#22c55e25] bg-[#22c55e0a] px-3.5 py-1.5 rounded-full mb-6 uppercase tracking-[0.16em]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse flex-shrink-0" />
            How it works
          </div>
          <h2 className="font-extrabold text-white leading-tight tracking-tight mb-4" style={{ fontSize: 'clamp(28px, 3.5vw, 48px)' }}>
            Everything your club needs. <br className="hidden sm:inline" />None of the <span style={{ color: '#22c55e' }}>chaos</span>.
          </h2>
          <p className="text-[#888] text-[15px] leading-relaxed">
            Five tools, one app — <span style={{ color: '#E879A0', fontWeight: 700 }}>two of them powered by AI</span>. Tap through to see exactly what your coaches and parents will use every week.
          </p>
        </div>

        {/* Mobile: horizontal scroll tabs */}
        <div className="flex lg:hidden gap-2 overflow-x-auto pb-3 mb-6" style={{ scrollbarWidth: 'none' }}>
          {tabDefs.map((t, i) => (
            <button key={t.id} onClick={() => select(i)}
              className="flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-bold transition-all"
              style={{
                background: active === i ? `${t.accent}14` : '#111',
                color: active === i ? t.accent : '#666',
                border: `1px solid ${active === i ? `${t.accent}40` : '#1e1e1e'}`,
              }}>
              <span>{t.icon}</span>
              <span className="whitespace-nowrap">{t.label}</span>
              {t.ai && (
                <span className="text-[8px] font-extrabold px-1 py-[2px] rounded flex-shrink-0 leading-none" style={{
                  color: active === i ? t.accent : '#E879A0', background: active === i ? `${t.accent}20` : '#E879A01a',
                }}>AI</span>
              )}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-6 items-start">

          {/* Left — sticky tab list (desktop) */}
          <div className="hidden lg:flex flex-col gap-2 sticky top-24">
            {tabDefs.map((t, i) => (
              <button key={t.id} onClick={() => select(i)}
                className={`text-left relative overflow-hidden rounded-2xl px-4 py-4 transition-all duration-200 ${active === i ? '' : 'hover:bg-white/[0.03]'}`}
                style={{
                  background: active === i ? `linear-gradient(135deg, ${t.accent}22, ${t.accent}06)` : 'transparent',
                  border: `1px solid ${active === i ? `${t.accent}55` : '#181818'}`,
                  boxShadow: active === i ? `0 12px 32px -10px ${t.accent}70, inset 0 1px 0 ${t.accent}20` : 'none',
                  transform: active === i ? 'translateX(3px)' : 'none',
                }}>
                {/* Left accent bar */}
                <div style={{
                  position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2,
                  background: active === i ? t.accent : 'transparent',
                  boxShadow: active === i ? `0 0 14px ${t.accent}` : 'none',
                }} />
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-[10px] flex-shrink-0 w-4 text-center" style={{ color: active === i ? t.accent : '#333' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      background: `${t.accent}${active === i ? '2a' : '14'}`,
                      border: `1px solid ${t.accent}${active === i ? '55' : '2e'}`,
                    }}>
                    <span style={{ fontSize: 15 }}>{t.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="font-bold text-[13px] leading-none truncate" style={{ color: active === i ? '#fff' : '#aaa' }}>
                        {t.label}
                      </p>
                      {t.ai && (
                        <span className="text-[8px] font-extrabold px-1.5 py-[3px] rounded-md flex-shrink-0 leading-none" style={{
                          color: '#E879A0', background: '#E879A01e', border: '1px solid #E879A045', letterSpacing: '0.05em',
                        }}>AI</span>
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: active === i ? '#aaa' : '#555' }}>{t.subtitle}</p>
                  </div>
                </div>
                {/* Expanded checks when active */}
                {active === i && (
                  <div className="mt-3 pl-16 flex flex-col gap-1.5" style={{ animation: 'tabFadeIn 0.25s ease' }}>
                    {t.checks.map(c => (
                      <div key={c} className="flex items-start gap-2 text-[11px]" style={{ color: '#aaa' }}>
                        <span className="text-[9px] mt-0.5 flex-shrink-0" style={{ color: t.accent }}>✓</span>
                        {c}
                      </div>
                    ))}
                  </div>
                )}
                {/* Progress bar */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'transparent' }}>
                  {active === i && (
                    <div key={`${i}-${tick}`}
                      style={{ height: '100%', background: t.accent, width: 0, animation: `tabProgress ${INTERVAL}ms linear forwards`, boxShadow: `0 0 8px ${t.accent}` }} />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Right — visual panel */}
          <div style={{ position: 'relative' }}>
            {/* Blurred solid blob — smooth falloff, no gradient banding */}
            <div key={`glow-${active}`} style={{
              position: 'absolute', top: '5%', left: '10%', width: '55%', height: '65%', borderRadius: '50%',
              background: tab.accent, opacity: 0.28, filter: 'blur(90px)', pointerEvents: 'none', zIndex: 0,
              animation: 'tabFadeIn 0.4s ease',
            }} />
            <div className="rounded-2xl p-3 sm:p-6 lg:p-8 relative overflow-hidden" style={{
              background: '#0a0a0a', border: `1px solid ${tab.accent}45`, minHeight: 480, zIndex: 1,
              boxShadow: `0 24px 60px -30px ${tab.accent}55`,
            }}>
              {/* Top beam */}
              <div style={{
                position: 'absolute', top: 0, left: 24, right: 24, height: 2, borderRadius: 2,
                background: `linear-gradient(90deg, transparent, ${tab.accent}, transparent)`,
              }} />
              <div key={active} style={{ animation: 'tabFadeIn 0.3s ease' }}>
                {tab.visual}
              </div>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes tabProgress {
          from { width: 0; }
          to { width: 100%; }
        }
        @keyframes tabFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ambientPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.12); }
        }
      `}</style>
    </section>
  );
}
