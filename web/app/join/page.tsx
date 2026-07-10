'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ─── Types ────────────────────────────────────────────────────────────────────

type InviteDetails = {
  player_name:      string | null;
  team_name:        string;
  team_age_group:   string | null;
  club_name:        string;
  club_logo_url:    string | null;
  primary_color:    string | null;
  club_slug:        string | null;
  pre_filled_email: string;
  role:             string;
};

type Step = 'loading' | 'invalid' | 'already_accepted' | 'welcome' | 'signup' | 'login' | 'success';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveAccent(hex: string | null | undefined): string {
  if (!hex) return '#22C55E';
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#22C55E';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r + g + b)) return '#22C55E';
  if ((r < 15 && g < 15 && b < 15) || (r > 240 && g > 240 && b > 240)) return '#22C55E';
  return hex;
}

function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#000' : '#fff';
}

// ─── Main component ───────────────────────────────────────────────────────────

function JoinContent() {
  const params = useSearchParams();
  const token  = params.get('token') ?? '';

  const [step,          setStep]         = useState<Step>('loading');
  const [invite,        setInvite]       = useState<InviteDetails | null>(null);
  const [successEmail,  setSuccessEmail] = useState('');

  // Form state
  const [fullName,      setFullName]     = useState('');
  const [email,         setEmail]        = useState('');
  const [password,      setPassword]     = useState('');
  const [showPwd,       setShowPwd]      = useState(false);
  const [error,         setError]        = useState<string | null>(null);
  const [submitting,    setSubmitting]   = useState(false);
  const [copied,        setCopied]       = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) { setStep('invalid'); return; }

    fetch(`/api/invite-details?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error === 'not_found') { setStep('invalid'); return; }
        if (data.already_accepted)      { setStep('already_accepted'); return; }
        setInvite(data);
        setEmail(data.pre_filled_email ?? '');
        setStep('welcome');
      })
      .catch(() => setStep('invalid'));
  }, [token]);

  const accent     = resolveAccent(invite?.primary_color);
  const accentText = contrastText(accent);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSignup() {
    setError(null);
    if (!fullName.trim())  { setError('Please enter your full name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setSubmitting(true);

    const res  = await fetch('/api/accept-invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, email: email.trim().toLowerCase(), password, full_name: fullName.trim() }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.code === 'email_exists') {
        setError('An account with this email already exists — sign in below instead.');
        setStep('login');
        setSubmitting(false);
        return;
      }
      setError(data.error ?? 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    // Sign in client-side so the app session is ready when they open it
    await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });

    setSuccessEmail(email.trim().toLowerCase());
    setSubmitting(false);
    setStep('success');
  }

  async function handleLogin() {
    setError(null);
    if (!email.trim())  { setError('Please enter your email address.'); return; }
    if (!password)      { setError('Please enter your password.'); return; }

    setSubmitting(true);

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInErr) {
      setError('Incorrect email or password. Please try again.');
      setSubmitting(false);
      return;
    }

    const { error: rpcErr } = await supabase.rpc('accept_invite', { p_token: token });

    if (rpcErr) {
      setError('Could not join the team. The invite may have expired or already been used.');
      setSubmitting(false);
      return;
    }

    setSuccessEmail(email.trim().toLowerCase());
    setSubmitting(false);
    setStep('success');
  }

  function copyEmail() {
    navigator.clipboard.writeText(successEmail).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={s.root}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes checkDraw { from { stroke-dashoffset: 60; } to { stroke-dashoffset: 0; } }
        .join-input:focus { outline: none; border-color: var(--accent) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
        .join-btn:hover:not(:disabled) { filter: brightness(1.08); }
        .join-btn:active:not(:disabled) { transform: scale(0.98); }
        .step { animation: fadeUp 0.3s ease both; }
        .app-store-btn:hover { filter: brightness(1.15); }
      `}</style>

      <style>{`
        :root { --accent: ${accent}; }
      `}</style>

      {/* ── Background pitch pattern ── */}
      <svg style={s.pitchBg} viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="500" fill="none" stroke="#ffffff" strokeOpacity="0.025" strokeWidth="1.5" />
        <circle cx="400" cy="250" r="70" fill="none" stroke="#ffffff" strokeOpacity="0.025" strokeWidth="1.5" />
        <line x1="400" y1="0" x2="400" y2="500" stroke="#ffffff" strokeOpacity="0.025" strokeWidth="1.5" />
        <rect x="0" y="150" width="120" height="200" fill="none" stroke="#ffffff" strokeOpacity="0.025" strokeWidth="1.5" />
        <rect x="680" y="150" width="120" height="200" fill="none" stroke="#ffffff" strokeOpacity="0.025" strokeWidth="1.5" />
      </svg>

      <div style={s.card}>
        {/* Accent bar */}
        <div style={{ ...s.accentBar, background: accent }} />

        {/* ── Loading ── */}
        {step === 'loading' && (
          <div style={s.center}>
            <div style={{ width: 36, height: 36, border: `3px solid ${accent}33`, borderTopColor: accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}

        {/* ── Invalid ── */}
        {step === 'invalid' && (
          <div className="step" style={s.center}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <h1 style={s.heading}>Invalid invite link</h1>
            <p style={s.sub}>This link may have expired or already been used. Contact your coach for a new invite.</p>
          </div>
        )}

        {/* ── Already accepted ── */}
        {step === 'already_accepted' && (
          <div className="step" style={s.center}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h1 style={s.heading}>Already joined!</h1>
            <p style={s.sub}>This invite has already been accepted. Download the app and sign in to access your team.</p>
            <AppStoreButton accent={accent} accentText={accentText} />
          </div>
        )}

        {/* ── Welcome ── */}
        {step === 'welcome' && invite && (
          <div className="step">
            <ClubHeader invite={invite} accent={accent} />

            <div style={{ padding: '0 28px 32px' }}>
              {/* Invite summary card */}
              <div style={{ background: '#0D0D0D', border: '1px solid #1F1F1F', borderRadius: 16, padding: '18px 20px', marginBottom: 28 }}>
                {invite.player_name && (
                  <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #1C1C1C' }}>
                    <div style={s.metaLabel}>Player</div>
                    <div style={s.metaValue}>{invite.player_name}</div>
                  </div>
                )}
                <div style={{ marginBottom: invite.team_age_group ? 12 : 0, paddingBottom: invite.team_age_group ? 12 : 0, borderBottom: invite.team_age_group ? '1px solid #1C1C1C' : 'none' }}>
                  <div style={s.metaLabel}>Team</div>
                  <div style={s.metaValue}>{invite.team_name}</div>
                </div>
                {invite.team_age_group && (
                  <div>
                    <div style={s.metaLabel}>Age Group</div>
                    <div style={s.metaValue}>{invite.team_age_group}</div>
                  </div>
                )}
              </div>

              <p style={{ ...s.sub, marginBottom: 28, textAlign: 'left' }}>
                Create a free account to join your team. You'll get access to the full schedule, RSVP to events, and message the coaching staff through the Pulse FC app.
              </p>

              <button
                style={{ ...s.primaryBtn, background: accent, color: accentText, marginBottom: 12 }}
                className="join-btn"
                onClick={() => setStep('signup')}
              >
                Create my account →
              </button>

              <button
                style={s.outlineBtn}
                className="join-btn"
                onClick={() => setStep('login')}
              >
                I already have an account
              </button>
            </div>
          </div>
        )}

        {/* ── Sign Up ── */}
        {step === 'signup' && invite && (
          <div className="step">
            <ClubHeader invite={invite} accent={accent} compact />

            <div style={{ padding: '24px 28px 32px' }}>
              <h2 style={s.formHeading}>Create your account</h2>
              <p style={s.formSub}>It only takes a minute. You'll use these details to log in to the app.</p>

              {error && <div style={s.errorBox}>{error}</div>}

              <Field label="Your full name">
                <input
                  className="join-input"
                  style={s.input}
                  type="text"
                  placeholder="Jane Smith"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  autoComplete="name"
                />
              </Field>

              <Field label="Email address">
                <input
                  ref={emailRef}
                  className="join-input"
                  style={s.input}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </Field>

              <Field label="Create a password">
                <div style={{ position: 'relative' }}>
                  <input
                    className="join-input"
                    style={{ ...s.input, paddingRight: 52 }}
                    type={showPwd ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    onKeyDown={e => e.key === 'Enter' && handleSignup()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    style={s.eyeBtn}
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? '🙈' : '👁️'}
                  </button>
                </div>
              </Field>

              <button
                style={{ ...s.primaryBtn, background: submitting ? `${accent}99` : accent, color: accentText, marginBottom: 16, marginTop: 8 }}
                className="join-btn"
                onClick={handleSignup}
                disabled={submitting}
              >
                {submitting
                  ? <><Spinner color={accentText} />Creating account…</>
                  : `Join ${invite.team_name} →`}
              </button>

              <button style={s.ghostBtn} onClick={() => { setStep('welcome'); setError(null); }}>
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ── Log In ── */}
        {step === 'login' && invite && (
          <div className="step">
            <ClubHeader invite={invite} accent={accent} compact />

            <div style={{ padding: '24px 28px 32px' }}>
              <h2 style={s.formHeading}>Sign in to join</h2>
              <p style={s.formSub}>Sign in with your existing Pulse FC account and we'll link you to the team.</p>

              {error && <div style={s.errorBox}>{error}</div>}

              <Field label="Email address">
                <input
                  className="join-input"
                  style={s.input}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </Field>

              <Field label="Password">
                <div style={{ position: 'relative' }}>
                  <input
                    className="join-input"
                    style={{ ...s.input, paddingRight: 52 }}
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    style={s.eyeBtn}
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? '🙈' : '👁️'}
                  </button>
                </div>
              </Field>

              <button
                style={{ ...s.primaryBtn, background: submitting ? `${accent}99` : accent, color: accentText, marginBottom: 16, marginTop: 8 }}
                className="join-btn"
                onClick={handleLogin}
                disabled={submitting}
              >
                {submitting
                  ? <><Spinner color={accentText} />Signing in…</>
                  : 'Sign in & join team →'}
              </button>

              <button style={s.ghostBtn} onClick={() => { setStep('welcome'); setError(null); }}>
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {step === 'success' && invite && (
          <div className="step">
            <div style={{ padding: '40px 28px 0', textAlign: 'center' }}>

              {/* Animated checkmark */}
              <div style={{ animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both', display: 'inline-block', marginBottom: 20 }}>
                <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="36" cy="36" r="36" fill={accent} fillOpacity="0.15" />
                  <circle cx="36" cy="36" r="30" fill={accent} fillOpacity="0.12" />
                  <circle cx="36" cy="36" r="24" fill={accent} />
                  <polyline
                    points="24,36 32,44 48,28"
                    fill="none"
                    stroke={accentText}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="60"
                    strokeDashoffset="0"
                    style={{ animation: 'checkDraw 0.4s ease 0.3s both' }}
                  />
                </svg>
              </div>

              <h1 style={{ ...s.heading, marginBottom: 8 }}>You're in!</h1>
              <p style={{ ...s.sub, marginBottom: 4 }}>
                {invite.player_name
                  ? <><strong style={{ color: '#F9FAFB' }}>{invite.player_name}</strong> has been added to</>
                  : 'You've joined'}
              </p>
              <p style={{ fontSize: 17, fontWeight: 700, color: accent, marginBottom: 32 }}>
                {invite.team_name} · {invite.club_name}
              </p>
            </div>

            {/* Download section */}
            <div style={{ margin: '0 20px 24px', background: '#0D0D0D', border: '1px solid #1F1F1F', borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ padding: '20px 20px 8px' }}>
                <div style={s.metaLabel}>Step 1 — Download the app</div>
              </div>
              <div style={{ padding: '0 20px 20px' }}>
                <AppStoreButton accent={accent} accentText={accentText} />
              </div>

              <div style={{ height: 1, background: '#1C1C1C', margin: '0 20px' }} />

              <div style={{ padding: '20px' }}>
                <div style={s.metaLabel}>Step 2 — Log in with</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <div style={{
                    flex: 1, background: '#151515', border: '1px solid #2A2A2A',
                    borderRadius: 10, padding: '11px 14px',
                    fontFamily: 'monospace', fontSize: 14, color: '#D1D5DB',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {successEmail}
                  </div>
                  <button
                    onClick={copyEmail}
                    style={{
                      background: copied ? accent : '#1F1F1F',
                      border: `1px solid ${copied ? accent : '#333'}`,
                      borderRadius: 10, padding: '11px 16px',
                      color: copied ? accentText : '#9CA3AF',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.2s', whiteSpace: 'nowrap', fontFamily: 'inherit',
                    }}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: '#6B7280', margin: '8px 0 0', lineHeight: 1.5 }}>
                  Use the password you just created.
                </p>
              </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: 12, color: '#374151', padding: '0 28px 28px', lineHeight: 1.6 }}>
              Your full schedule, RSVP, and team chat are waiting inside the app.
            </p>
          </div>
        )}

        {/* Footer */}
        {step !== 'loading' && (
          <div style={s.footer}>
            Powered by{' '}
            <a href="https://pulse-fc.app" style={{ color: accent, textDecoration: 'none', fontWeight: 600 }}>
              Pulse FC
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ClubHeader({ invite, accent, compact }: { invite: InviteDetails; accent: string; compact?: boolean }) {
  const initials = invite.club_name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  const accentText = contrastText(accent);

  return (
    <div style={{ padding: compact ? '20px 28px 0' : '32px 28px 0', display: 'flex', alignItems: 'center', gap: 14, marginBottom: compact ? 0 : 24 }}>
      <div style={{
        width: compact ? 40 : 52, height: compact ? 40 : 52,
        borderRadius: compact ? 11 : 14,
        background: invite.club_logo_url ? 'transparent' : accent,
        overflow: 'hidden', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 0 3px ${accent}33`,
      }}>
        {invite.club_logo_url
          ? <img src={invite.club_logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: compact ? 14 : 18, fontWeight: 900, color: accentText }}>{initials}</span>}
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
          {invite.club_name}
        </div>
        <div style={{ fontSize: compact ? 16 : 20, fontWeight: 800, color: '#F9FAFB', letterSpacing: '-0.4px', lineHeight: 1.25 }}>
          {compact ? 'Join your team' : `You've been invited!`}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9CA3AF', marginBottom: 6, letterSpacing: '0.02em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function AppStoreButton({ accent, accentText }: { accent: string; accentText: string }) {
  return (
    <a
      href="https://apps.apple.com/app/pulse-fc/id6740793498"
      className="app-store-btn"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        background: accent, color: accentText,
        borderRadius: 14, padding: '14px 24px',
        textDecoration: 'none', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        transition: 'filter 0.15s',
        width: '100%', boxSizing: 'border-box',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill={accentText}>
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.85, lineHeight: 1 }}>Download on the</div>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.3 }}>App Store</div>
      </div>
    </a>
  );
}

function Spinner({ color = '#000' }: { color?: string }) {
  return (
    <div style={{
      width: 16, height: 16, border: `2.5px solid ${color}44`, borderTopColor: color,
      borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0,
    }} />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#070707',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px 48px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },
  pitchBg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    background: '#111111',
    border: '1px solid #1E1E1E',
    borderRadius: 24,
    width: '100%',
    maxWidth: 440,
    overflow: 'hidden',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
  accentBar: {
    height: 4,
  },
  center: {
    padding: '48px 32px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  heading: {
    fontSize: 26,
    fontWeight: 800,
    color: '#F9FAFB',
    margin: '0 0 12px',
    letterSpacing: '-0.5px',
    lineHeight: 1.2,
  },
  sub: {
    fontSize: 15,
    color: '#9CA3AF',
    margin: '0 0 24px',
    lineHeight: 1.65,
    textAlign: 'center',
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#6B7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: 700,
    color: '#E5E7EB',
  },
  formHeading: {
    fontSize: 22,
    fontWeight: 800,
    color: '#F9FAFB',
    margin: '0 0 6px',
    letterSpacing: '-0.4px',
  },
  formSub: {
    fontSize: 14,
    color: '#6B7280',
    margin: '0 0 24px',
    lineHeight: 1.6,
  },
  input: {
    width: '100%',
    background: '#1A1A1A',
    border: '1.5px solid #2A2A2A',
    borderRadius: 12,
    padding: '13px 16px',
    fontSize: 15,
    color: '#F9FAFB',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    padding: 4,
    lineHeight: 1,
  },
  primaryBtn: {
    width: '100%',
    border: 'none',
    borderRadius: 14,
    padding: '15px 24px',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '-0.2px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    transition: 'filter 0.15s, transform 0.1s',
  },
  outlineBtn: {
    width: '100%',
    background: 'transparent',
    border: '1.5px solid #2A2A2A',
    borderRadius: 14,
    padding: '14px 24px',
    fontSize: 15,
    fontWeight: 600,
    color: '#9CA3AF',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s, color 0.15s',
  },
  ghostBtn: {
    display: 'block',
    width: '100%',
    background: 'none',
    border: 'none',
    color: '#6B7280',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '8px 0',
    textAlign: 'center',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 13,
    color: '#F87171',
    marginBottom: 20,
    lineHeight: 1.5,
  },
  footer: {
    padding: '14px 28px',
    borderTop: '1px solid #161616',
    textAlign: 'center',
    fontSize: 11,
    color: '#374151',
  },
};

// ─── Export ───────────────────────────────────────────────────────────────────

export default function JoinPage() {
  return (
    <Suspense>
      <JoinContent />
    </Suspense>
  );
}
