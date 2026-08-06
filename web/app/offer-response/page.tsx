'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

type ResponseData = {
  ok?: boolean;
  action?: string;
  already_responded?: boolean;
  player_name?: string;
  team_name?: string;
  club_name?: string;
  club_logo?: string;
  club_color?: string;
  current_status?: string;
  error?: string;
};

function resolveAccent(hex: string | null | undefined): string {
  if (!hex) return '#22C55E';
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#22C55E';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
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

function OfferResponseContent() {
  const params = useSearchParams();
  const token  = params.get('token');
  const action = params.get('action') as 'accept' | 'decline' | null;

  const [data,    setData]    = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`/api/tryout/process-response?token=${token}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
        if (action && d.current_status === 'NotSent' || d.current_status === 'Sent') {
          handleAction(action as 'accept' | 'decline');
        }
      });
  }, [token]);

  async function handleAction(act: 'accept' | 'decline') {
    if (!token) return;
    setPending(act);
    try {
      const r = await fetch('/api/tryout/process-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: act }),
      });
      const d = await r.json();
      setData(d);
    } finally {
      setPending(null);
    }
  }

  const accent   = resolveAccent(data?.club_color);
  const btnColor = contrastText(accent);
  const ini      = (data?.club_name ?? '').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  const shell = (children: React.ReactNode) => (
    <div style={{
      minHeight: '100vh', background: '#080808',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      {/* Subtle top glow */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '500px', height: '180px', pointerEvents: 'none',
        background: `radial-gradient(ellipse at 50% 0%, ${accent}18 0%, transparent 70%)`,
      }} />

      <div style={{ maxWidth: '440px', width: '100%', position: 'relative', zIndex: 1 }}>
        {/* Club header */}
        {(data?.club_name || data?.club_logo) && (
          <div style={{ textAlign: 'center', marginBottom: '22px' }}>
            {data.club_logo
              ? <img src={data.club_logo} alt="" style={{ height: '52px', objectFit: 'contain', borderRadius: '12px' }} />
              : (
                <div style={{
                  width: '52px', height: '52px', borderRadius: '14px',
                  background: `linear-gradient(135deg, ${accent}cc, ${accent}88)`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', fontWeight: '900', color: btnColor,
                  boxShadow: `0 4px 20px ${accent}44`,
                }}>
                  {ini}
                </div>
              )}
            {data.club_name && (
              <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: '700', color: '#e5e7eb', letterSpacing: '-0.2px' }}>
                {data.club_name}
              </div>
            )}
          </div>
        )}

        {/* Card */}
        <div style={{
          background: '#111', border: '1px solid #1f1f1f',
          borderRadius: '20px', overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}>
          <div style={{ height: '2px', background: `linear-gradient(90deg, ${accent}, ${accent}66)` }} />
          <div style={{ padding: '28px', textAlign: 'center' }}>
            {children}
          </div>
        </div>

        <p style={{ marginTop: '18px', textAlign: 'center', fontSize: '11px', color: '#374151' }}>
          Powered by{' '}
          <a href="https://pulse-fc.app" style={{ color: '#4b5563', textDecoration: 'none', fontWeight: '600' }}>
            Pulse FC
          </a>
        </p>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!token) return shell(
    <>
      <div style={{ fontSize: '36px', marginBottom: '14px' }}>🔗</div>
      <div style={{ fontSize: '17px', fontWeight: '800', color: '#f3f4f6', marginBottom: '8px' }}>Invalid link</div>
      <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6' }}>This offer link is missing a token. Check your email for the correct link.</div>
    </>
  );

  if (loading) return shell(
    <div style={{ padding: '20px 0' }}>
      <div style={{ width: '28px', height: '28px', border: `2px solid ${accent}33`, borderTopColor: accent, borderRadius: '50%', margin: '0 auto', animation: 'spin 0.75s linear infinite' }} />
      <div style={{ marginTop: '14px', fontSize: '13px', color: '#6b7280' }}>Loading your offer…</div>
    </div>
  );

  if (data?.error) return shell(
    <>
      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', marginBottom: '14px' }}>
        🔗
      </div>
      <div style={{ fontSize: '17px', fontWeight: '800', color: '#f3f4f6', marginBottom: '8px' }}>Link invalid</div>
      <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6' }}>{data.error}</div>
    </>
  );

  if (data?.already_responded || (['Accepted', 'Declined'].includes(data?.current_status ?? ''))) {
    const wasAccepted = data?.action === 'accept' || data?.current_status === 'Accepted';
    return shell(
      <>
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: wasAccepted ? `${accent}22` : 'rgba(75,85,99,0.2)', border: `1px solid ${wasAccepted ? `${accent}44` : '#374151'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', marginBottom: '16px' }}>
          {wasAccepted ? '✓' : '✕'}
        </div>
        <div style={{ fontSize: '19px', fontWeight: '800', color: '#f9fafb', marginBottom: '8px' }}>Already responded</div>
        <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.6' }}>
          You've already {wasAccepted ? 'accepted' : 'declined'} this offer{data?.team_name ? ` for ${data.team_name}` : ''}.
        </div>
      </>
    );
  }

  if (data?.ok && data?.action === 'accept') return shell(
    <>
      <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: `${accent}20`, border: `2px solid ${accent}55`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginBottom: '18px', color: accent }}>
        ✓
      </div>
      <div style={{ fontSize: '20px', fontWeight: '800', color: '#f9fafb', marginBottom: '8px' }}>
        Welcome to {data.team_name}!
      </div>
      <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.65', marginBottom: '24px', maxWidth: '320px', margin: '0 auto 24px' }}>
        {data.player_name ? `${data.player_name}'s` : 'Your'} spot has been confirmed on <strong style={{ color: '#e5e7eb' }}>{data.team_name}</strong>. Download the Pulse FC app to connect with your team.
      </div>
      <a href="https://apps.apple.com/app/pulse-fc/id6740793498" target="_blank" rel="noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: accent, color: btnColor, borderRadius: '12px', padding: '13px 28px', fontWeight: '700', fontSize: '15px', textDecoration: 'none', boxShadow: `0 4px 16px ${accent}44` }}>
        Download Pulse FC →
      </a>
    </>
  );

  if (data?.ok && data?.action === 'decline') return shell(
    <>
      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(75,85,99,0.15)', border: '1px solid #374151', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', marginBottom: '16px' }}>
        ✕
      </div>
      <div style={{ fontSize: '19px', fontWeight: '800', color: '#f9fafb', marginBottom: '8px' }}>Response recorded</div>
      <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.6' }}>
        Thank you for letting us know. We've recorded your decision and wish {data.player_name ?? 'your player'} the best.
      </div>
    </>
  );

  // Pending — show accept/decline buttons
  return shell(
    <>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '14px' }}>
        Roster offer
      </div>
      <div style={{ fontSize: '19px', fontWeight: '800', color: '#f9fafb', lineHeight: '1.35', marginBottom: '8px' }}>
        {data?.player_name} has received a roster offer
      </div>
      {data?.team_name && (
        <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '24px' }}>
          {data.team_name}{data?.club_name ? ` · ${data.club_name}` : ''}
        </div>
      )}

      <div style={{ height: '1px', background: '#1e1e1e', margin: '0 0 24px' }} />

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button
          onClick={() => handleAction('accept')}
          disabled={!!pending}
          style={{
            flex: 1, padding: '15px', borderRadius: '12px', border: 'none',
            background: pending === 'accept' ? `${accent}cc` : accent,
            color: btnColor, fontSize: '15px', fontWeight: '800',
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending && pending !== 'accept' ? 0.4 : 1,
            transition: 'opacity 0.15s',
            boxShadow: pending ? 'none' : `0 4px 16px ${accent}44`,
          }}
        >
          {pending === 'accept' ? 'Accepting…' : '✓  Accept'}
        </button>
        <button
          onClick={() => handleAction('decline')}
          disabled={!!pending}
          style={{
            flex: 1, padding: '15px', borderRadius: '12px',
            border: '1px solid #2a2a2a', background: '#161616',
            color: '#9ca3af', fontSize: '15px', fontWeight: '700',
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending && pending !== 'decline' ? 0.4 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {pending === 'decline' ? 'Declining…' : '✕  Decline'}
        </button>
      </div>
    </>
  );
}

export default function OfferResponsePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '28px', height: '28px', border: '2px solid #22C55E33', borderTopColor: '#22C55E', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <OfferResponseContent />
    </Suspense>
  );
}
