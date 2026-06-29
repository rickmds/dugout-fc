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
  teamsnap_url?: string;
  current_status?: string;
  error?: string;
};

function OfferResponseContent() {
  const params = useSearchParams();
  const token = params.get('token');
  const action = params.get('action') as 'accept' | 'decline' | null;

  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    const url = `/api/tryout/process-response?token=${token}${action ? `&action=${action}` : ''}`;
    fetch(url).then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, [token, action]);

  async function handleAction(act: 'accept' | 'decline') {
    if (!token) return;
    setPending(act);
    const r = await fetch(`/api/tryout/process-response?token=${token}&action=${act}`);
    const d = await r.json();
    setData(d);
    setPending(null);
  }

  const color = data?.club_color && data.club_color !== '#000000' ? data.club_color : '#22C55E';

  const container = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '40px', maxWidth: '480px', width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.08)', textAlign: 'center' }}>
        {data?.club_logo && <img src={data.club_logo} alt="" style={{ height: '60px', objectFit: 'contain', marginBottom: '20px' }} />}
        {data?.club_name && !data.club_logo && (
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '800', color: '#fff', margin: '0 auto 20px' }}>
            {data.club_name.slice(0,2).toUpperCase()}
          </div>
        )}
        {children}
      </div>
    </div>
  );

  if (!token) return container(
    <><div style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A', marginBottom: '8px' }}>Invalid Link</div>
    <div style={{ fontSize: '14px', color: '#64748B' }}>This offer link is missing a token. Please check your email.</div></>
  );

  if (loading) return container(
    <div style={{ color: '#94A3B8', fontSize: '14px' }}>Loading your offer…</div>
  );

  if (data?.error) return container(
    <><div style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A', marginBottom: '8px' }}>Link Invalid</div>
    <div style={{ fontSize: '14px', color: '#64748B' }}>{data.error}</div></>
  );

  if (data?.already_responded || (['Accepted','Declined'].includes(data?.current_status ?? ''))) {
    const wasAccepted = data?.action === 'accept' || data?.current_status === 'Accepted';
    return container(<>
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>{wasAccepted ? '✅' : '👋'}</div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A', marginBottom: '8px' }}>Already Responded</div>
      <div style={{ fontSize: '14px', color: '#64748B' }}>
        You've already {wasAccepted ? 'accepted' : 'declined'} this offer{data?.team_name ? ` for ${data.team_name}` : ''}.
      </div>
    </>);
  }

  if (data?.ok && data?.action === 'accept') return container(<>
    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#F0FDF4', border: '2px solid #22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '24px' }}>✓</div>
    <div style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', marginBottom: '8px' }}>Welcome to {data.team_name}!</div>
    <div style={{ fontSize: '14px', color: '#64748B', marginBottom: data.teamsnap_url ? '24px' : '0', lineHeight: '1.6' }}>
      {data.player_name ? `${data.player_name}'s` : 'Your'} spot has been confirmed on <strong>{data.team_name}</strong> with {data.club_name}. We'll be in touch with next steps.
    </div>
    {data.teamsnap_url && (
      <a href={data.teamsnap_url} target="_blank" rel="noreferrer"
        style={{ display: 'inline-block', background: color, color: '#fff', borderRadius: '12px', padding: '12px 28px', fontWeight: '700', fontSize: '15px', textDecoration: 'none', marginTop: '8px' }}>
        Complete Registration →
      </a>
    )}
  </>);

  if (data?.ok && data?.action === 'decline') return container(<>
    <div style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', marginBottom: '8px' }}>Response Recorded</div>
    <div style={{ fontSize: '14px', color: '#64748B', lineHeight: '1.6' }}>
      Thank you for letting us know. We've recorded your decision and wish {data.player_name ?? 'your player'} the best.
    </div>
  </>);

  // Show two-button UI when no action in URL yet
  return container(<>
    <div style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', marginBottom: '8px' }}>Roster Offer</div>
    <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.6' }}>
      {data?.player_name} has received a roster offer{data?.team_name ? ` for ${data.team_name}` : ''}{data?.club_name ? ` from ${data.club_name}` : ''}. Please select a response below.
    </div>
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
      <button onClick={() => handleAction('accept')} disabled={!!pending}
        style={{ padding: '12px 28px', borderRadius: '12px', background: '#22C55E', color: '#fff', border: 'none', fontWeight: '700', fontSize: '15px', cursor: 'pointer', opacity: pending === 'accept' ? 0.7 : 1 }}>
        {pending === 'accept' ? 'Accepting…' : '✓ Accept'}
      </button>
      <button onClick={() => handleAction('decline')} disabled={!!pending}
        style={{ padding: '12px 28px', borderRadius: '12px', background: '#fff', color: '#EF4444', border: '2px solid #EF4444', fontWeight: '700', fontSize: '15px', cursor: 'pointer', opacity: pending === 'decline' ? 0.7 : 1 }}>
        {pending === 'decline' ? 'Declining…' : '✗ Decline'}
      </button>
    </div>
  </>);
}

export default function OfferResponsePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>Loading…</div>}>
      <OfferResponseContent />
    </Suspense>
  );
}
