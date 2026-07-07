'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { href: '/for-clubs',  label: 'For club directors' },
  { href: '/pricing',    label: 'Pricing' },
  { href: '/compare',    label: 'Compare' },
  { href: '/dashboard',  label: 'Log in' },
];

export default function NavBar() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close on route change (ESC key)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <nav style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', maxWidth: '1280px', margin: '0 auto',
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div style={{ background: '#fff', borderRadius: '10px', padding: '6px 12px', display: 'inline-flex', alignItems: 'center' }}>
            <img src="/Signature.jpg" alt="Dugout FC" style={{ height: '28px', width: 'auto' }} />
          </div>
        </Link>

        {/* Desktop nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                fontSize: '13px', fontWeight: '600', color: '#888',
                textDecoration: 'none', transition: 'color 0.15s',
              }}
              className="hidden sm:block hover:!text-white"
            >
              {label}
            </Link>
          ))}

          {/* CTA — always visible */}
          <Link
            href="/onboarding"
            style={{
              fontSize: '13px', fontWeight: '700', color: '#000',
              background: '#22c55e', padding: '8px 16px', borderRadius: '9px',
              textDecoration: 'none', transition: 'background 0.15s',
              whiteSpace: 'nowrap',
            }}
            className="hover:bg-[#1db954]"
          >
            Add your club
          </Link>

          {/* Hamburger — only on mobile */}
          <button
            onClick={() => setOpen(o => !o)}
            className="sm:hidden"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px', borderRadius: '8px', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#888',
            }}
            aria-label="Toggle menu"
          >
            {open ? <X size={22} color="#ccc" /> : <Menu size={22} color="#888" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: '#0d0d0d', borderBottom: '1px solid #1a1a1a',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            padding: '8px 0 16px',
          }}
        >
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              style={{
                display: 'block', padding: '14px 24px',
                fontSize: '15px', fontWeight: '600', color: '#bbb',
                textDecoration: 'none', borderBottom: '1px solid #141414',
                transition: 'color 0.1s',
              }}
              className="hover:!text-white hover:!bg-[#131313]"
            >
              {label}
            </Link>
          ))}
          <div style={{ padding: '14px 24px 0' }}>
            <Link
              href="/onboarding"
              onClick={() => setOpen(false)}
              style={{
                display: 'block', textAlign: 'center',
                padding: '13px', borderRadius: '10px',
                fontSize: '15px', fontWeight: '700', color: '#000',
                background: '#22c55e', textDecoration: 'none',
              }}
            >
              Add your club free →
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
