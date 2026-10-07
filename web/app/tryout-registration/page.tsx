'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function uid() { return crypto.randomUUID(); }

// Darken/lighten a hex color by `percent` (negative = darker). Used to
// build a header gradient and hover states from the club's own single
// stored primary_color, without depending on CSS color-mix() support.
function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const FONT = 'var(--font), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const INK = '#0F172A';
const INK_SOFT = '#475569';
const INK_MUTE = '#94A3B8';
const LINE = '#E2E8F0';
const PAGE_BG = '#F7F8FA';

type Question = {
  id: string; type: string; label: string; helpText: string;
  required: boolean; options: string[]; fieldKey: string; builtIn: boolean;
};

type FormConfig = {
  formTitle: string; formSubtitle: string; welcomeText: string;
  locationText: string; sessionScheduleText: string; offerTimelineText: string;
  importantInfoText: string; contactText: string;
  seasonLabel: string; submitLabel: string; successTitle: string; successBody: string;
  gradeOptions: string[]; positionOptions: string[]; referralOptions: string[];
  questions: Question[];
};

// Replace {{clubName}} tokens in any string from the config
function fill(text: string, clubName: string) {
  return text.replace(/\{\{clubName\}\}/g, clubName);
}
function fillQ(q: Question, clubName: string): Question {
  return {
    ...q,
    label: fill(q.label, clubName),
    helpText: fill(q.helpText, clubName),
    options: q.options.map(o => fill(o, clubName)),
  };
}

// ─── Presentational primitives ─────────────────────────────────────────────

function SectionCard({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="trf-card-pad" style={{
      background: '#fff', borderRadius: '18px', padding: '30px',
      border: `1px solid ${LINE}`,
      boxShadow: '0 1px 2px rgba(15,23,42,0.03), 0 20px 40px -28px rgba(15,23,42,0.22)',
      borderTop: accent ? `3px solid ${accent}` : undefined,
    }}>
      {children}
    </div>
  );
}

function StepBadge({ n, color }: { n: number; color: string }) {
  return (
    <div style={{
      width: '26px', height: '26px', borderRadius: '8px', flexShrink: 0,
      background: `${color}14`, border: `1.5px solid ${color}3a`, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '12px', fontWeight: 800,
    }}>
      {n}
    </div>
  );
}

