'use client';

import { useState, useEffect } from 'react';

export type FlipRow = { label: string; pad?: number };

const DEFAULT_ROWS: FlipRow[] = [
  { label: 'Teams',   pad: 2 },
  { label: 'Players', pad: 3 },
  { label: 'Events',  pad: 3 },
  { label: 'Coaches', pad: 2 },
];

export function FlipBoard({
  rows = DEFAULT_ROWS,
  title = 'Loading…',
  fullPage = false,
}: {
  rows?: FlipRow[];
  title?: string;
  fullPage?: boolean;
}) {
  const [nums, setNums] = useState<number[]>(() => rows.map(() => 0));

  useEffect(() => {
    const id = setInterval(() => {
      setNums(rows.map(r => {
        const max = Math.pow(10, r.pad ?? 2) - 1;
        return Math.floor(Math.random() * max);
      }));
    }, 110);
    return () => clearInterval(id);
  // rows identity is stable between renders, interval deps are fine
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrapStyle: React.CSSProperties = fullPage
    ? { minHeight: '100vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '40px 24px' }
    : { height: '100%', minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '40px 24px' };

  return (
    <div style={wrapStyle}>
      {/* Soccer ball + title */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 34, lineHeight: 1, marginBottom: 10 }}>⚽</div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.02em' }}>{title}</p>
      </div>

      {/* Dark scoreboard panel */}
      <div style={{ width: '100%', maxWidth: 400, background: '#0F172A', border: '1px solid #1E293B', borderRadius: 16, overflow: 'hidden' }}>

        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: '#080E1A', borderBottom: '1px solid #1E293B' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px #22C55E' }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '3px' }}>
            Live · Scanning
          </span>
        </div>

        {/* Digit grid */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length}, 1fr)`, borderBottom: '1px solid #1E293B' }}>
          {rows.map(({ label, pad = 2 }, ri) => {
            const val    = nums[ri] ?? 0;
            const digits = String(val).padStart(pad, '0').slice(-pad).split('');
            return (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '22px 6px 16px', gap: 8, borderRight: ri < rows.length - 1 ? '1px solid #1E293B' : 'none' }}>
                {/* Digit cards */}
                <div style={{ display: 'flex', gap: 3 }}>
                  {digits.map((d, i) => (
                    <div key={i} style={{ position: 'relative', width: 26, height: 36, background: '#080E1A', border: '1px solid #1E293B', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {/* Split-flap seam */}
                      <div style={{ position: 'absolute', left: 0, right: 0, height: 1, background: '#000', top: '50%' }} />
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 17, fontWeight: 900, lineHeight: 1, color: '#1E3A2E', position: 'relative', zIndex: 1, userSelect: 'none' }}>
                        {d}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Label */}
                <span style={{ fontSize: 8, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '2px' }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 4, height: 4, borderRadius: '50%', background: '#22C55E33',
              animation: `flipBoardBounce 0.9s ${i * 0.15}s ease-in-out infinite`,
            }} />
          ))}
          <span style={{ fontSize: 11, color: '#1E293B' }}>Loading…</span>
        </div>
      </div>

      <style>{`
        @keyframes flipBoardBounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
