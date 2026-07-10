'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface Props { total: number; taken: number; spotsLeft: number; }

export default function FoundingGrid({ total, taken, spotsLeft }: Props) {
  const ref     = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setActive(true); observer.disconnect(); } },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="rounded-2xl p-8" style={{ background: '#0c0c0c', border: '1px solid #1a1a1a' }}>
      <div className="flex items-baseline justify-between mb-7">
        <p className="text-white font-bold text-[16px]">Founding Club spots</p>
        <span className="text-[#22c55e] font-extrabold text-[13px]">{spotsLeft} remaining</span>
      </div>

      <div className="grid grid-cols-5 gap-2 mb-8">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i}
            className="aspect-square rounded-xl flex items-center justify-center text-[14px]"
            style={{
              background: i < taken ? '#0e2016' : '#0f0f0f',
              border: `1px solid ${i < taken ? '#22c55e25' : '#151515'}`,
              opacity: active ? 1 : 0,
              transform: active ? 'scale(1)' : 'scale(0.6)',
              transition: `opacity 0.35s ease ${i * 30}ms, transform 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 30}ms`,
            }}>
            {i < taken ? '⚽' : null}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 mb-8">
        {[
          'Every feature, free forever — locked in',
          'Your club on the Pulse FC founding wall',
          'Direct line to Rick for feature requests',
          'Priority support',
        ].map((b, i) => (
          <div key={b}
            className="flex items-center gap-3 text-[13px] text-[#666] font-medium"
            style={{
              opacity: active ? 1 : 0,
              transform: active ? 'translateX(0)' : 'translateX(-10px)',
              transition: `opacity 0.4s ease ${200 + i * 80}ms, transform 0.4s ease ${200 + i * 80}ms`,
            }}>
            <span className="text-[#22c55e] font-extrabold text-[10px] flex-shrink-0">✓</span>
            {b}
          </div>
        ))}
      </div>

      <Link href="/onboarding"
        className="w-full flex items-center justify-center font-bold text-[15px] py-3.5 rounded-xl text-black bg-[#22c55e] hover:bg-[#1db954] transition-colors">
        Claim your founding spot →
      </Link>
      <p className="text-[#2a2a2a] text-[11px] text-center mt-3">No credit card · 10 minutes · cancel anytime</p>
    </div>
  );
}
