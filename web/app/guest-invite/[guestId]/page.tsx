'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type GuestData = {
  guest_id:    string;
  full_name:   string;
  role:        'player' | 'coach';
  status:      'pending' | 'confirmed' | 'declined';
  event_title: string;
  event_type:  string;
  event_date:  string;
  event_time:  string | null;
  location:    string | null;
  home_away:   string | null;
  team_name:   string | null;
  club_name:   string | null;
  club_logo:   string | null;
  club_color:  string | null;
  club_slug:   string | null;
  error?:      string;
};

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function resolveAccent(hex: string | null | undefined): string {
  if (!hex) return '#22C55E';
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#22C55E';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)) return '#22C55E';
  return hex;
}

function contrastText(hex: string) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return ((r * 299 + g * 587 + b * 114) / 1000) > 145 ? '#000' : '#fff';
}

export default function GuestInvitePage() {
  const { guestId } = useParams<{ guestId: string }>();
  const [data, setData]     = useState<GuestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
  const [done, setDone]     = useState<'accepted' | 'declined' | null>(null);

  useEffect(() => {
    if (!guestId) { setLoading(false); return; }
    fetch(`/api/guest-invite/respond?guestId=${guestId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, [guestId]);

  async function handleAction(action: 'accept' | 'decline') {
    if (!guestId) return;
    setPending(action);
    const r = await fetch('/api/guest-invite/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestId, action }),
    });
    const result = await r.json();
    if (result.ok) {
      setDone(action === 'accept' ? 'accepted' : 'declined');
      setData(prev => prev ? { ...prev, status: result.status } : prev);
    }
    setPending(null);
  }

  const accent    = resolveAccent(data?.club_color);
  const btnColor  = contrastText(accent);
  const initials  = (data?.club_name ?? 'P').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  const page = (children: React.ReactNode) => (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        {/* Club header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          {data?.club_logo
            ? <img src={data.club_logo} alt="" style={{ height: '60px', objectFit: 'contain', borderRadius: '14px' }} />
            : <div style={{ width: '60px', height: '60px', borderRadius: '14px', background: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: '900', color: btnColor }}>{initials}</div>}
          {data?.club_name && <div style={{ marginTop: '10px', fontSize: '16px', fontWeight: '800', color: '#f9fafb' }}>{data.club_name}</div>}
        </div>

        {/* Card */}
        <div style={{
          background: '#111111', border: '1px solid #222',
          borderRadius: '20px', overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ height: '3px', background: accent }} />
          <div style={{ padding: '28px 28px 20px' }}>
            {children}
          </div>
        </div>

        <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '12px', color: '#4b5563' }}>
          Powered by <a href="https://pulse-fc.app" style={{ color: accent, textDecoration: 'none', fontWeight: '600' }}>Pulse FC</a>
        </p>
      </div>
    </div>
  );

  if (loading) return page(
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ width: '32px', height: '32px', border: `3px solid ${accent}`, borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!data || data.error) return page(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '40px', marginBottom: '12px' }}>🤔</div>
      <div style={{ fontSize: '17px', fontWeight: '700', color: '#f9fafb', marginBottom: '8px' }}>Invite not found</div>
      <div style={{ fontSize: '14px', color: '#6b7280' }}>This link may have expired or already been used.</div>
    </div>
  );

  const alreadyResponded = data.status !== 'pending';
  const isCoach = data.role === 'coach';
  const typeLabel = data.event_type === 'game' ? 'Game' : data.event_type === 'training' ? 'Training' : 'Event';

  if (done || alreadyResponded) {
    const isAccepted = done === 'accepted' || data.status === 'confirmed';
    return page(
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{isAccepted ? '✅' : '❌'}</div>
        <div style={{ fontSize: '20px', fontWeight: '800', color: '#f9fafb', marginBottom: '8px' }}>
          {isAccepted ? "You're in!" : "Invitation declined"}
        </div>
        <div style={{ fontSize: '14px', color: '#9ca3af', lineHeight: '1.6', marginBottom: '24px' }}>
          {isAccepted
            ? `${data.full_name} is confirmed as a guest ${isCoach ? 'coach' : 'player'} for ${data.team_name}. Open the Pulse FC app to view full event details.`
            : `You've declined the invitation. Contact your coach if you change your mind.`}
        </div>
        {/* Event summary */}
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '16px', textAlign: 'left' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{typeLabel}</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#f9fafb', marginBottom: '12px' }}>{data.event_title}</div>
          <div style={{ fontSize: '13px', color: '#9ca3af' }}>📅 {formatDate(data.event_date)}</div>
          {data.event_time && <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>⏰ {formatTime(data.event_time)}</div>}
          {data.location && <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>📍 {data.location}</div>}
        </div>
      </div>
    );
  }

  return page(
    <>
      {/* Eyebrow */}
      <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>
        Guest {isCoach ? 'coaching' : 'player'} invitation
      </div>

      {/* Headline */}
      <div style={{ fontSize: '20px', fontWeight: '800', color: '#f9fafb', lineHeight: '1.3', marginBottom: '6px' }}>
        {isCoach
          ? <>You've been invited to guest coach <span style={{ color: accent }}>{data.team_name}</span></>
          : <><span style={{ color: accent }}>{data.full_name}</span> has been invited to guest {isCoach ? 'coach' : 'play'} for <span style={{ color: accent }}>{data.team_name}</span></>}
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: '#1e1e1e', margin: '20px 0' }} />

      {/* Event card */}
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '18px 20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.5px' }}>{typeLabel.toUpperCase()}</span>
          {data.home_away && (
            <span style={{
              fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.5px',
              background: data.home_away === 'home' ? 'rgba(34,197,94,0.12)' : 'rgba(96,165,250,0.12)',
              color: data.home_away === 'home' ? '#22C55E' : '#60A5FA',
            }}>{data.home_away === 'home' ? 'HOME' : 'AWAY'}</span>
          )}
        </div>
        <div style={{ fontSize: '17px', fontWeight: '800', color: '#f9fafb', marginBottom: '14px' }}>{data.event_title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#d1d5db' }}>
            <span>📅</span>
            <div>
              <div style={{ fontWeight: '600' }}>{formatDate(data.event_date)}</div>
              {data.event_time && <div style={{ color: '#9ca3af', fontSize: '13px' }}>{formatTime(data.event_time)}</div>}
            </div>
          </div>
          {data.location && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: '#d1d5db' }}>
              <span>📍</span>
              <span style={{ fontWeight: '600' }}>{data.location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Accept / Decline */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={() => handleAction('accept')}
          disabled={pending !== null}
          style={{
            flex: 1, padding: '16px', borderRadius: '12px', border: 'none', cursor: 'pointer',
            background: pending === 'accept' ? '#15803d' : accent, color: btnColor,
            fontSize: '16px', fontWeight: '800', opacity: pending && pending !== 'accept' ? 0.5 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {pending === 'accept' ? 'Confirming…' : '✓  Accept'}
        </button>
        <button
          onClick={() => handleAction('decline')}
          disabled={pending !== null}
          style={{
            flex: 1, padding: '16px', borderRadius: '12px', border: '1px solid #333', cursor: 'pointer',
            background: '#1a1a1a', color: '#9ca3af',
            fontSize: '16px', fontWeight: '700', opacity: pending && pending !== 'decline' ? 0.5 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {pending === 'decline' ? 'Declining…' : '✕  Decline'}
        </button>
      </div>

      <div style={{ marginTop: '16px', fontSize: '12px', color: '#4b5563', textAlign: 'center', lineHeight: '1.6' }}>
        Accepting confirms {isCoach ? 'you' : data.full_name} as a guest {isCoach ? 'coach' : 'player'}. Open the Pulse FC app to view full details.
      </div>
    </>
  );
}
