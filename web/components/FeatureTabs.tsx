'use client';

import { useState, useEffect } from 'react';
import { theme } from '@/lib/theme';

const INTERVAL = 5000;

// Every tab below shows a real screenshot from Harbor City FC, a fully
// fictional demo club seeded for exactly this purpose — no hand-drawn
// mock UI standing in for what the app actually looks like, and no real
// club's data. The side-card stats are taken directly from what's visible
// in that same screenshot, not invented separately.
function Screenshot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mx-auto sm:mx-0" style={{ flexShrink: 0, width: 168 }}>
      <div style={{ position: 'relative', width: '100%' }}>
        <div style={{ position: 'absolute', inset: -16, background: 'radial-gradient(ellipse at 50% 45%, rgba(63,168,107,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public */}
        <img src={src} alt={alt} style={{ position: 'relative', width: '100%', display: 'block', filter: 'drop-shadow(0 16px 40px rgba(0,0,0,0.5))' }} />
      </div>
    </div>
  );
}

const tabDefs = [
  {
    id: 'schedule',
    icon: '📅',
    label: 'Schedule import',
    subtitle: 'Season set up in under a minute',
    accent: '#C9962F',
    ai: true,
    checks: ['Any PDF, image, or spreadsheet', 'Flags uncertain rows for review', 'One-click confirm and you\'re live'],
    visual: (
      <div className="flex flex-col sm:flex-row gap-6">
        <Screenshot src="/screenshots/ScheduleTB.png" alt="Schedule screen with AI-imported games" />
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #C9962F30' }}>
            <span className="text-[11px] font-bold" style={{ color: '#C9962F' }}>✦ AI Import</span>
            <p className="text-[#2B2420] font-bold text-[13px] mt-2 mb-1">Season loaded from one PDF</p>
            <p className="text-[#6B6054] text-[11px]">Every training and game this season, dates/times/locations, no re-typing.</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #C9962F30' }}>
            <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest mb-2">Upcoming</p>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="font-extrabold text-[26px] leading-none text-[#2B2420]">10</span>
              <span className="text-[#6B6054] text-[11px]">events this month</span>
            </div>
            <p className="text-[#6B6054] text-[11px]">Weather and a live RSVP count shown on every card.</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #C9962F30' }}>
            <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest mb-2">Flagged for review</p>
            <p className="text-[#2B2420] font-bold text-[13px] mb-0.5">Uncertain rows, never guessed</p>
            <p className="text-[#6B6054] text-[11px]">Anything AI isn&apos;t sure about gets a coach&apos;s one-tap confirm before it&apos;s live.</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'rsvp',
    icon: '✅',
    label: 'RSVP & attendance',
    subtitle: 'Know exactly who\'s coming',
    accent: '#3FA86B',
    ai: false,
    checks: ['Attending or Not Attending — no maybes', 'RSVP auto-locks before game time', 'Coach can nudge everyone who hasn\'t replied'],
    visual: (
      <div className="flex flex-col sm:flex-row gap-6">
        <Screenshot src="/screenshots/clubsMapTB.png" alt="Event details screen with RSVP breakdown and map" />
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #3FA86B30' }}>
            <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest mb-2.5">Live headcount</p>
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className="text-[#2B2420] font-extrabold text-[28px] leading-none">9</span>
              <span className="text-[#555] text-[16px] font-medium">/16</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: '#EDE6DA' }}>
              <div className="h-full rounded-full" style={{ width: '56%', background: '#3FA86B' }} />
            </div>
            <p className="text-[#6B6054] text-[10px]">9 going · 2 can&apos;t go · 5 no reply</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #3FA86B30' }}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest">Location</p>
              <span className="text-[10px] font-bold text-[#3FA86B]" style={{ background: '#3FA86B10', border: '1px solid #3FA86B20', padding: '1px 7px', borderRadius: 99 }}>Mapped</span>
            </div>
            <p className="text-[#2B2420] font-bold text-[13px] mb-0.5">Satellite view + directions</p>
            <p className="text-[#6B6054] text-[11px]">Every event shows exactly where to go, one tap from the schedule.</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #3FA86B30' }}>
            <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest mb-2.5">Nudge non-responders</p>
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: '#3FA86B', fontSize: 12 }}>🔔</div>
              <div>
                <p className="text-[#2B2420] text-[11px] font-bold mb-0.5">5 parents haven&apos;t replied</p>
                <p className="text-[#6B6054] text-[10px]">One tap sends a push reminder to just them.</p>
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
    subtitle: 'Built in seconds, not 20 minutes',
    accent: '#C9962F',
    ai: true,
    checks: ['Only shows confirmed RSVPs', 'AI suggests lineup by position', '32 formations across 4v4 to 11v11'],
    visual: (
      <div className="flex flex-col sm:flex-row gap-6">
        <Screenshot src="/screenshots/lineupBuilderTB.png" alt="Lineup builder screen with a 3-2-3 formation" />
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #C9962F30' }}>
            <span className="text-[11px] font-bold" style={{ color: '#C9962F' }}>✦ AI Suggested</span>
            <p className="text-[#2B2420] font-bold text-[13px] mt-2 mb-1">3-2-3 Classic, 9v9</p>
            <p className="text-[#6B6054] text-[11px]">All 9 positions filled from confirmed RSVPs — drag any player to swap.</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #C9962F30' }}>
            <span className="text-[11px] font-bold text-[#6B6054]">⏱ Equal Time</span>
            <div className="flex items-baseline gap-1.5 mt-2 mb-1">
              <span className="font-extrabold text-[26px] leading-none" style={{ color: '#C9962F' }}>18&prime;</span>
              <span className="text-[#6B6054] text-[11px]">per player</span>
            </div>
            <p className="text-[#6B6054] text-[11px]">Target minutes calculated instantly — pure maths, works offline.</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #C9962F30' }}>
            <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest mb-2">Availability</p>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-[#2B2420] font-extrabold text-[22px] leading-none">9</span>
              <span className="text-[#555] text-[14px] font-medium">/9</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#EDE6DA' }}>
              <div className="h-full rounded-full" style={{ width: '100%', background: '#3FA86B' }} />
            </div>
            <p className="text-[#6B6054] text-[10px] mt-1.5">squad confirmed and ready</p>
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
    accent: '#3FA86B',
    ai: false,
    checks: ['Team chat, announcements, and DMs in one tab', 'Email blast from inside the app', 'Coaches control what parents see'],
    visual: (
      <div className="flex flex-col sm:flex-row gap-6">
        <Screenshot src="/screenshots/coachesChatTB.png" alt="Team chat screen" />
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #3FA86B30' }}>
            <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest mb-2">Coach</p>
            <p className="text-[#2B2420] text-[13px] leading-snug">&quot;Reminder: Saturday&apos;s game moved to 10am kickoff, same field.&quot;</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #3FA86B30' }}>
            <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest mb-2">Parent</p>
            <p className="text-[#2B2420] text-[13px] leading-snug">&quot;Got it, thanks coach! Jack is excited, ankle feels good this week.&quot;</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #3FA86B30' }}>
            <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest mb-2.5">One tab, three jobs</p>
            <p className="text-[#6B6054] text-[11px]">Team chat, pinned announcements, and 1:1 DMs — all in the same place every parent already has open.</p>
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
    accent: '#3FA86B',
    ai: false,
    checks: ['Live timer with real-time sub tracking', 'Equal time calculator — works offline', 'Log scores · season record auto-updates'],
    visual: (
      <div className="flex flex-col sm:flex-row gap-6">
        <Screenshot src="/screenshots/match-trackerTB-crop.png" alt="Match tracker screen, live in-game" />
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #3FA86B30' }}>
            <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest mb-2">Live match timer</p>
            <span className="font-extrabold text-[32px] leading-none font-mono" style={{ color: '#3FA86B' }}>03:57</span>
            <p className="text-[#6B6054] text-[11px] mt-1">1st half · 2-1 · 2 subs pending confirmation</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #3FA86B30' }}>
            <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest mb-2">Equal playing time</p>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="font-extrabold text-[26px] leading-none" style={{ color: '#C9962F' }}>18&prime;</span>
              <span className="text-[#6B6054] text-[11px]">target per player</span>
            </div>
            <p className="text-[#6B6054] text-[11px]">Bench shows exactly who subs in next, and when.</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid #3FA86B30' }}>
            <p className="text-[#6B6054] text-[10px] font-bold uppercase tracking-widest mb-2.5">Works offline</p>
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: '#3FA86B', fontSize: 12 }}>⚽</div>
              <div>
                <p className="text-[#2B2420] text-[11px] font-bold mb-0.5">No signal, no problem</p>
                <p className="text-[#6B6054] text-[10px]">Score and sub tracking sync the moment you&apos;re back online.</p>
              </div>
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
    <section id="how" style={{ borderTop: `1px solid ${theme.border}`, position: 'relative', overflow: 'hidden' }}>
      {/* Ambient section wash — blurred solid blobs, no gradient banding. Smaller + softer on mobile so it doesn't wash out the text. */}
      <div className="absolute rounded-full pointer-events-none w-[140px] h-[140px] opacity-[0.10] blur-[60px] sm:w-[340px] sm:h-[340px] sm:opacity-[0.16] sm:blur-[120px]" style={{
        top: -20, left: '4%', background: '#3FA86B', zIndex: 0,
        animation: 'ambientPulse 8s ease-in-out infinite',
      }} />
      <div className="absolute rounded-full pointer-events-none w-[140px] h-[140px] opacity-[0.09] blur-[60px] sm:w-[340px] sm:h-[340px] sm:opacity-[0.15] sm:blur-[120px]" style={{
        bottom: -20, right: '3%', background: '#C9962F', zIndex: 0,
        animation: 'ambientPulse 8s ease-in-out infinite 4s',
      }} />
      <div className="max-w-7xl mx-auto px-5 sm:px-10 py-16 sm:py-24" style={{ position: 'relative', zIndex: 1 }}>

        <div className="mb-14 max-w-2xl">
          <div className="inline-flex items-center gap-2.5 text-[#2F8755] text-[11px] font-bold border border-[#3FA86B40] bg-[#3FA86B14] px-3.5 py-1.5 rounded-full mb-6 uppercase tracking-[0.16em]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3FA86B] animate-pulse flex-shrink-0" />
            How it works
          </div>
          <h2
            className="font-extrabold leading-tight tracking-tight mb-4"
            style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', color: theme.text, fontFamily: theme.fontDisplay }}
          >
            Everything your club needs. <br className="hidden sm:inline" />None of the <span style={{ color: '#3FA86B' }}>chaos</span>.
          </h2>
          <p className="text-[15px] leading-relaxed" style={{ color: theme.textSecondary }}>
            Five tools, one app — <span style={{ color: '#B8842A', fontWeight: 700 }}>two of them powered by AI</span>. Tap through to see exactly what your coaches and parents will use every week.
          </p>
        </div>

        {/* Mobile: horizontal scroll tabs */}
        <div className="flex lg:hidden gap-2 overflow-x-auto pb-3 mb-6" style={{ scrollbarWidth: 'none' }}>
          {tabDefs.map((t, i) => (
            <button key={t.id} onClick={() => select(i)}
              className="flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-bold transition-all"
              style={{
                background: active === i ? `${t.accent}18` : theme.surface,
                color: active === i ? t.accent : theme.textSecondary,
                border: `1px solid ${active === i ? `${t.accent}45` : theme.border}`,
              }}>
              <span>{t.icon}</span>
              <span className="whitespace-nowrap">{t.label}</span>
              {t.ai && (
                <span className="text-[8px] font-extrabold px-1 py-[2px] rounded flex-shrink-0 leading-none" style={{
                  color: active === i ? t.accent : '#C9962F', background: active === i ? `${t.accent}20` : '#C9962F1a',
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
                className={`text-left relative overflow-hidden rounded-2xl px-4 py-4 transition-all duration-200 ${active === i ? '' : 'hover:bg-black/[0.025]'}`}
                style={{
                  background: active === i ? `linear-gradient(135deg, ${t.accent}1e, ${t.accent}08)` : 'transparent',
                  border: `1px solid ${active === i ? `${t.accent}55` : theme.border}`,
                  boxShadow: active === i ? `0 12px 28px -14px ${t.accent}90` : 'none',
                  transform: active === i ? 'translateX(3px)' : 'none',
                }}>
                {/* Left accent bar */}
                <div style={{
                  position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2,
                  background: active === i ? t.accent : 'transparent',
                }} />
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-[10px] flex-shrink-0 w-4 text-center" style={{ color: active === i ? t.accent : theme.textMuted }}>
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
                      <p className="font-bold text-[13px] leading-none truncate" style={{ color: active === i ? theme.text : theme.textSecondary }}>
                        {t.label}
                      </p>
                      {t.ai && (
                        <span className="text-[8px] font-extrabold px-1.5 py-[3px] rounded-md flex-shrink-0 leading-none" style={{
                          color: '#9A6B1F', background: '#C9962F1e', border: '1px solid #C9962F45', letterSpacing: '0.05em',
                        }}>AI</span>
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: active === i ? theme.textSecondary : theme.textMuted }}>{t.subtitle}</p>
                  </div>
                </div>
                {/* Expanded checks when active */}
                {active === i && (
                  <div className="mt-3 pl-16 flex flex-col gap-1.5" style={{ animation: 'tabFadeIn 0.25s ease' }}>
                    {t.checks.map(c => (
                      <div key={c} className="flex items-start gap-2 text-[11px]" style={{ color: theme.textSecondary }}>
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
              background: tab.accent, opacity: 0.14, filter: 'blur(90px)', pointerEvents: 'none', zIndex: 0,
              animation: 'tabFadeIn 0.4s ease',
            }} />
            <div className="rounded-2xl p-3 sm:p-6 lg:p-8 relative overflow-hidden" style={{
              background: theme.bg, border: `1px solid ${tab.accent}45`, minHeight: 480, zIndex: 1,
              boxShadow: `0 20px 48px -24px ${tab.accent}40`,
            }}>
              {/* Top beam */}
              <div style={{
                position: 'absolute', top: 0, left: 24, right: 24, height: 2, borderRadius: 2,
                background: `linear-gradient(90deg, transparent, ${tab.accent}, transparent)`,
              }} />
              {/* All five panels stacked in the same grid cell (rather than
                  conditionally rendering just the active one) so the grid
                  track sizes to the tallest panel and stays that height
                  permanently — swapping which one is visible (by click or
                  by the 5s auto-rotate) never changes this container's
                  height, which is what was making the page jump. */}
              <div style={{ display: 'grid' }}>
                {tabDefs.map((t, i) => (
                  <div
                    key={t.id}
                    style={{
                      gridArea: '1 / 1',
                      opacity: active === i ? 1 : 0,
                      visibility: active === i ? 'visible' : 'hidden',
                      pointerEvents: active === i ? 'auto' : 'none',
                      transform: active === i ? 'translateY(0)' : 'translateY(6px)',
                      transition: 'opacity 0.3s ease, transform 0.3s ease',
                    }}
                  >
                    {t.visual}
                  </div>
                ))}
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
