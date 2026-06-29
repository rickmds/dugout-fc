'use client';
import { useEffect, useRef, useState } from 'react';

interface Props { total: number; filled: number; }

export default function AnimatedBar({ total, filled }: Props) {
  const ref     = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setActive(true); observer.disconnect(); } },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex-1 h-1.5 rounded-full"
          style={{
            background: i < filled ? '#22c55e' : '#1e1e1e',
            opacity: active ? 1 : 0,
            transform: active ? 'scaleX(1)' : 'scaleX(0)',
            transformOrigin: 'left',
            transition: `opacity 0.3s ease ${i * 40}ms, transform 0.4s cubic-bezier(0.22,1,0.36,1) ${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}
