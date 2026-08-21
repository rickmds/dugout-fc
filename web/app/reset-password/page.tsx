'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Phase = 'loading' | 'confirm' | 'confirming' | 'form' | 'saving' | 'success' | 'invalid';

const ACCENT  = '#22C55E';
const SURFACE = '#111111';

function strength(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: s, label: 'Weak',   color: '#EF4444' };
  if (s <= 2) return { score: s, label: 'Fair',   color: '#F59E0B' };
  if (s <= 3) return { score: s, label: 'Good',   color: '#3B82F6' };
  return            { score: s, label: 'Strong',  color: ACCENT };
}

function ResetContent() {
  const searchParams = useSearchParams();
  const [phase,    setPhase]    = useState<Phase>('loading');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [showCf,   setShowCf]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const subscribed = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash');

    // Preferred link shape — nothing is redeemed yet just from this page
    // loading. Supabase's default {{ .ConfirmationURL }} points straight at
    // /auth/v1/verify, which consumes the one-time token the instant
    // anything requests it — email link scanners, previews, or prefetching
    // all silently "use up" the link before a real person ever taps it.
    // This shape defers the actual verifyOtp() call to a real button press.
    if (tokenHash) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the recovery link shape from the URL on mount, not derivable at render time
      setPhase('confirm');
      return;
    }

    if (code) {
      // Legacy PKCE link — exchange code for session
      supabase.auth.exchangeCodeForSession(code).then(({ error: e }) => {
        setPhase(e ? 'invalid' : 'form');
      });
      return;
    }

    // Legacy implicit flow — wait for PASSWORD_RECOVERY event from fragment
    if (subscribed.current) return;
    subscribed.current = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'PASSWORD_RECOVERY') return;
      // The event can fire a moment before the session is actually
      // readable back from storage — confirm it's really there before
      // showing the form, instead of trusting the event alone and having
      // updateUser() fail later with a raw "Auth session missing!" error.
      supabase.auth.getSession().then(({ data }) => {
        setPhase(data.session ? 'form' : 'invalid');
      });
    });

    // If no code and no fragment, show invalid after a short wait
    const timer = setTimeout(() => {
      setPhase(prev => prev === 'loading' ? 'invalid' : prev);
    }, 3000);

    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, [searchParams]);

  async function handleConfirm() {
    const tokenHash = searchParams.get('token_hash');
    if (!tokenHash) return;
    setPhase('confirming');
    const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    setPhase(verifyErr ? 'invalid' : 'form');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setPhase('saving');

    // Re-check right before the write — the recovery session can land a
    // moment after PASSWORD_RECOVERY fires, and this is the last chance to
    // catch that gap with a clear message instead of a raw SDK error.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setError('Your reset link session has expired. Please request a new password reset email and try again.');
      setPhase('form');
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(
        updateErr.message.toLowerCase().includes('session')
          ? 'Your reset link session has expired. Please request a new password reset email and try again.'
          : updateErr.message
      );
      setPhase('form');
      return;
    }

    // Sign out all other sessions — invalidates the old password everywhere
    await supabase.auth.signOut({ scope: 'others' });
    setPhase('success');
  }

  const pw = strength(password);
  const matchOk = confirm.length > 0 && password === confirm;

  const shell = (children: React.ReactNode) => (
    <div style={{
      minHeight: '100vh', background: '#080808',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      {/* Top glow */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '500px', height: '200px', pointerEvents: 'none',
        background: `radial-gradient(ellipse at 50% 0%, ${ACCENT}18 0%, transparent 70%)`,
      }} />

      <div style={{ maxWidth: '420px', width: '100%', position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '13px', margin: '0 auto 10px',
            background: `linear-gradient(135deg, ${ACCENT}cc, ${ACCENT}77)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 20px ${ACCENT}44`,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Pulse FC
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: SURFACE, border: '1px solid #1f1f1f',
          borderRadius: '20px', overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}>
          <div style={{ height: '2px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}66)` }} />
          <div style={{ padding: '28px 28px 32px' }}>
            {children}
          </div>
        </div>

        <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: '#374151' }}>
          Powered by{' '}
          <a href="https://pulse-fc.app" style={{ color: '#4b5563', textDecoration: 'none', fontWeight: '600' }}>
            Pulse FC
          </a>
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .rp-input { width: 100%; background: #1a1a1a; border: 1.5px solid #2a2a2a; border-radius: 12px; padding: 13px 44px 13px 16px; font-size: 15px; color: #f9fafb; box-sizing: border-box; font-family: inherit; outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
        .rp-input:focus { border-color: ${ACCENT}; box-shadow: 0 0 0 3px ${ACCENT}22; }
        .rp-btn { width: 100%; background: ${ACCENT}; color: #000; border: none; border-radius: 13px; padding: 15px; font-size: 16px; font-weight: 800; cursor: pointer; font-family: inherit; letter-spacing: -0.2px; transition: opacity 0.15s, transform 0.1s; }
        .rp-btn:hover:not(:disabled) { opacity: 0.9; }
        .rp-btn:active:not(:disabled) { transform: scale(0.98); }
        .rp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') return shell(
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ width: '28px', height: '28px', border: `2px solid ${ACCENT}33`, borderTopColor: ACCENT, borderRadius: '50%', margin: '0 auto', animation: 'spin 0.75s linear infinite' }} />
      <div style={{ marginTop: '14px', fontSize: '13px', color: '#6b7280' }}>Verifying link…</div>
    </div>
  );

  // ── Confirm — a real tap, so an email scanner or link preview can't
  //     silently redeem the one-time token before you do ──────────────────
  if (phase === 'confirm' || phase === 'confirming') return shell(
    <div style={{ textAlign: 'center', animation: 'fadeUp 0.3s ease both' }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '50%', margin: '0 auto 16px',
        background: `${ACCENT}18`, border: `1px solid ${ACCENT}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
      }}>
        🔒
      </div>
      <div style={{ fontSize: '18px', fontWeight: '800', color: '#f3f4f6', marginBottom: '8px' }}>Reset your password</div>
      <div style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.65', maxWidth: '300px', margin: '0 auto 24px' }}>
        Tap below to continue. This confirms it&apos;s really you before we open the link.
      </div>
      <button className="rp-btn" onClick={handleConfirm} disabled={phase === 'confirming'}>
        {phase === 'confirming'
          ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <span style={{ width: '16px', height: '16px', border: '2px solid #00000033', borderTopColor: '#000', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.75s linear infinite' }} />
              Verifying…
            </span>
          : 'Continue'}
      </button>
    </div>
  );

  // ── Invalid / expired ──────────────────────────────────────────────────────
  if (phase === 'invalid') return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', marginBottom: '16px' }}>
        🔗
      </div>
      <div style={{ fontSize: '18px', fontWeight: '800', color: '#f3f4f6', marginBottom: '8px' }}>Link expired</div>
      <div style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.65', maxWidth: '300px', margin: '0 auto 24px' }}>
        This password reset link has expired or already been used. Links are valid for 1 hour.
      </div>
      <a href="https://apps.apple.com/us/app/pulse-fc/id6797330659"
        style={{ display: 'inline-block', fontSize: '14px', fontWeight: '600', color: ACCENT, textDecoration: 'none' }}>
        Open the app to request a new link →
      </a>
    </div>
  );

  // ── Success ────────────────────────────────────────────────────────────────
  if (phase === 'success') return shell(
    <div style={{ textAlign: 'center', animation: 'fadeUp 0.3s ease both' }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto 18px',
        background: `${ACCENT}20`, border: `2px solid ${ACCENT}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div style={{ fontSize: '20px', fontWeight: '800', color: '#f9fafb', marginBottom: '8px' }}>Password updated</div>
      <div style={{ fontSize: '14px', color: '#9ca3af', lineHeight: '1.65', marginBottom: '28px', maxWidth: '300px', margin: '0 auto 28px' }}>
        Your password has been changed and all other sessions have been signed out. Open the app to log in.
      </div>
      <a
        href="https://apps.apple.com/us/app/pulse-fc/id6797330659"
        target="_blank" rel="noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: ACCENT, color: '#000',
          borderRadius: '13px', padding: '14px 28px',
          fontWeight: '800', fontSize: '15px', textDecoration: 'none',
          boxShadow: `0 4px 16px ${ACCENT}44`,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#000">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
        Open Pulse FC
      </a>
    </div>
  );

  // ── Form ───────────────────────────────────────────────────────────────────
  return shell(
    <form onSubmit={handleSubmit} noValidate style={{ animation: 'fadeUp 0.3s ease both' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>
        Account security
      </div>
      <div style={{ fontSize: '20px', fontWeight: '800', color: '#f9fafb', marginBottom: '6px', letterSpacing: '-0.4px' }}>
        Set a new password
      </div>
      <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6', marginBottom: '28px' }}>
        Choose something strong. We&apos;ll sign out any other devices for you.
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', color: '#F87171', marginBottom: '20px', lineHeight: '1.5' }}>
          {error}
        </div>
      )}

      {/* New password */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#9ca3af', marginBottom: '6px', letterSpacing: '0.02em' }}>
          New password
        </label>
        <div style={{ position: 'relative' }}>
          <input
            className="rp-input"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            autoFocus
          />
          <button type="button" onClick={() => setShowPw(v => !v)}
            style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px', lineHeight: 1, color: '#6b7280' }}>
            {showPw ? '🙈' : '👁️'}
          </button>
        </div>

        {/* Strength bar */}
        {password.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '3px', marginBottom: '5px' }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i <= pw.score ? pw.color : '#2a2a2a', transition: 'background 0.2s' }} />
              ))}
            </div>
            <div style={{ fontSize: '11px', color: pw.color, fontWeight: '600' }}>{pw.label}</div>
          </div>
        )}
      </div>

      {/* Confirm password */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#9ca3af', marginBottom: '6px', letterSpacing: '0.02em' }}>
          Confirm password
        </label>
        <div style={{ position: 'relative' }}>
          <input
            className="rp-input"
            type={showCf ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat your new password"
            autoComplete="new-password"
            style={{ paddingRight: confirm.length > 0 ? '80px' : '44px' } as React.CSSProperties}
          />
          {confirm.length > 0 && (
            <span style={{ position: 'absolute', right: '44px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', fontWeight: '700', color: matchOk ? ACCENT : '#EF4444' }}>
              {matchOk ? '✓' : '✕'}
            </span>
          )}
          <button type="button" onClick={() => setShowCf(v => !v)}
            style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px', lineHeight: 1, color: '#6b7280' }}>
            {showCf ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      <button
        className="rp-btn"
        type="submit"
        disabled={phase === 'saving' || !password || !confirm}
      >
        {phase === 'saving'
          ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <span style={{ width: '16px', height: '16px', border: '2px solid #00000033', borderTopColor: '#000', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.75s linear infinite' }} />
              Updating…
            </span>
          : 'Update password'}
      </button>

      <div style={{ marginTop: '14px', fontSize: '11px', color: '#4b5563', textAlign: 'center', lineHeight: '1.6' }}>
        All other signed-in devices will be logged out automatically.
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '28px', height: '28px', border: '2px solid #22C55E33', borderTopColor: '#22C55E', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <ResetContent />
    </Suspense>
  );
}
