'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

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

type ClubInfo = { name: string; logo_url: string | null; primary_color: string | null };

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

function initials(name: string | null | undefined) {
  return (name ?? 'P').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

export default function GuestInvitePage() {
  const { guestId }    = useParams<{ guestId: string }>();
  const searchParams   = useSearchParams();
  const clubSlugParam  = searchParams.get('club');
  const actionParam    = searchParams.get('action') as 'accept' | 'decline' | null;

  const [data,      setData]      = useState<GuestData | null>(null);
  const [fallbackClub, setFallbackClub] = useState<ClubInfo | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [pending,   setPending]   = useState<'accept' | 'decline' | null>(null);
  const [done,      setDone]      = useState<'accepted' | 'declined' | null>(null);
  const autoFired = useRef(false);

  useEffect(() => {
    if (!guestId) { setLoading(false); return; }
    fetch(`/api/guest-invite/respond?guestId=${guestId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, [guestId]);

  // Fetch fallback club info from slug so we can brand the error state
  useEffect(() => {
    if (!clubSlugParam) return;
    fetch(`/api/club-public?slug=${encodeURIComponent(clubSlugParam)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setFallbackClub(d); });
  }, [clubSlugParam]);

  // Auto-submit action if it came in from the email link
  useEffect(() => {
    if (autoFired.current) return;
    if (!data || data.error || data.status !== 'pending') return;
    if (actionParam !== 'accept' && actionParam !== 'decline') return;
    autoFired.current = true;
    handleAction(actionParam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, actionParam]);

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

  const clubName  = data?.club_name  ?? fallbackClub?.name  ?? null;
  const clubLogo  = data?.club_logo  ?? fallbackClub?.logo_url ?? null;
  const clubColor = data?.club_color ?? fallbackClub?.primary_color ?? null;

  const accent   = resolveAccent(clubColor);
  const btnColor = contrastText(accent);
  const ini      = initials(clubName);

  const shell = (children: React.ReactNode) => (
    <div style={{
      minHeight: '100vh',
      background: '#080808',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      {/* Subtle accent glow at top */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '200px', pointerEvents: 'none',
        background: `radial-gradient(ellipse at 50% 0%, ${accent}18 0%, transparent 70%)`,
      }} />

      <div style={{ maxWidth: '440px', width: '100%', position: 'relative', zIndex: 1 }}>
        {/* Club header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          {clubLogo
            ? <img src={clubLogo} alt="" style={{ height: '56px', objectFit: 'contain', borderRadius: '12px' }} />
            : (
              <div style={{
                width: '56px', height: '56px', borderRadius: '14px',
                background: `linear-gradient(135deg, ${accent}cc, ${accent}88)`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', fontWeight: '900', color: btnColor,
                boxShadow: `0 4px 20px ${accent}44`,
              }}>
                {ini}
              </div>
            )}
          {clubName && (
            <div style={{ marginTop: '10px', fontSize: '15px', fontWeight: '700', color: '#e5e7eb', letterSpacing: '-0.2px' }}>
              {clubName}
            </div>
          )}
        </div>

        {/* Card */}
        <div style={{
          background: '#111', border: '1px solid #1f1f1f',
          borderRadius: '20px', overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}>
          <div style={{ height: '2px', background: `linear-gradient(90deg, ${accent}, ${accent}88)` }} />
          <div style={{ padding: '28px' }}>
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

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // Loading
  if (loading) return shell(
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{
        width: '28px', height: '28px',
        border: `2px solid ${accent}33`, borderTopColor: accent,
        borderRadius: '50%', margin: '0 auto',
        animation: 'spin 0.75s linear infinite',
      }} />
      <div style={{ marginTop: '14px', fontSize: '13px', color: '#6b7280' }}>Loading invitation…</div>
    </div>
  );

  // Auto-action in progress (came from email link)
  if (actionParam && !done && !data?.error && data?.status === 'pending' && pending) return shell(
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{
        width: '28px', height: '28px',
        border: `2px solid ${accent}33`, borderTopColor: accent,
        borderRadius: '50%', margin: '0 auto',
        animation: 'spin 0.75s linear infinite',
      }} />
      <div style={{ marginTop: '14px', fontSize: '13px', color: '#6b7280' }}>
        {actionParam === 'accept' ? 'Confirming your response…' : 'Declining invitation…'}
      </div>
    </div>
  );

  // Error / not found
  if (!data || data.error) return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '50%',
        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '22px', marginBottom: '16px',
      }}>
        🔗
      </div>
      <div style={{ fontSize: '17px', fontWeight: '800', color: '#f3f4f6', marginBottom: '8px' }}>
        Invite not found
      </div>
      <div style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6', maxWidth: '300px', margin: '0 auto' }}>
        This link may have expired or already been used. Contact your coach for a new invite.
      </div>
    </div>
  );

  const isCoach         = data.role === 'coach';
  const alreadyResponded = data.status !== 'pending';
  const typeLabel        = data.event_type === 'game' ? 'Game' : data.event_type === 'training' ? 'Training' : 'Event';

  // Already responded or just finished
  if (done || alreadyResponded) {
    const isAccepted = done === 'accepted' || data.status === 'confirmed';
    return shell(
      <div>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto 14px',
            background: isAccepted ? `${accent}22` : 'rgba(75,85,99,0.2)',
            border: `1px solid ${isAccepted ? `${accent}44` : '#374151'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px',
          }}>
            {isAccepted ? '✓' : '✕'}
          </div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: '#f9fafb', marginBottom: '6px' }}>
            {isAccepted ? "You're confirmed!" : "Invitation declined"}
          </div>
          <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.6', maxWidth: '320px', margin: '0 auto' }}>
            {isAccepted
              ? `${data.full_name} is confirmed as a guest ${isCoach ? 'coach' : 'player'} for ${data.team_name}.`
              : `You've declined this invitation. Reach out to your coach if you change your mind.`}
          </div>
        </div>

        <div style={{ height: '1px', background: '#1e1e1e', margin: '20px 0' }} />

        <div style={{ background: '#0f0f0f', border: '1px solid #1f1f1f', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '10px' }}>
            {typeLabel}
          </div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#f3f4f6', marginBottom: '12px' }}>{data.event_title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '13px', color: '#9ca3af' }}>📅 {formatDate(data.event_date)}</div>
            {data.event_time && <div style={{ fontSize: '13px', color: '#9ca3af' }}>⏰ {formatTime(data.event_time)}</div>}
            {data.location && <div style={{ fontSize: '13px', color: '#9ca3af' }}>📍 {data.location}</div>}
          </div>
        </div>
      </div>
    );
  }

  // Pending — show accept/decline
  return shell(
    <>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' }}>
        Guest {isCoach ? 'coaching' : 'player'} invitation
      </div>

      <div style={{ fontSize: '19px', fontWeight: '800', color: '#f9fafb', lineHeight: '1.35', marginBottom: '20px' }}>
        {isCoach
          ? <>You've been invited to guest coach <span style={{ color: accent }}>{data.team_name}</span></>
          : <><span style={{ color: accent }}>{data.full_name}</span> is invited to guest play for <span style={{ color: accent }}>{data.team_name}</span></>}
      </div>

      {/* Event card */}
      <div style={{
        background: '#0f0f0f', border: '1px solid #1f1f1f',
        borderRadius: '14px', padding: '18px', marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{
            background: 'rgba(245,158,11,0.12)', color: '#F59E0B',
            fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px', letterSpacing: '0.8px',
          }}>
            {typeLabel.toUpperCase()}
          </span>
          {data.home_away && (
            <span style={{
              fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px', letterSpacing: '0.8px',
              background: data.home_away === 'home' ? 'rgba(34,197,94,0.1)' : 'rgba(96,165,250,0.1)',
              color: data.home_away === 'home' ? '#22C55E' : '#60A5FA',
            }}>
              {data.home_away === 'home' ? 'HOME' : 'AWAY'}
            </span>
          )}
        </div>

        <div style={{ fontSize: '16px', fontWeight: '700', color: '#f3f4f6', marginBottom: '14px' }}>
          {data.event_title}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: '#d1d5db' }}>
            <span>📅</span>
            <div>
              <div style={{ fontWeight: '600' }}>{formatDate(data.event_date)}</div>
              {data.event_time && <div style={{ color: '#9ca3af', marginTop: '2px' }}>{formatTime(data.event_time)}</div>}
            </div>
          </div>
          {data.location && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: '#d1d5db' }}>
              <span>📍</span>
              <span style={{ fontWeight: '600' }}>{data.location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={() => handleAction('accept')}
          disabled={pending !== null}
          style={{
            flex: 1, padding: '15px', borderRadius: '12px', border: 'none', cursor: pending ? 'not-allowed' : 'pointer',
            background: pending === 'accept' ? `${accent}cc` : accent,
            color: btnColor, fontSize: '15px', fontWeight: '800',
            opacity: pending && pending !== 'accept' ? 0.4 : 1,
            transition: 'opacity 0.15s, transform 0.1s',
            boxShadow: pending ? 'none' : `0 4px 16px ${accent}44`,
          }}
        >
          {pending === 'accept' ? 'Confirming…' : '✓  Accept'}
        </button>
        <button
          onClick={() => handleAction('decline')}
          disabled={pending !== null}
          style={{
            flex: 1, padding: '15px', borderRadius: '12px',
            border: '1px solid #2a2a2a', cursor: pending ? 'not-allowed' : 'pointer',
            background: '#161616', color: '#9ca3af',
            fontSize: '15px', fontWeight: '700',
            opacity: pending && pending !== 'decline' ? 0.4 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {pending === 'decline' ? 'Declining…' : '✕  Decline'}
        </button>
      </div>

      <div style={{ marginTop: '14px', fontSize: '11px', color: '#4b5563', textAlign: 'center', lineHeight: '1.6' }}>
        Accepting confirms {isCoach ? 'you' : data.full_name} as a guest {isCoach ? 'coach' : 'player'} for this event.
      </div>
    </>
  );
}
