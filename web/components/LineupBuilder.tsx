'use client';
import { useEffect, useRef, useState } from 'react';

const STARTERS = [
  { n: 1,  surname: 'Chen',   pos: 'GK', x: 50, y: 84, mins: 90 },
  { n: 2,  surname: 'Walsh',  pos: 'RB', x: 80, y: 68, mins: 60 },
  { n: 5,  surname: 'Obi',    pos: 'CB', x: 63, y: 68, mins: 90 },
  { n: 4,  surname: 'Park',   pos: 'CB', x: 37, y: 68, mins: 90 },
  { n: 3,  surname: 'Mills',  pos: 'LB', x: 20, y: 68, mins: 75 },
  { n: 8,  surname: 'Evans',  pos: 'CM', x: 65, y: 49, mins: 90 },
  { n: 6,  surname: 'Patel',  pos: 'CM', x: 50, y: 46, mins: 45 },
  { n: 7,  surname: 'Kim',    pos: 'CM', x: 35, y: 49, mins: 90 },
  { n: 11, surname: 'James',  pos: 'RW', x: 82, y: 24, mins: 90 },
  { n: 9,  surname: 'Brown',  pos: 'ST', x: 50, y: 15, mins: 70 },
  { n: 10, surname: 'Lopez',  pos: 'LW', x: 18, y: 24, mins: 90 },
];

const SUBPLAN = [
  { time: 45, off: 'Patel #6',  on: 'Wright #12', offMins: 45 },
  { time: 60, off: 'Walsh #2',  on: 'Harris #13', offMins: 60 },
  { time: 70, off: 'Brown #9',  on: 'Torres #14', offMins: 70 },
  { time: 75, off: 'Mills #3',  on: 'Smith  #15', offMins: 75 },
];

// Show a mix of subbed + full-game players for the time bars
const TIMEBARS = [
  { name: 'Patel',  mins: 45,  full: false },
  { name: 'Walsh',  mins: 60,  full: false },
  { name: 'Brown',  mins: 70,  full: false },
  { name: 'Mills',  mins: 75,  full: false },
  { name: 'Evans',  mins: 90,  full: true  },
  { name: 'James',  mins: 90,  full: true  },
];

