'use client';
import { useEffect, useRef, useState } from 'react';

const PRIMARY = '#E879A0';

// 4-3-3 on a portrait pitch (x=0→100 left/right, y=0→100 top/bottom, attacking upward)
const PLAYERS = [
  { n: 1,  name: 'Chen',  x: 50,  y: 86 },
  { n: 3,  name: 'Mills', x: 16,  y: 70 },
  { n: 4,  name: 'Park',  x: 37,  y: 70 },
  { n: 5,  name: 'Obi',   x: 63,  y: 70 },
  { n: 2,  name: 'Walsh', x: 84,  y: 70 },
  { n: 7,  name: 'Kim',   x: 20,  y: 50 },
  { n: 6,  name: 'Patel', x: 50,  y: 48 },
  { n: 8,  name: 'Evans', x: 80,  y: 50 },
  { n: 10, name: 'Lopez', x: 18,  y: 26 },
  { n: 9,  name: 'Brown', x: 50,  y: 18 },
  { n: 11, name: 'James', x: 82,  y: 26 },
];

export default function LineupBuilder() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(() => setActive(true), 300); obs.disconnect(); }
    }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex justify-center lg:justify-start">
      <div style={{
        width: 255,
        background: '#0a0a0a',
        borderRadius: 44,
        overflow: 'hidden',
        boxShadow: '0 0 0 1px #2a2a2a, 0 0 0 7px #111, inset 0 0 0 1px #1e1e1e, 0 50px 100px rgba(0,0,0,0.9)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Dynamic island */}
        <div style={{ position: 'relative', height: 52, flexShrink: 0 }}>
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            width: 88, height: 26, background: '#000', borderRadius: 20, zIndex: 20,
          }} />
          <div style={{
            height: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            padding: '0 20px 8px', fontSize: 10, fontWeight: 600, color: '#fff',
          }}>
            <span>9:41</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <svg width="13" height="9" viewBox="0 0 13 9" fill="white">
                <rect x="0" y="5" width="2.5" height="4" rx="0.5" opacity="0.4" />
                <rect x="3.5" y="3" width="2.5" height="6" rx="0.5" opacity="0.6" />
                <rect x="7" y="1" width="2.5" height="8" rx="0.5" opacity="0.8" />
                <rect x="10.5" y="0" width="2.5" height="9" rx="0.5" />
              </svg>
              <div style={{ border: '1px solid rgba(255,255,255,0.35)', borderRadius: 3, padding: '1px 2px', display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 18, height: 8, position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 0, background: '#4ade80', borderRadius: 1, width: '75%' }} />
                </div>
                <div style={{ width: 2, height: 5, background: 'rgba(255,255,255,0.4)', borderRadius: 1, marginLeft: 1 }} />
              </div>
            </div>
          </div>
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px 8px', borderBottom: '1px solid #1a1a1a',
        }}>
          <span style={{ fontSize: 14, color: '#555' }}>‹</span>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#fff', margin: 0 }}>Lineup Builder</p>
            <p style={{ fontSize: 9, color: '#555', margin: 0, marginTop: 1 }}>@ Maroons SC</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '3px 7px', borderRadius: 8,
              background: `${PRIMARY}15`, border: `1px solid ${PRIMARY}30`,
            }}>
              <span style={{ fontSize: 9 }}>✦</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: PRIMARY }}>AI</span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', padding: '3px 8px', borderRadius: 8,
              background: '#161616', border: '1px solid #2a2a2a',
            }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: PRIMARY }}>Save</span>
            </div>
          </div>
        </div>

        {/* Pitch */}
        <div style={{ position: 'relative', aspectRatio: '0.68', background: 'linear-gradient(180deg, #071407 0%, #0c1c0c 100%)', flexShrink: 0 }}>
          <svg viewBox="0 0 100 147" preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.2 }}>
            <rect x="4" y="3" width="92" height="141" fill="none" stroke="#4ade80" strokeWidth="0.8" rx="0.5" />
            <line x1="4" y1="73" x2="96" y2="73" stroke="#4ade80" strokeWidth="0.5" />
            <circle cx="50" cy="73" r="13" fill="none" stroke="#4ade80" strokeWidth="0.5" />
            <circle cx="50" cy="73" r="1" fill="#4ade80" />
            <rect x="24" y="3" width="52" height="22" fill="none" stroke="#4ade80" strokeWidth="0.5" />
            <rect x="37" y="3" width="26" height="8" fill="none" stroke="#4ade80" strokeWidth="0.5" />
            <circle cx="50" cy="16" r="0.7" fill="#4ade80" />
            <rect x="24" y="122" width="52" height="22" fill="none" stroke="#4ade80" strokeWidth="0.5" />
            <rect x="37" y="136" width="26" height="8" fill="none" stroke="#4ade80" strokeWidth="0.5" />
            <circle cx="50" cy="129" r="0.7" fill="#4ade80" />
          </svg>

          {PLAYERS.map((p, i) => (
            <div key={p.n} style={{
              position: 'absolute',
              left: `${p.x}%`, top: `${p.y}%`,
              transform: 'translate(-50%, -50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              opacity: active ? 1 : 0,
              transition: `opacity 0.35s ease ${i * 55}ms`,
              zIndex: 2,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: PRIMARY, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800,
                boxShadow: `0 0 10px ${PRIMARY}70, 0 2px 6px rgba(0,0,0,0.7)`,
              }}>
                {p.n}
              </div>
              <span style={{ fontSize: 6.5, fontWeight: 700, color: '#ddd', marginTop: 2, textShadow: '0 1px 3px rgba(0,0,0,0.9)', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
            </div>
          ))}
        </div>

        {/* Bottom tabs */}
        <div style={{ borderTop: '1px solid #1a1a1a', background: '#0d0d0d', padding: '10px 12px 8px' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '7px 0', borderRadius: 10,
              background: `${PRIMARY}12`, border: `1px solid ${PRIMARY}30`,
              borderBottom: `2px solid ${PRIMARY}`,
            }}>
              <span style={{ fontSize: 9, color: PRIMARY }}>▦</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: PRIMARY }}>4-3-3</span>
            </div>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '7px 0', borderRadius: 10,
              background: '#141414', border: '1px solid #222',
            }}>
              <span style={{ fontSize: 9, color: '#444' }}>👤</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#444' }}>Players 11/15</span>
            </div>
          </div>
        </div>

        {/* Home indicator */}
        <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
          <div style={{ width: 90, height: 4, background: '#222', borderRadius: 10 }} />
        </div>

      </div>
    </div>
  );
}
