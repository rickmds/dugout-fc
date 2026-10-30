'use client';

import { useEffect, useState } from 'react';

export const GOOGLE_GROUP_URL = 'https://groups.google.com/g/pulse-fc-android/about';
export const PLAY_TESTING_URL = 'https://play.google.com/apps/testing/app.pulsefc.mobile';

function PlayIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 3.3v17.4a1 1 0 0 0 1.53.85l14.1-8.7a1 1 0 0 0 0-1.7L6.53 2.45A1 1 0 0 0 5 3.3z" fill="currentColor" />
    </svg>
  );
}

export function AndroidTesterModal({ open, onClose, accent = '#3FA86B' }: {
  open: boolean;
  onClose: () => void;
  accent?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(43,36,32,0.55)' }}
      onClick={onClose}
    >
      <div
        className="relative bg-white border border-[#EDE6DA] rounded-2xl p-7 max-w-sm w-full"
        style={{ borderLeft: `3px solid ${accent}`, boxShadow: '0 20px 48px rgba(43,36,32,0.18)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 w-8 h-8 rounded-full border border-[#EDE6DA] flex items-center justify-center text-[#6B6054] hover:text-[#2B2420] hover:border-[#A69B8C] transition-all"
        >
          ×
        </button>

        <p style={{ color: accent }} className="text-[11px] font-bold tracking-widest uppercase mb-2">On Android</p>
        <h3 className="text-[#2B2420] font-extrabold text-xl mb-6">Get Pulse FC (Beta)</h3>

        <div className="flex gap-3 mb-6">
          <div style={{ background: accent }} className="flex-shrink-0 w-6 h-6 rounded-full text-white text-[12px] font-bold flex items-center justify-center">1</div>
          <div>
            <p className="text-[#2B2420] text-sm font-bold mb-1">Join the tester group</p>
            <p className="text-[#6B6054] text-[13px] leading-relaxed mb-2">Open this link and tap Join group:</p>
            <a href={GOOGLE_GROUP_URL} target="_blank" rel="noopener noreferrer"
              style={{ color: accent }} className="text-sm font-bold underline underline-offset-2 hover:opacity-80 transition-opacity">
              Join the Android tester group
            </a>
            <p className="text-[#A69B8C] text-[12px] leading-relaxed mt-2">Use the same Google account your Play Store is signed in with — usually the main Gmail on your phone.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div style={{ background: accent }} className="flex-shrink-0 w-6 h-6 rounded-full text-white text-[12px] font-bold flex items-center justify-center">2</div>
          <div>
            <p className="text-[#2B2420] text-sm font-bold mb-1">Become a tester, then install</p>
            <a href={PLAY_TESTING_URL} target="_blank" rel="noopener noreferrer"
              style={{ color: accent }} className="text-sm font-bold underline underline-offset-2 hover:opacity-80 transition-opacity">
              Open the Pulse FC testing page
            </a>
            <p className="text-[#A69B8C] text-[12px] leading-relaxed mt-2">Tap Become a tester, then use the Google Play download link that appears.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AndroidTesterCTA({ size = 'hero' }: { size?: 'hero' | 'footer' }) {
  const [open, setOpen] = useState(false);
  const isHero = size === 'hero';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center bg-[#3FA86B] text-white hover:bg-[#2F8755] transition-colors"
        style={{
          gap: isHero ? 8 : 6,
          borderRadius: isHero ? 10 : 8,
          padding: isHero ? '0 14px 0 11px' : '0 10px 0 8px',
          height: isHero ? 36 : 28,
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <PlayIcon size={isHero ? 17 : 13} />
        <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
          <div style={{ fontSize: isHero ? 8.5 : 7.5, fontWeight: 700, opacity: 0.85, letterSpacing: '0.05em' }}>GET IT ON</div>
          <div style={{ fontSize: isHero ? 13.5 : 11, fontWeight: 900, letterSpacing: '-0.2px' }}>Android Beta</div>
        </div>
      </button>

      <AndroidTesterModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
