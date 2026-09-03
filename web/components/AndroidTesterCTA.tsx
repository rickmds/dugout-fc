'use client';

import { useEffect, useState } from 'react';

export const GOOGLE_GROUP_URL = 'https://groups.google.com/g/pulse-fc-android';
export const PLAY_TESTING_URL = 'https://play.google.com/apps/testing/app.pulsefc.mobile';

function AndroidIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.6 9.48l1.84-3.18a.4.4 0 00-.69-.4l-1.86 3.22a11.5 11.5 0 00-9.78 0L5.25 5.9a.4.4 0 00-.69.4L6.4 9.48A10.5 10.5 0 001 18h22a10.5 10.5 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" fill="currentColor" />
    </svg>
  );
}

export function AndroidTesterModal({ open, onClose, accent = '#22c55e' }: {
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
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="relative bg-[#111] border border-[#222] rounded-2xl p-7 max-w-sm w-full"
        style={{ borderLeft: `3px solid ${accent}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 w-8 h-8 rounded-full border border-[#2e2e2e] flex items-center justify-center text-[#888] hover:text-white hover:border-[#444] transition-all"
        >
          ×
        </button>

        <p style={{ color: accent }} className="text-[11px] font-bold tracking-widest uppercase mb-2">On Android</p>
        <h3 className="text-white font-extrabold text-xl mb-6">Get Pulse FC (Beta)</h3>

        <div className="flex gap-3 mb-6">
          <div style={{ background: accent }} className="flex-shrink-0 w-6 h-6 rounded-full text-black text-[12px] font-bold flex items-center justify-center">1</div>
          <div>
            <p className="text-white text-sm font-bold mb-1">Join the tester group</p>
            <p className="text-[#888] text-[13px] leading-relaxed mb-2">Open this link and tap Join group:</p>
            <a href={GOOGLE_GROUP_URL} target="_blank" rel="noopener noreferrer"
              style={{ color: accent }} className="text-sm font-bold underline underline-offset-2 hover:opacity-80 transition-opacity">
              Join the Android tester group
            </a>
            <p className="text-[#666] text-[12px] leading-relaxed mt-2">Use the same Google account your Play Store is signed in with — usually the main Gmail on your phone.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div style={{ background: accent }} className="flex-shrink-0 w-6 h-6 rounded-full text-black text-[12px] font-bold flex items-center justify-center">2</div>
          <div>
            <p className="text-white text-sm font-bold mb-1">Become a tester, then install</p>
            <a href={PLAY_TESTING_URL} target="_blank" rel="noopener noreferrer"
              style={{ color: accent }} className="text-sm font-bold underline underline-offset-2 hover:opacity-80 transition-opacity">
              Open the Pulse FC testing page
            </a>
            <p className="text-[#666] text-[12px] leading-relaxed mt-2">Tap Become a tester, then use the Google Play download link that appears.</p>
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
        className="inline-flex items-center gap-2 rounded-xl border border-[#2e2e2e] text-[#ddd] hover:border-[#3e3e3e] hover:text-white transition-all font-semibold"
        style={isHero ? { padding: '9px 14px', fontSize: 13 } : { padding: '6px 11px', fontSize: 12 }}
      >
        <AndroidIcon />
        Android Beta
      </button>

      <AndroidTesterModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