function SectionTitle({ step, title, subtitle, color }: { step?: number; title: string; subtitle?: string; color?: string }) {
  return (
    <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
      {step !== undefined && <StepBadge n={step} color={color ?? INK} />}
      <div>
        <div style={{ fontSize: '17px', fontWeight: 800, color: INK, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{title}</div>
        {subtitle && <div style={{ fontSize: '13px', color: INK_SOFT, marginTop: '3px', lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="trf-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>{children}</div>;
}

function Field({ label, required, error, children, full }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode; full?: boolean;
}) {
  return (
    <div style={full ? { gridColumn: '1/-1' } : {}}>
      <label style={{ fontSize: '13px', fontWeight: 600, color: INK_SOFT, display: 'block', marginBottom: '7px' }}>
        {label}{required && <span style={{ color: '#DC2626', marginLeft: '3px' }}>*</span>}
      </label>
      {children}
      {error && <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>⚠ {error}</div>}
    </div>
  );
}

function Input({ value, onChange, type = 'text', error, placeholder, accent = '#6366F1' }: {
  value: string; onChange: (v: string) => void; type?: string; error?: boolean; placeholder?: string; accent?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width: '100%', padding: '12px 15px', borderRadius: '11px', fontSize: '15px',
        color: INK, background: focused ? '#fff' : '#FCFCFD', outline: 'none', boxSizing: 'border-box',
        fontFamily: FONT, transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
        border: `1.5px solid ${error ? '#DC2626' : focused ? accent : LINE}`,
        boxShadow: focused ? `0 0 0 4px ${accent}1f` : 'none',
      }}
    />
  );
}

function Select({ value, onChange, error, children, accent = '#6366F1' }: {
  value: string; onChange: (v: string) => void; error?: boolean; children: React.ReactNode; accent?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width: '100%', padding: '12px 15px', borderRadius: '11px', fontSize: '15px',
        color: value ? INK : INK_MUTE, background: focused ? '#fff' : '#FCFCFD', outline: 'none',
        boxSizing: 'border-box', fontFamily: FONT, cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
        border: `1.5px solid ${error ? '#DC2626' : focused ? accent : LINE}`,
        boxShadow: focused ? `0 0 0 4px ${accent}1f` : 'none',
        appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394A3B8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 15px center',
      }}
    >
      {children}
    </select>
  );
}

const INFO_ICONS: Record<string, { icon: string; color: string }> = {
  welcome: { icon: '👋', color: '#6366F1' },
  location: { icon: '📍', color: '#DC2626' },
  schedule: { icon: '🗓', color: '#6366F1' },
  offer: { icon: '📬', color: '#D97706' },
  important: { icon: '✅', color: '#16A34A' },
  contact: { icon: '📞', color: '#6366F1' },
};

function InfoCard({ kind, title, body }: { kind: keyof typeof INFO_ICONS; title: string; body: string }) {
  const { icon, color } = INFO_ICONS[kind];
  return (
    <div style={{
      background: '#fff', borderRadius: '16px', border: `1px solid ${LINE}`,
      boxShadow: '0 1px 2px rgba(15,23,42,0.03), 0 16px 32px -26px rgba(15,23,42,0.20)',
      padding: '20px 22px', display: 'flex', gap: '15px',
    }}>
      <div style={{
        width: '38px', height: '38px', borderRadius: '11px', flexShrink: 0,
        background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px',
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '14.5px', color: INK, marginBottom: '5px', letterSpacing: '-0.01em' }}>{title}</div>
        <div style={{ fontSize: '14px', color: INK_SOFT, lineHeight: '1.7', whiteSpace: 'pre-line' }}>{body}</div>
      </div>
    </div>
  );
}

function RadioGroup({ q, value, onChange, color, error }: {
  q: Question; value: string | undefined; onChange: (id: string, v: string) => void;
  color: string; error?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: '14.5px', fontWeight: 700, color: INK, display: 'block', marginBottom: '5px', letterSpacing: '-0.01em' }}>
        {q.label}{q.required && <span style={{ color: '#DC2626', marginLeft: '3px' }}>*</span>}
      </label>
      {q.helpText && <div style={{ fontSize: '13px', color: INK_SOFT, marginBottom: '13px', lineHeight: '1.55' }}>{q.helpText}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {q.options.map(opt => {
          const selected = value === opt;
          return (
            <label key={opt} style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer',
              padding: '13px 16px', borderRadius: '11px',
              border: `1.5px solid ${selected ? color : LINE}`,
              background: selected ? `${color}0c` : '#FCFCFD',
              transition: 'all 0.12s',
            }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
                border: `2px solid ${selected ? color : '#CBD5E1'}`,
                background: selected ? color : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.12s',
              }}>
                {selected && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />}
              </div>
              <input type="radio" name={q.id} value={opt} checked={selected} onChange={() => onChange(q.id, opt)} style={{ display: 'none' }} />
              <span style={{ fontSize: '14.5px', color: INK, fontWeight: selected ? 600 : 400, lineHeight: '1.5' }}>{opt}</span>
            </label>
          );
        })}
      </div>
      {error && <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '7px', fontWeight: 500 }}>⚠ Required</div>}
    </div>
  );
}

function CheckboxField({ q, value, onChange, color, error }: {
  q: Question; value: string | undefined; onChange: (id: string, v: string) => void;
  color: string; error?: string;
}) {
  const checked = !!value;
  return (
    <div>
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: '13px', cursor: 'pointer',
        padding: '15px 16px', borderRadius: '11px',
        border: `1.5px solid ${error ? '#DC2626' : checked ? color : LINE}`,
        background: checked ? `${color}0c` : '#FCFCFD',
        transition: 'all 0.12s',
      }}>
        <div style={{
          width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0, marginTop: '1px',
          border: `2px solid ${checked ? color : '#CBD5E1'}`,
          background: checked ? color : '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.12s',
        }}>
          {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
        <input type="checkbox" checked={checked} onChange={e => onChange(q.id, e.target.checked ? 'true' : '')} style={{ display: 'none' }} />
        <span style={{ fontSize: '14px', color: INK_SOFT, lineHeight: '1.6' }}>{q.label}</span>
      </label>
      {error && <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '7px', fontWeight: 500 }}>⚠ You must agree to continue</div>}
    </div>
  );
}

