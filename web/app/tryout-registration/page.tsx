'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

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

function SectionCard({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: '16px', padding: '28px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
      borderTop: accent ? `3px solid ${accent}` : undefined,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ step, title, subtitle }: { step?: number; title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: '22px' }}>
      {step !== undefined && (
        <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '4px' }}>
          Step {step}
        </div>
      )}
      <div style={{ fontSize: '17px', fontWeight: '800', color: '#111827' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '3px' }}>{subtitle}</div>}
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>{children}</div>;
}

function Field({ label, required, error, children, full }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode; full?: boolean;
}) {
  return (
    <div style={full ? { gridColumn: '1/-1' } : {}}>
      <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>}
      </label>
      {children}
      {error && <div style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>⚠ {error}</div>}
    </div>
  );
}

function Input({ value, onChange, type = 'text', error, placeholder }: {
  value: string; onChange: (v: string) => void; type?: string; error?: boolean; placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width: '100%', padding: '11px 14px', borderRadius: '10px', fontSize: '15px',
        color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box',
        fontFamily: 'inherit', transition: 'border-color 0.15s, box-shadow 0.15s',
        border: `1.5px solid ${error ? '#EF4444' : focused ? '#6366F1' : '#E5E7EB'}`,
        boxShadow: focused ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
      }}
    />
  );
}

function Select({ value, onChange, error, children }: {
  value: string; onChange: (v: string) => void; error?: boolean; children: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width: '100%', padding: '11px 14px', borderRadius: '10px', fontSize: '15px',
        color: value ? '#111827' : '#9CA3AF', background: '#fff', outline: 'none',
        boxSizing: 'border-box', fontFamily: 'inherit', cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        border: `1.5px solid ${error ? '#EF4444' : focused ? '#6366F1' : '#E5E7EB'}`,
        boxShadow: focused ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
        appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center',
      }}
    >
      {children}
    </select>
  );
}

function InfoCard({ icon, title, body, color }: { icon: string; title: string; body: string; color: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: '14px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
      overflow: 'hidden',
    }}>
      <div style={{ background: `${color}10`, borderBottom: `1px solid ${color}20`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <span style={{ fontWeight: '700', fontSize: '14px', color: '#111827' }}>{title}</span>
      </div>
      <div style={{ padding: '16px 20px', fontSize: '14px', color: '#374151', lineHeight: '1.75', whiteSpace: 'pre-line' }}>{body}</div>
    </div>
  );
}

function RadioGroup({ q, value, onChange, color, error }: {
  q: Question; value: string | undefined; onChange: (id: string, v: string) => void;
  color: string; error?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: '14px', fontWeight: '700', color: '#111827', display: 'block', marginBottom: '4px' }}>
        {q.label}{q.required && <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>}
      </label>
      {q.helpText && <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '12px', lineHeight: '1.5' }}>{q.helpText}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {q.options.map(opt => {
          const selected = value === opt;
          return (
            <label key={opt} style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer',
              padding: '12px 16px', borderRadius: '10px',
              border: `1.5px solid ${selected ? color : '#E5E7EB'}`,
              background: selected ? `${color}0d` : '#FAFAFA',
              transition: 'all 0.12s',
            }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
                border: `2px solid ${selected ? color : '#D1D5DB'}`,
                background: selected ? color : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />}
              </div>
              <input type="radio" name={q.id} value={opt} checked={selected} onChange={() => onChange(q.id, opt)} style={{ display: 'none' }} />
              <span style={{ fontSize: '14px', color: '#111827', fontWeight: selected ? '600' : '400', lineHeight: '1.5' }}>{opt}</span>
            </label>
          );
        })}
      </div>
      {error && <div style={{ fontSize: '12px', color: '#EF4444', marginTop: '6px' }}>⚠ Required</div>}
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
        padding: '14px 16px', borderRadius: '10px',
        border: `1.5px solid ${error ? '#EF4444' : checked ? color : '#E5E7EB'}`,
        background: checked ? `${color}0d` : '#FAFAFA',
        transition: 'all 0.12s',
      }}>
        <div style={{
          width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0, marginTop: '1px',
          border: `2px solid ${checked ? color : '#D1D5DB'}`,
          background: checked ? color : '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.12s',
        }}>
          {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
        <input type="checkbox" checked={checked} onChange={e => onChange(q.id, e.target.checked ? 'true' : '')} style={{ display: 'none' }} />
        <span style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>{q.label}</span>
      </label>
      {error && <div style={{ fontSize: '12px', color: '#EF4444', marginTop: '6px' }}>⚠ You must agree to continue</div>}
    </div>
  );
}

