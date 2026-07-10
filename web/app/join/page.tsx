'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function JoinContent() {
  const params   = useSearchParams();
  const token    = params.get('token') ?? '';
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!token) return;
    // Try to open the app via custom scheme. On iOS this silently fails
    // if the app isn't installed — the App Store link below acts as fallback.
    const timer = setTimeout(() => setTried(true), 800);
    window.location.href = `pulsefc://join?token=${token}`;
    return () => clearTimeout(timer);
  }, [token]);

  return (
    <main style={styles.root}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoWrap}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="14" fill="#22C55E" fillOpacity="0.12" />
            <circle cx="24" cy="24" r="13" stroke="#22C55E" strokeWidth="2.5" fill="none" />
            <path d="M24 11 L24 37 M11 24 L37 24 M15.5 15.5 L32.5 32.5 M32.5 15.5 L15.5 32.5"
              stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <h1 style={styles.title}>You've been invited!</h1>
        <p style={styles.sub}>
          Your coach has added you to a team on Pulse&nbsp;FC.<br />
          Open the app to accept your invite.
        </p>

        {token && (
          <div style={styles.codeBox}>
            <p style={styles.codeLabel}>Your invite code</p>
            <p style={styles.code}>{token}</p>
            <p style={styles.codeHint}>You can also enter this manually in the app</p>
          </div>
        )}

        <a
          href={`pulsefc://join?token=${token}`}
          style={styles.primaryBtn}
        >
          Open in Pulse FC
        </a>

        <p style={styles.orText}>Don't have the app yet?</p>

        <a
          href="https://apps.apple.com/app/pulse-fc/id6740793498"
          style={styles.secondaryBtn}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8, flexShrink: 0 }}>
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          Download on the App Store
        </a>

        <p style={styles.footer}>
          <a href="https://pulse-fc.app" style={styles.footerLink}>pulse-fc.app</a>
        </p>
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinContent />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    backgroundColor: '#0A0A0A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    backgroundColor: '#141414',
    border: '1px solid #262626',
    borderRadius: 24,
    padding: '40px 32px',
    maxWidth: 400,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  logoWrap: {
    marginBottom: 8,
  },
  title: {
    color: '#F9FAFB',
    fontSize: 26,
    fontWeight: 800,
    margin: 0,
    textAlign: 'center',
    letterSpacing: '-0.5px',
  },
  sub: {
    color: '#9CA3AF',
    fontSize: 15,
    textAlign: 'center',
    margin: 0,
    lineHeight: 1.6,
  },
  codeBox: {
    backgroundColor: '#0A0A0A',
    border: '1px solid #262626',
    borderRadius: 14,
    padding: '16px 20px',
    width: '100%',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  codeLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    margin: '0 0 8px',
  },
  code: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'monospace',
    wordBreak: 'break-all',
    margin: '0 0 6px',
  },
  codeHint: {
    color: '#6B7280',
    fontSize: 12,
    margin: 0,
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    color: '#000',
    fontWeight: 800,
    fontSize: 15,
    borderRadius: 14,
    padding: '14px 24px',
    textDecoration: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  orText: {
    color: '#6B7280',
    fontSize: 13,
    margin: 0,
  },
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
    color: '#F9FAFB',
    fontWeight: 700,
    fontSize: 14,
    borderRadius: 14,
    padding: '14px 24px',
    textDecoration: 'none',
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #262626',
  },
  footer: {
    margin: '8px 0 0',
    fontSize: 12,
    color: '#4B5563',
  },
  footerLink: {
    color: '#4B5563',
    textDecoration: 'none',
  },
};