function QuestionField({ q, value, onChange, error, color }: {
  q: Question; value: string | string[] | undefined;
  onChange: (id: string, val: string | string[]) => void;
  error?: string; color: string;
}) {
  const baseInp: React.CSSProperties = {
    width: '100%', padding: '12px 15px', borderRadius: '11px', fontSize: '15px',
    color: INK, background: '#FCFCFD', outline: 'none', boxSizing: 'border-box',
    fontFamily: FONT, border: `1.5px solid ${error ? '#DC2626' : LINE}`,
  };

  if (q.type === 'radio') return <RadioGroup q={q} value={value as string} onChange={onChange} color={color} error={error} />;
  if (q.type === 'checkbox') return <CheckboxField q={q} value={value as string} onChange={onChange} color={color} error={error} />;

  return (
    <div>
      <label style={{ fontSize: '14.5px', fontWeight: 700, color: INK, display: 'block', marginBottom: '5px', letterSpacing: '-0.01em' }}>
        {q.label}{q.required && <span style={{ color: '#DC2626', marginLeft: '3px' }}>*</span>}
      </label>
      {q.helpText && <div style={{ fontSize: '13px', color: INK_SOFT, marginBottom: '9px', lineHeight: '1.55' }}>{q.helpText}</div>}
      {q.type === 'text' && <input value={(value as string) ?? ''} onChange={e => onChange(q.id, e.target.value)} style={baseInp} />}
      {q.type === 'textarea' && <textarea value={(value as string) ?? ''} onChange={e => onChange(q.id, e.target.value)} rows={3} style={{ ...baseInp, resize: 'vertical' }} />}
      {q.type === 'date' && <input type="date" value={(value as string) ?? ''} onChange={e => onChange(q.id, e.target.value)} style={baseInp} />}
      {q.type === 'select' && (
        <select value={(value as string) ?? ''} onChange={e => onChange(q.id, e.target.value)} style={baseInp}>
          <option value="">Select…</option>
          {q.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {q.type === 'multiselect' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
          {q.options.map(opt => {
            const sel = ((value as string[]) ?? []).includes(opt);
            return (
              <button key={opt} type="button"
                onClick={() => { const cur = (value as string[]) ?? []; onChange(q.id, sel ? cur.filter(v => v !== opt) : [...cur, opt]); }}
                style={{ padding: '9px 17px', borderRadius: '9px', border: `1.5px solid ${sel ? color : LINE}`, background: sel ? `${color}12` : '#FCFCFD', color: sel ? color : INK_SOFT, fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.12s' }}>
                {opt}
              </button>
            );
          })}
        </div>
      )}
      {error && <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '5px', fontWeight: 500 }}>⚠ {error}</div>}
    </div>
  );
}

function Divider({ color }: { color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0 2px' }}>
      <div style={{ flex: 1, height: '1px', background: LINE }} />
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: color }} />
      <div style={{ flex: 1, height: '1px', background: LINE }} />
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

function TryoutFormContent() {
  const params = useSearchParams();
  const clubSlug = params.get('club');

  const [clubId, setClubId]       = useState<string | null>(null);
  const [clubName, setClubName]   = useState('');
  const [clubColor, setClubColor] = useState('#22C55E');
  const [clubLogoUrl, setClubLogoUrl] = useState<string | null>(null);
  const [config, setConfig]       = useState<FormConfig | null>(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]       = useState<Record<string, string>>({});

  const [firstName, setFirstName]       = useState('');
  const [lastName, setLastName]         = useState('');
  const [gender, setGender]             = useState('');
  const [dob, setDob]                   = useState('');
  const [grade, setGrade]               = useState('');
  const [parentName, setParentName]     = useState('');
  const [emailPrimary, setEmailPrimary] = useState('');
  const [phone, setPhone]               = useState('');
  const [town, setTown]                 = useState('');
  const [positions, setPositions]       = useState<string[]>([]);
  const [referralSource, setReferralSource] = useState('');
  const [customResponses, setCustomResponses] = useState<Record<string, string | string[]>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
    if (!clubSlug) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const { data: club } = await supabase.from('clubs').select('id,name,primary_color,logo_url').eq('slug', clubSlug).single();
      if (!club) { setNotFound(true); setLoading(false); return; }
      setClubId(club.id); setClubName(club.name);
      setClubColor(club.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E');
      setClubLogoUrl(club.logo_url ?? null);
      const { data: fc } = await supabase.from('tryout_form_config').select('config_json').eq('club_id', club.id).single();
      setConfig(fc?.config_json ?? null);
      setLoading(false);
    })();
  }, [clubSlug]);

  function togglePosition(pos: string) {
    setPositions(prev => prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]);
  }
  function setCustom(id: string, val: string | string[]) {
    setCustomResponses(prev => ({ ...prev, [id]: val }));
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.first_name = 'Required';
    if (!lastName.trim())  errs.last_name  = 'Required';
    if (!gender)           errs.gender     = 'Required';
    if (!emailPrimary.trim()) errs.email_primary = 'Required';
    if (!dob)              errs.dob        = 'Required';
    if (!parentName.trim()) errs.parent_name = 'Required';
    for (const q of (config?.questions ?? [])) {
      if (!q.required) continue;
      const val = customResponses[q.id];
      if (!val || (Array.isArray(val) && val.length === 0) || val === '') errs[q.id] = 'Required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !clubId) {
      setTimeout(() => {
        const el = document.querySelector('[data-error="true"]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    setSubmitting(true);

    const emailSecondary = customResponses['q_email_secondary'] as string | undefined;
    const currentTeamVal = customResponses['q_current_team'] as string | undefined;

    const maroonsRaw = (customResponses['q_maroons_status'] as string | undefined) ?? '';
    let maroonsStatus: 'new' | 'current' | 'returning' | 'unknown' = 'unknown';
    if (maroonsRaw.toLowerCase().includes('currently rostered')) maroonsStatus = 'current';
    else if (maroonsRaw.toLowerCase().includes('previously') || maroonsRaw.toLowerCase().includes('return')) maroonsStatus = 'returning';
    else if (maroonsRaw.toLowerCase().includes('never') || maroonsRaw.toLowerCase().includes('new player')) maroonsStatus = 'new';

    // Generated client-side and inserted explicitly, rather than reading
    // the id back via .select() — RLS requires a SELECT policy to satisfy
    // an INSERT's RETURNING clause, and this table deliberately has none
    // for an anonymous submitter (write-only, matches the pattern already
    // used for registration_submissions in web/app/register/[token]/page.tsx).
    const playerId = uid();
    const { error: playerErr } = await supabase.from('tryout_players').insert({
      id: playerId,
      club_id: clubId,
      first_name: firstName.trim(), last_name: lastName.trim(),
      gender: gender || null,
      date_of_birth: dob || null,
      grade: grade || null,
      parent_name: parentName.trim() || null,
      email_primary: emailPrimary.trim() || null,
      email_secondary: emailSecondary?.trim() || null,
      phone: phone.trim() || null,
      town: town.trim() || null,
      current_team: currentTeamVal?.trim() || null,
      positions: positions.length ? positions : null,
      referral_source: referralSource || null,
      season_label: config?.seasonLabel ?? null,
      source: 'registration',
      maroons_status: maroonsStatus,
      custom_responses: customResponses,
    });

    if (!playerErr) {
      await supabase.from('tryout_assignments').insert({
        club_id: clubId, player_id: playerId,
        team: 'Unassigned', status: 'Unassigned', offer_status: 'NotSent',
      });
    }
    setSubmitting(false); setSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: PAGE_BG, fontFamily: FONT }}>
      <div style={{ width: '34px', height: '34px', borderRadius: '50%', border: '3px solid #E2E8F0', borderTopColor: '#6366F1', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: '14px', color: INK_MUTE, fontWeight: 500 }}>Loading registration form…</div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, fontFamily: FONT, padding: '24px' }}>
      <div style={{ textAlign: 'center', padding: '40px', maxWidth: '380px' }}>
        <div style={{ fontSize: '44px', marginBottom: '18px' }}>⚽</div>
        <div style={{ fontSize: '19px', fontWeight: 800, color: INK, marginBottom: '8px', letterSpacing: '-0.01em' }}>Form not found</div>
        <div style={{ fontSize: '14.5px', color: INK_SOFT, lineHeight: 1.6 }}>Check the URL and try again, or contact your club directly.</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, fontFamily: FONT, padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '22px', padding: '52px 40px', maxWidth: '480px', width: '100%', textAlign: 'center', border: `1px solid ${LINE}`, boxShadow: '0 1px 2px rgba(15,23,42,0.03), 0 24px 56px -28px rgba(15,23,42,0.28)' }}>
        <div style={{
          width: '68px', height: '68px', borderRadius: '50%',
          background: `linear-gradient(135deg, ${clubColor}, ${shade(clubColor, -15)})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
          boxShadow: `0 10px 24px -8px ${clubColor}80`,
        }}>
          <svg width="28" height="22" viewBox="0 0 28 22" fill="none"><path d="M2 11l8 8L26 2" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ fontSize: '23px', fontWeight: 800, color: INK, marginBottom: '12px', letterSpacing: '-0.015em' }}>
          {config?.successTitle ? fill(config.successTitle, clubName) : 'Registration Complete!'}
        </div>
        <div style={{ fontSize: '15px', color: INK_SOFT, lineHeight: '1.7' }}>
          {config?.successBody ? fill(config.successBody, clubName) : 'Thank you for registering.'}
        </div>
        <div style={{ marginTop: '28px', padding: '16px', borderRadius: '14px', background: PAGE_BG, border: `1px solid ${LINE}` }}>
          <div style={{ fontSize: '12.5px', color: INK_MUTE, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>We&apos;ll be in touch at</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: INK, marginTop: '3px' }}>{emailPrimary}</div>
        </div>
      </div>
    </div>
  );

  const f = config;
  const resolvedTitle = f?.formTitle ? fill(f.formTitle, clubName) : `${clubName} Tryout Registration`;
  const allQuestions = (f?.questions ?? []).map(q => fillQ(q, clubName));
  // Pinned by fieldKey, not array position — an admin reordering custom
  // questions in the settings editor (move up/down) must not relocate
  // these two to wherever they land in the list. "Which tryout date"
  // belongs above Step 1 (it's the first thing to commit to); "Additional
  // Parent / Guardian Email" belongs with the Parent/Guardian step, not
  // floating alone above Player Information.
  const firstQuestion = allQuestions.find(q => q.fieldKey === 'tryout_date') ?? null;
  const secondaryEmailQuestion = allQuestions.find(q => q.fieldKey === 'email_secondary') ?? null;
  // Separate agreement checkboxes from remaining questions so they go at the very end
  const midQuestions = allQuestions.filter(q =>
    q.id !== firstQuestion?.id && q.id !== secondaryEmailQuestion?.id && q.type !== 'checkbox'
  );
  const agreements = allQuestions.filter(q => q.type === 'checkbox');

  // How many numbered steps will actually render, so the step badges stay
  // correct (1, 2, 3…) regardless of which optional sections a given
  // club's config includes.
  let stepCounter = 1;
  const stepPlayer = stepCounter++;
  const stepParent = stepCounter++;
  const stepExperience = midQuestions.length > 0 ? stepCounter++ : null;

  const infoCards: { kind: keyof typeof INFO_ICONS; title: string; body: string }[] = [];
  if (f?.welcomeText) infoCards.push({ kind: 'welcome', title: 'Welcome', body: fill(f.welcomeText, clubName) });
  if (f?.locationText) infoCards.push({ kind: 'location', title: 'Location', body: f.locationText });
  if (f?.sessionScheduleText) infoCards.push({ kind: 'schedule', title: 'Session Schedule', body: fill(f.sessionScheduleText, clubName) });
  if (f?.offerTimelineText) infoCards.push({ kind: 'offer', title: 'Offer Process & Timeline', body: fill(f.offerTimelineText, clubName) });
  if (f?.importantInfoText) infoCards.push({ kind: 'important', title: 'Important Information', body: fill(f.importantInfoText, clubName) });
  if (f?.contactText) infoCards.push({ kind: 'contact', title: 'Questions? Contact Us', body: fill(f.contactText, clubName) });

  return (
    <div style={{ minHeight: '100vh', background: PAGE_BG, fontFamily: FONT, paddingBottom: '80px' }}>
      <style>{`
        @media (max-width: 560px) {
          .trf-row { grid-template-columns: 1fr !important; gap: 14px !important; }
          .trf-header-inner { padding: 30px 0 28px !important; gap: 14px !important; }
          .trf-content { padding: 20px 14px !important; }
          .trf-card-pad { padding: 22px !important; }
          .trf-logo-plate { width: 64px !important; height: 64px !important; padding: 8px !important; }
          .trf-title { font-size: 22px !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(155deg, ${clubColor} 0%, ${shade(clubColor, -22)} 100%)`, padding: '0 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 600px 240px at 15% -20%, rgba(255,255,255,0.14), transparent)' }} />
        <div className="trf-header-inner" style={{ maxWidth: '660px', margin: '0 auto', padding: '44px 0 38px', display: 'flex', alignItems: 'center', gap: '20px', position: 'relative' }}>
          {clubLogoUrl && (
            <div className="trf-logo-plate" style={{
              flexShrink: 0, width: '84px', height: '84px', borderRadius: '20px',
              background: 'rgba(255,255,255,0.98)', padding: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 12px 28px -8px rgba(0,0,0,0.35)',
            }}>
              <img
                src={clubLogoUrl} alt={`${clubName} logo`}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: '7px', padding: '5px 11px', fontSize: '11.5px', fontWeight: 700,
              color: '#fff', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '15px',
            }}>
              {f?.seasonLabel ?? ''} Tryouts
            </div>
            <div className="trf-title" style={{ fontSize: '29px', fontWeight: 800, color: '#fff', lineHeight: '1.18', marginBottom: '8px', letterSpacing: '-0.02em' }}>{resolvedTitle}</div>
            {f?.formSubtitle && <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.82)', fontWeight: 500 }}>{fill(f.formSubtitle, clubName)}</div>}
          </div>
        </div>
      </div>

      <div className="trf-content" style={{ maxWidth: '660px', margin: '0 auto', padding: '30px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Info Cards */}
          {infoCards.map(c => <InfoCard key={c.kind} kind={c.kind} title={c.title} body={c.body} />)}

          {infoCards.length > 0 && <Divider color={clubColor} />}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* First question (tryout date) */}
            {firstQuestion && (
              <SectionCard accent={clubColor}>
                <QuestionField q={firstQuestion} value={customResponses[firstQuestion.id]} onChange={setCustom} error={errors[firstQuestion.id]} color={clubColor} />
              </SectionCard>
            )}

            {/* Player info */}
            <SectionCard>
              <SectionTitle step={stepPlayer} title="Player Information" color={clubColor} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <FieldRow>
                  <Field label="First name" required error={errors.first_name} data-error={!!errors.first_name}>
                    <Input value={firstName} onChange={setFirstName} error={!!errors.first_name} accent={clubColor} />
                  </Field>
                  <Field label="Last name" required error={errors.last_name}>
                    <Input value={lastName} onChange={setLastName} error={!!errors.last_name} accent={clubColor} />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Gender" required error={errors.gender}>
                    <Select value={gender} onChange={setGender} error={!!errors.gender} accent={clubColor}>
                      <option value="">Select…</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </Select>
                  </Field>
                  <Field label="Date of birth" required error={errors.dob}>
                    <Input type="date" value={dob} onChange={setDob} error={!!errors.dob} accent={clubColor} />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Current grade (Spring 2026)">
                    <Select value={grade} onChange={setGrade} accent={clubColor}>
                      <option value="">Select…</option>
                      {(f?.gradeOptions ?? ['K','1','2','3','4','5','6','7','8']).map(g => <option key={g} value={g}>{g}</option>)}
                    </Select>
                  </Field>
                  <div />
                </FieldRow>
                <Field label="Preferred position(s)" full>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                    {(f?.positionOptions ?? ['GK','Defender','Midfielder','Forward','Not Sure']).map(pos => (
                      <button key={pos} type="button" onClick={() => togglePosition(pos)}
                        style={{
                          padding: '9px 19px', borderRadius: '9px', fontSize: '13.5px', fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.12s', fontFamily: FONT,
                          border: `1.5px solid ${positions.includes(pos) ? clubColor : LINE}`,
                          background: positions.includes(pos) ? `${clubColor}12` : '#FCFCFD',
                          color: positions.includes(pos) ? clubColor : INK_SOFT,
                        }}>
                        {pos}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            </SectionCard>

            {/* Parent/Guardian */}
            <SectionCard>
              <SectionTitle step={stepParent} title="Parent / Guardian" subtitle="Offer letters and club communications will be sent to this contact." color={clubColor} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <FieldRow>
                  <Field label="Full name" required error={errors.parent_name}>
                    <Input value={parentName} onChange={setParentName} error={!!errors.parent_name} accent={clubColor} />
                  </Field>
                  <Field label="Email address" required error={errors.email_primary}>
                    <Input type="email" value={emailPrimary} onChange={setEmailPrimary} error={!!errors.email_primary} placeholder="you@example.com" accent={clubColor} />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Phone number">
                    <Input type="tel" value={phone} onChange={setPhone} placeholder="(555) 000-0000" accent={clubColor} />
                  </Field>
                  <Field label="Town / City">
                    <Input value={town} onChange={setTown} accent={clubColor} />
                  </Field>
                </FieldRow>
                {secondaryEmailQuestion && (
                  <QuestionField q={secondaryEmailQuestion} value={customResponses[secondaryEmailQuestion.id]} onChange={setCustom} error={errors[secondaryEmailQuestion.id]} color={clubColor} />
                )}
              </div>
            </SectionCard>

            {/* Remaining custom questions */}
            {midQuestions.length > 0 && (
              <SectionCard>
                <SectionTitle step={stepExperience ?? undefined} title="Soccer Experience & Club Info" color={clubColor} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {midQuestions.map((q, i) => (
                    <div key={q.id}>
                      <QuestionField q={q} value={customResponses[q.id]} onChange={setCustom} error={errors[q.id]} color={clubColor} />
                      {i < midQuestions.length - 1 && <div style={{ height: '1px', background: '#F1F5F9', marginTop: '24px' }} />}
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* How did you hear */}
            {(f?.referralOptions ?? []).length > 0 && (
              <SectionCard>
                <Field label="How did you hear about us?">
                  <Select value={referralSource} onChange={setReferralSource} accent={clubColor}>
                    <option value="">Select…</option>
                    {(f?.referralOptions ?? []).map(r => <option key={r} value={r}>{fill(r, clubName)}</option>)}
                  </Select>
                </Field>
              </SectionCard>
            )}

            {/* Agreements */}
            {agreements.length > 0 && (
              <SectionCard>
                <SectionTitle title="Agreements" subtitle="Please read and confirm both items below to complete your registration." />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {agreements.map(q => (
                    <CheckboxField key={q.id} q={q} value={customResponses[q.id] as string} onChange={setCustom} color={clubColor} error={errors[q.id]} />
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Submit */}
            <button type="submit" disabled={submitting}
              style={{
                padding: '18px', borderRadius: '14px',
                background: submitting ? '#CBD5E1' : `linear-gradient(135deg, ${clubColor}, ${shade(clubColor, -12)})`,
                color: '#fff', border: 'none', fontSize: '16px', fontWeight: 800,
                cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: FONT,
                boxShadow: submitting ? 'none' : `0 10px 26px -10px ${clubColor}90`,
                transition: 'all 0.15s', letterSpacing: '-0.005em',
              }}>
              {submitting ? '⏳  Submitting…' : (f?.submitLabel ? fill(f.submitLabel, clubName) : 'Submit Registration')}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12.5px', color: INK_MUTE, paddingBottom: '8px', fontWeight: 500 }}>
              <svg width="11" height="13" viewBox="0 0 11 13" fill="none"><path d="M1.5 5.5V3.75a4 4 0 0 1 8 0V5.5M1 5.5h9v6.25a.75.75 0 0 1-.75.75H1.75a.75.75 0 0 1-.75-.75V5.5Z" stroke="#94A3B8" strokeWidth="1.1"/></svg>
              Your information is only shared with {clubName} staff.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function TryoutRegistrationPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, fontFamily: FONT }}>
        <div style={{ fontSize: '14px', color: INK_MUTE }}>Loading…</div>
      </div>
    }>
      <TryoutFormContent />
    </Suspense>
  );
}