function QuestionField({ q, value, onChange, error, color }: {
  q: Question; value: string | string[] | undefined;
  onChange: (id: string, val: string | string[]) => void;
  error?: string; color: string;
}) {
  const baseInp: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: '10px', fontSize: '15px',
    color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', border: `1.5px solid ${error ? '#EF4444' : '#E5E7EB'}`,
  };

  if (q.type === 'radio') return <RadioGroup q={q} value={value as string} onChange={onChange} color={color} error={error} />;
  if (q.type === 'checkbox') return <CheckboxField q={q} value={value as string} onChange={onChange} color={color} error={error} />;

  return (
    <div>
      <label style={{ fontSize: '14px', fontWeight: '700', color: '#111827', display: 'block', marginBottom: '4px' }}>
        {q.label}{q.required && <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>}
      </label>
      {q.helpText && <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '8px', lineHeight: '1.5' }}>{q.helpText}</div>}
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
                style={{ padding: '8px 16px', borderRadius: '8px', border: `2px solid ${sel ? color : '#E5E7EB'}`, background: sel ? `${color}15` : '#fff', color: sel ? color : '#374151', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                {opt}
              </button>
            );
          })}
        </div>
      )}
      {error && <div style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>⚠ {error}</div>}
    </div>
  );
}

function Divider({ color }: { color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 0' }}>
      <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
      <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
    </div>
  );
}