export default function LineupBuilder() {
  const ref    = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(0);
  // 0 = hidden, 1 = pitch visible, 2 = players dropping in, 3 = sub plan revealed

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPhase(1);
          setTimeout(() => setPhase(2), 400);
          setTimeout(() => setPhase(3), 400 + STARTERS.length * 90 + 600);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="rounded-2xl overflow-hidden" style={{ background: '#090f09', border: '1px solid #182018' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #141e14' }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-extrabold text-[13px]">4-3-3</span>
          <span className="text-[#3a5a3a] text-[11px]">U14 Boys · vs Maroons SC</span>
        </div>
        <span className="text-[11px] font-bold text-[#22c55e] flex items-center gap-1.5"
          style={{ background: '#22c55e0f', border: '1px solid #22c55e20', padding: '2px 10px', borderRadius: 99 }}>
          <span style={{ fontSize: 9 }}>✦</span> AI suggested
        </span>
      </div>

      {/* Pitch */}
      <div
        className="relative select-none"
        style={{
          aspectRatio: '1.3 / 1',
          background: 'linear-gradient(180deg, #071207 0%, #0a180a 100%)',
          opacity: phase >= 1 ? 1 : 0,
          transition: 'opacity 0.6s ease',
        }}
      >
        {/* SVG pitch markings */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ opacity: 0.18 }}
        >
          {/* Outer border */}
          <rect x="3.5" y="2.5" width="93" height="95" fill="none" stroke="#4ade80" strokeWidth="0.6" rx="0.5" />
          {/* Center line */}
          <line x1="3.5" y1="50" x2="96.5" y2="50" stroke="#4ade80" strokeWidth="0.4" />
          {/* Center circle */}
          <circle cx="50" cy="50" r="13" fill="none" stroke="#4ade80" strokeWidth="0.4" />
          {/* Center spot */}
          <circle cx="50" cy="50" r="0.9" fill="#4ade80" />
          {/* Top penalty box */}
          <rect x="22" y="2.5" width="56" height="21" fill="none" stroke="#4ade80" strokeWidth="0.4" />
          {/* Top 6-yard box */}
          <rect x="35" y="2.5" width="30" height="8" fill="none" stroke="#4ade80" strokeWidth="0.4" />
          {/* Top penalty spot */}
          <circle cx="50" cy="15" r="0.7" fill="#4ade80" />
          {/* Bottom penalty box */}
          <rect x="22" y="76.5" width="56" height="21" fill="none" stroke="#4ade80" strokeWidth="0.4" />
          {/* Bottom 6-yard box */}
          <rect x="35" y="89.5" width="30" height="8" fill="none" stroke="#4ade80" strokeWidth="0.4" />
          {/* Bottom penalty spot */}
          <circle cx="50" cy="85" r="0.7" fill="#4ade80" />
          {/* Corner arcs */}
          <path d="M3.5 8 A5 5 0 0 1 8 2.5" fill="none" stroke="#4ade80" strokeWidth="0.4" />
          <path d="M92 2.5 A5 5 0 0 1 96.5 8" fill="none" stroke="#4ade80" strokeWidth="0.4" />
          <path d="M3.5 92 A5 5 0 0 0 8 97.5" fill="none" stroke="#4ade80" strokeWidth="0.4" />
          <path d="M92 97.5 A5 5 0 0 0 96.5 92" fill="none" stroke="#4ade80" strokeWidth="0.4" />
        </svg>

        {/* Player tokens */}
        {STARTERS.map((p, i) => {
          const isSubbed = p.mins < 90;
          const color    = isSubbed ? '#f59e0b' : '#22c55e';
          const glow     = isSubbed ? '#f59e0b40' : '#22c55e40';
          const active   = phase >= 2;
          return (
            <div
              key={p.n}
              className="absolute flex flex-col items-center"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                opacity: active ? 1 : 0,
                transform: active
                  ? 'translate(-50%, -50%) scale(1)'
                  : 'translate(-50%, calc(-50% + 18px)) scale(0.7)',
                transition: `opacity 0.4s ease ${i * 90}ms, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 90}ms`,
                zIndex: 2,
              }}
            >
              {/* Jersey */}
              <div
                className="flex items-center justify-center rounded-full font-extrabold"
                style={{
                  width: 26, height: 26,
                  background: color,
                  color: '#000',
                  fontSize: 9.5,
                  boxShadow: `0 0 12px ${glow}, 0 2px 4px rgba(0,0,0,0.5)`,
                }}
              >
                {p.n}
              </div>
              {/* Name */}
              <span className="font-bold text-white whitespace-nowrap" style={{ fontSize: 7, marginTop: 2, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                {p.surname}
              </span>
              {/* Minutes */}
              <span style={{ fontSize: 6.5, color, fontWeight: 800, marginTop: 1, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                {p.mins}'
              </span>
            </div>
          );
        })}
      </div>

      {/* Sub rotation + play time */}
      <div
        style={{
          borderTop: '1px solid #141e14',
          opacity: phase >= 3 ? 1 : 0,
          transform: phase >= 3 ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.55s ease, transform 0.55s ease',
        }}
      >
        <div className="px-5 pt-4 pb-5">
          <p className="text-[#3a5a3a] text-[10px] font-bold uppercase tracking-widest mb-3.5">
            Sub rotation · equal play time
          </p>

          {/* Sub plan list */}
          <div className="flex flex-col gap-2 mb-4">
            {SUBPLAN.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="text-[#22c55e] font-extrabold w-8 flex-shrink-0">{s.time}'</span>
                <span className="text-[#666] line-through decoration-[#333]">{s.off}</span>
                <span className="text-[#2a2a2a] text-[10px]">→</span>
                <span className="text-[#888]">{s.on}</span>
              </div>
            ))}
          </div>

          {/* Play time bars */}
          <div className="flex flex-col gap-2 pt-3.5" style={{ borderTop: '1px solid #141414' }}>
            {TIMEBARS.map((b, i) => (
              <div key={b.name} className="flex items-center gap-2.5">
                <span className="text-[#444] text-[9px] font-bold w-9 flex-shrink-0">{b.name}</span>
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#141414' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: phase >= 3 ? `${(b.mins / 90) * 100}%` : '0%',
                      background: b.full ? '#22c55e' : '#f59e0b',
                      transition: `width 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${i * 80}ms`,
                    }}
                  />
                </div>
                <span className="font-extrabold text-[9px] w-6 text-right flex-shrink-0"
                  style={{ color: b.full ? '#22c55e' : '#f59e0b' }}>
                  {b.mins}'
                </span>
              </div>
            ))}
          </div>

          <p className="text-[#2a2a2a] text-[10px] mt-3.5 text-center">
            AI calculates subs for equal play time across the squad
          </p>
        </div>
      </div>
    </div>
  );
}
