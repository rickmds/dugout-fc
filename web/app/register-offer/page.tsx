'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

type RegData = {
  error?: string;
  already_submitted?: boolean;
  player_name?: string;
  team_name?: string;
  club_name?: string;
  club_logo?: string;
  club_color?: string;
  player?: {
    emergency_contact_name: string;
    emergency_contact_phone: string;
    emergency_contact_relationship: string;
    medical_notes: string;
    jersey_size: string;
    shorts_size: string;
    image_permission: boolean;
  };
  agreement_signed_name?: string;
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

const lbl: React.CSSProperties = { fontSize: '12.5px', fontWeight: '600', color: '#9ca3af', display: 'block', marginBottom: '6px' };
const inp: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: '10px', fontSize: '14.5px',
  color: '#f3f4f6', background: '#161616', border: '1px solid #2a2a2a', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
};

function RegisterOfferContent() {
  const params = useSearchParams();
  const token = params.get('token');
  const router = useRouter();

  const [data, setData] = useState<RegData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRel, setContactRel] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [jerseySize, setJerseySize] = useState('');
  const [shortsSize, setShortsSize] = useState('');
  const [imagePermission, setImagePermission] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signedName, setSignedName] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call, not derivable at render time
    if (!token) { setLoading(false); return; }
    fetch(`/api/tryout/registration?token=${token}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        if (d.player) {
          setContactName(d.player.emergency_contact_name ?? '');
          setContactPhone(d.player.emergency_contact_phone ?? '');
          setContactRel(d.player.emergency_contact_relationship ?? '');
          setMedicalNotes(d.player.medical_notes ?? '');
          setJerseySize(d.player.jersey_size ?? '');
          setShortsSize(d.player.shorts_size ?? '');
          setImagePermission(!!d.player.image_permission);
        }
        if (d.agreement_signed_name) setSignedName(d.agreement_signed_name);
        setLoading(false);
      })
      .catch(() => { setData({ error: 'Could not load your registration. Check your connection and try again.' }); setLoading(false); });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!contactName.trim() || !contactPhone.trim()) { setSubmitError('Emergency contact name and phone are required.'); return; }
    if (!agreed || !signedName.trim()) { setSubmitError('Please sign the Player/Parent Agreement to continue.'); return; }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/tryout/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          emergency_contact_name: contactName,
          emergency_contact_phone: contactPhone,
          emergency_contact_relationship: contactRel,
          medical_notes: medicalNotes,
          jersey_size: jerseySize,
          shorts_size: shortsSize,
          image_permission: imagePermission,
          agreement_signed_name: signedName,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setSubmitError(d.error ?? 'Could not submit your registration. Please try again.'); return; }

      // If the club has a cost/installment plan configured for this
      // player's age group, send them straight into paying what's due now
      // instead of ending at a bare "you're all set" screen.
      try {
        const instRes = await fetch('/api/tryout/create-installments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const instData = await instRes.json();
        if (instRes.ok && instData.due_now?.token) {
          router.push(`/pay-tryout/${instData.due_now.token}`);
          return;
        }
      } catch (err) {
        console.error('tryout create-installments failed:', err);
        // Registration itself already succeeded — fall through to the
        // normal success screen; payment can still be arranged manually.
      }

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSubmitError('Could not submit your registration — check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const accent = resolveAccent(data?.club_color);
  const btnColor = contrastText(accent);
  const ini = (data?.club_name ?? '').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  const shell = (children: React.ReactNode, wide = false) => (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '500px', height: '180px', pointerEvents: 'none', background: `radial-gradient(ellipse at 50% 0%, ${accent}18 0%, transparent 70%)` }} />
      <div style={{ maxWidth: wide ? '560px' : '440px', width: '100%', position: 'relative', zIndex: 1 }}>
        {(data?.club_name || data?.club_logo) && (
          <div style={{ textAlign: 'center', marginBottom: '22px' }}>
            {data?.club_logo
              // eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (Supabase Storage), next/image remotePatterns not configured
              ? <img src={data.club_logo} alt="" style={{ height: '52px', objectFit: 'contain', borderRadius: '12px' }} />
              : <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: `linear-gradient(135deg, ${accent}cc, ${accent}88)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '900', color: btnColor, boxShadow: `0 4px 20px ${accent}44` }}>{ini}</div>}
            {data?.club_name && <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: '700', color: '#e5e7eb', letterSpacing: '-0.2px' }}>{data.club_name}</div>}
          </div>
        )}
        <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
          <div style={{ height: '2px', background: `linear-gradient(90deg, ${accent}, ${accent}66)` }} />
          <div style={{ padding: '28px' }}>{children}</div>
        </div>
        <p style={{ marginTop: '18px', textAlign: 'center', fontSize: '11px', color: '#374151' }}>
          Powered by <a href="https://pulse-fc.app" style={{ color: '#4b5563', textDecoration: 'none', fontWeight: '600' }}>Pulse FC</a>
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!token) return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '36px', marginBottom: '14px' }}>🔗</div>
      <div style={{ fontSize: '17px', fontWeight: '800', color: '#f3f4f6', marginBottom: '8px' }}>Invalid link</div>
      <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6' }}>This registration link is missing a token. Check your email for the correct link.</div>
    </div>
  );

  if (loading) return shell(
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ width: '28px', height: '28px', border: `2px solid ${accent}33`, borderTopColor: accent, borderRadius: '50%', margin: '0 auto', animation: 'spin 0.75s linear infinite' }} />
      <div style={{ marginTop: '14px', fontSize: '13px', color: '#6b7280' }}>Loading your registration…</div>
    </div>
  );

  if (data?.error) return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', marginBottom: '14px' }}>🔗</div>
      <div style={{ fontSize: '17px', fontWeight: '800', color: '#f3f4f6', marginBottom: '8px' }}>Link invalid</div>
      <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6' }}>{data.error}</div>
    </div>
  );

  if (submitted || data?.already_submitted) return shell(
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: `${accent}20`, border: `2px solid ${accent}55`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginBottom: '18px', color: accent }}>✓</div>
      <div style={{ fontSize: '20px', fontWeight: '800', color: '#f9fafb', marginBottom: '8px' }}>Registration complete!</div>
      <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.65', marginBottom: '24px', maxWidth: '320px', margin: '0 auto 24px' }}>
        {data?.player_name ?? 'Your player'} is all set for <strong style={{ color: '#e5e7eb' }}>{data?.team_name}</strong>. Download the Pulse FC app to connect with your team.
      </div>
      <a href="https://apps.apple.com/us/app/pulse-fc/id6797330659" target="_blank" rel="noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: accent, color: btnColor, borderRadius: '12px', padding: '13px 28px', fontWeight: '700', fontSize: '15px', textDecoration: 'none', boxShadow: `0 4px 16px ${accent}44` }}>
        Download Pulse FC →
      </a>
    </div>
  );

  return shell(
    <form onSubmit={handleSubmit}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>Complete your registration</div>
      <div style={{ fontSize: '18px', fontWeight: '800', color: '#f9fafb', lineHeight: '1.3', marginBottom: '4px' }}>{data?.player_name}</div>
      {data?.team_name && <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '20px' }}>{data.team_name}{data?.club_name ? ` · ${data.club_name}` : ''}</div>}

      <div style={{ height: '1px', background: '#1e1e1e', margin: '0 0 22px' }} />

      <div style={{ fontSize: '13px', fontWeight: '800', color: '#e5e7eb', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Emergency Contact</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label style={lbl}>Name *</label>
          <input value={contactName} onChange={e => setContactName(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Phone *</label>
          <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} style={inp} placeholder="(555) 000-0000" />
        </div>
      </div>
      <div style={{ marginBottom: '22px' }}>
        <label style={lbl}>Relationship to player</label>
        <input value={contactRel} onChange={e => setContactRel(e.target.value)} style={inp} placeholder="e.g. Mother, Father, Guardian" />
      </div>

      <div style={{ fontSize: '13px', fontWeight: '800', color: '#e5e7eb', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Medical & Kit</div>
      <div style={{ marginBottom: '14px' }}>
        <label style={lbl}>Medical notes / allergies</label>
        <textarea value={medicalNotes} onChange={e => setMedicalNotes(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="None, or describe any conditions the coach should know about" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
        <div>
          <label style={lbl}>Jersey size</label>
          <input value={jerseySize} onChange={e => setJerseySize(e.target.value)} style={inp} placeholder="e.g. Youth Medium" />
        </div>
        <div>
          <label style={lbl}>Shorts size</label>
          <input value={shortsSize} onChange={e => setShortsSize(e.target.value)} style={inp} placeholder="e.g. Youth Medium" />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '24px' }}>
        <input type="checkbox" checked={imagePermission} onChange={e => setImagePermission(e.target.checked)} style={{ marginTop: '3px', accentColor: accent }} />
        <span style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.5' }}>I give permission for {data?.club_name ?? 'the club'} to use photos/video of my player for team and club purposes (website, social media, etc).</span>
      </label>

      <div style={{ height: '1px', background: '#1e1e1e', margin: '0 0 22px' }} />

      <div style={{ fontSize: '13px', fontWeight: '800', color: '#e5e7eb', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Player / Parent Agreement</div>
      <div style={{ fontSize: '12.5px', color: '#6b7280', lineHeight: '1.7', background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
        By registering, I confirm the information above is accurate and agree to {data?.club_name ?? 'the club'}&apos;s attendance expectations, payment terms, and refund policy as described in the roster offer email. I understand my player&apos;s roster spot is contingent on completing registration and payment.
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '14px' }}>
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: '3px', accentColor: accent }} />
        <span style={{ fontSize: '13px', color: '#e5e7eb', fontWeight: '600' }}>I have read and agree to the above</span>
      </label>
      <div style={{ marginBottom: '24px' }}>
        <label style={lbl}>Type your full name as your signature *</label>
        <input value={signedName} onChange={e => setSignedName(e.target.value)} style={inp} placeholder="Full name" />
      </div>

      {submitError && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#fca5a5' }}>
          {submitError}
        </div>
      )}

      <button type="submit" disabled={submitting}
        style={{ width: '100%', padding: '15px', borderRadius: '12px', border: 'none', background: submitting ? `${accent}cc` : accent, color: btnColor, fontSize: '15px', fontWeight: '800', cursor: submitting ? 'not-allowed' : 'pointer', boxShadow: submitting ? 'none' : `0 4px 16px ${accent}44` }}>
        {submitting ? 'Submitting…' : 'Submit Registration'}
      </button>
    </form>,
    true,
  );
}

export default function RegisterOfferPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '28px', height: '28px', border: '2px solid #22C55E33', borderTopColor: '#22C55E', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <RegisterOfferContent />
    </Suspense>
  );
}