function TryoutFormContent() {
  const params = useSearchParams();
  const clubSlug = params.get('club');

  const [clubId, setClubId]       = useState<string | null>(null);
  const [clubName, setClubName]   = useState('');
  const [clubColor, setClubColor] = useState('#22C55E');
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
    if (!clubSlug) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const { data: club } = await supabase.from('clubs').select('id,name,primary_color').eq('slug', clubSlug).single();
      if (!club) { setNotFound(true); setLoading(false); return; }
      setClubId(club.id); setClubName(club.name);
      setClubColor(club.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E');
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

    const { data: player } = await supabase.from('tryout_players').insert({
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
    }).select('id').single();

    if (player?.id) {
      await supabase.from('tryout_assignments').insert({
        club_id: clubId, player_id: (player as { id: string }).id,
        team: 'Unassigned', status: 'Unassigned', offer_status: 'NotSent',
      });
    }
    setSubmitting(false); setSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', background: '#F9FAFB' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #E5E7EB', borderTopColor: '#6366F1', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: '14px', color: '#9CA3AF' }}>Loading form…</div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB' }}>
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚽</div>
        <div style={{ fontSize: '20px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>Form not found</div>
        <div style={{ fontSize: '15px', color: '#6B7280' }}>Check the URL and try again, or contact your club directly.</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '52px 40px', maxWidth: '500px', width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: `${clubColor}15`, border: `2px solid ${clubColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '32px' }}>✓</div>
        <div style={{ fontSize: '24px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>
          {config?.successTitle ? fill(config.successTitle, clubName) : 'Registration Complete!'}
        </div>
        <div style={{ fontSize: '15px', color: '#6B7280', lineHeight: '1.7' }}>
          {config?.successBody ? fill(config.successBody, clubName) : 'Thank you for registering.'}
        </div>
        <div style={{ marginTop: '28px', padding: '16px', borderRadius: '12px', background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: '13px', color: '#6B7280' }}>We&apos;ll be in touch at</div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#111827', marginTop: '2px' }}>{emailPrimary}</div>
        </div>
      </div>
    </div>
  );

  const f = config;
  const resolvedTitle = f?.formTitle ? fill(f.formTitle, clubName) : `${clubName} Tryout Registration`;
  const allQuestions = (f?.questions ?? []).map(q => fillQ(q, clubName));
  const firstQuestion = allQuestions[0] ?? null;
  // Separate agreement checkboxes from remaining questions so they go at the very end
  const midQuestions = allQuestions.slice(1).filter(q => q.type !== 'checkbox');
  const agreements = allQuestions.filter(q => q.type === 'checkbox');

  return (
    <div style={{ minHeight: '100vh', background: '#F3F4F6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: '80px' }}>

      {/* Header */}
      <div style={{ background: clubColor, padding: '0 24px' }}>
        <div style={{ maxWidth: '660px', margin: '0 auto', padding: '40px 0 36px' }}>
          <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.18)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.9)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '14px' }}>
            {f?.seasonLabel ?? ''} Tryouts
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#fff', lineHeight: '1.2', marginBottom: '8px' }}>{resolvedTitle}</div>
          {f?.formSubtitle && <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.8)', fontWeight: '500' }}>{fill(f.formSubtitle, clubName)}</div>}
        </div>
      </div>

      <div style={{ maxWidth: '660px', margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Info Cards */}
          {f?.welcomeText && (
            <InfoCard icon="👋" title="Welcome" body={fill(f.welcomeText, clubName)} color={clubColor} />
          )}

          {(f?.locationText || f?.sessionScheduleText) && (
            <div style={{ display: 'grid', gridTemplateColumns: f?.locationText && f?.sessionScheduleText ? '1fr 1fr' : '1fr', gap: '14px' }}>
              {f?.locationText && (
                <div style={{ background: '#fff', borderRadius: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                  <div style={{ background: '#FEF2F2', borderBottom: '1px solid #FECACA', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>📍</span>
                    <span style={{ fontWeight: '700', fontSize: '13px', color: '#111827' }}>Location</span>
                  </div>
                  <div style={{ padding: '14px 16px', fontSize: '14px', color: '#374151', lineHeight: '1.6', fontWeight: '500' }}>{f.locationText}</div>
                </div>
              )}
              {f?.sessionScheduleText && (
                <InfoCard icon="🗓" title="Session Schedule" body={fill(f.sessionScheduleText, clubName)} color="#6366F1" />
              )}
            </div>
          )}

          {f?.offerTimelineText && (
            <InfoCard icon="📬" title="Offer Process & Timeline" body={fill(f.offerTimelineText, clubName)} color="#F59E0B" />
          )}

          {f?.importantInfoText && (
            <InfoCard icon="✅" title="Important Information" body={fill(f.importantInfoText, clubName)} color="#22C55E" />
          )}

          {f?.contactText && (
            <InfoCard icon="📞" title="Questions? Contact Us" body={fill(f.contactText, clubName)} color="#6366F1" />
          )}

          <Divider color={clubColor} />

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
              <SectionTitle step={1} title="Player Information" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <FieldRow>
                  <Field label="First name" required error={errors.first_name} data-error={!!errors.first_name}>
                    <Input value={firstName} onChange={setFirstName} error={!!errors.first_name} />
                  </Field>
                  <Field label="Last name" required error={errors.last_name}>
                    <Input value={lastName} onChange={setLastName} error={!!errors.last_name} />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Gender" required error={errors.gender}>
                    <Select value={gender} onChange={setGender} error={!!errors.gender}>
                      <option value="">Select…</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </Select>
                  </Field>
                  <Field label="Date of birth" required error={errors.dob}>
                    <Input type="date" value={dob} onChange={setDob} error={!!errors.dob} />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Current grade (Spring 2026)">
                    <Select value={grade} onChange={setGrade}>
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
                          padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                          cursor: 'pointer', transition: 'all 0.12s',
                          border: `2px solid ${positions.includes(pos) ? clubColor : '#E5E7EB'}`,
                          background: positions.includes(pos) ? `${clubColor}15` : '#FAFAFA',
                          color: positions.includes(pos) ? clubColor : '#374151',
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
              <SectionTitle step={2} title="Parent / Guardian" subtitle="Offer letters and club communications will be sent to this contact." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <FieldRow>
                  <Field label="Full name" required error={errors.parent_name}>
                    <Input value={parentName} onChange={setParentName} error={!!errors.parent_name} />
                  </Field>
                  <Field label="Email address" required error={errors.email_primary}>
                    <Input type="email" value={emailPrimary} onChange={setEmailPrimary} error={!!errors.email_primary} placeholder="you@example.com" />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Phone number">
                    <Input type="tel" value={phone} onChange={setPhone} placeholder="(555) 000-0000" />
                  </Field>
                  <Field label="Town / City">
                    <Input value={town} onChange={setTown} />
                  </Field>
                </FieldRow>
              </div>
            </SectionCard>

            {/* Remaining custom questions */}
            {midQuestions.length > 0 && (
              <SectionCard>
                <SectionTitle step={3} title="Soccer Experience & Club Info" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {midQuestions.map((q, i) => (
                    <div key={q.id}>
                      <QuestionField q={q} value={customResponses[q.id]} onChange={setCustom} error={errors[q.id]} color={clubColor} />
                      {i < midQuestions.length - 1 && <div style={{ height: '1px', background: '#F3F4F6', marginTop: '24px' }} />}
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* How did you hear */}
            {(f?.referralOptions ?? []).length > 0 && (
              <SectionCard>
                <Field label="How did you hear about us?">
                  <Select value={referralSource} onChange={setReferralSource}>
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
                padding: '17px', borderRadius: '14px', background: submitting ? '#9CA3AF' : clubColor,
                color: '#fff', border: 'none', fontSize: '16px', fontWeight: '800',
                cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                boxShadow: submitting ? 'none' : `0 4px 14px ${clubColor}50`,
                transition: 'all 0.15s', letterSpacing: '0.01em',
              }}>
              {submitting ? '⏳  Submitting…' : (f?.submitLabel ? fill(f.submitLabel, clubName) : 'Submit Registration')}
            </button>

            <div style={{ textAlign: 'center', fontSize: '12px', color: '#9CA3AF', paddingBottom: '8px' }}>
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB' }}>
        <div style={{ fontSize: '14px', color: '#9CA3AF' }}>Loading…</div>
      </div>
    }>
      <TryoutFormContent />
    </Suspense>
  );
}
