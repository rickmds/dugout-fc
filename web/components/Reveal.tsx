'use client';
import { useEffect, useRef, CSSProperties, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  delay?: number;
  distance?: number;
  className?: string;
  style?: CSSProperties;
}

export default function Reveal({ children, delay = 0, distance = 22, className = '', style }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0px)';
          }, delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: 0,
        transform: `translateY(${distance}px)`,
        transition: `opacity 0.65s cubic-bezier(0.22, 1, 0.36, 1), transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
