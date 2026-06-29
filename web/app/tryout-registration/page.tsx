'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Question = {
  id: string;
  type: string;
  label: string;
  helpText: string;
  required: boolean;
  options: string[];
  fieldKey: string;
  builtIn: boolean;
};

type FormConfig = {
  formTitle: string;
  formSubtitle: string;
  seasonLabel: string;
  submitLabel: string;
  successTitle: string;
  successBody: string;
  gradeOptions: string[];
  positionOptions: string[];
  referralOptions: string[];
  jerseySizeOptions: string[];
  questions: Question[];
};

const BUILT_IN_FIELDS = ['first_name','last_name','gender','date_of_birth','grade','parent_name','email_primary','phone','town','current_team','positions','referral_source'];

function TryoutFormContent() {
  const params = useSearchParams();
  const clubSlug = params.get('club');


  const [clubId, setClubId] = useState<string | null>(null);
  const [clubName, setClubName] = useState('');
  const [clubColor, setClubColor] = useState('#22C55E');
  const [config, setConfig] = useState<FormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Core fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [grade, setGrade] = useState('');
  const [parentName, setParentName] = useState('');
  const [emailPrimary, setEmailPrimary] = useState('');
  const [phone, setPhone] = useState('');
  const [town, setTown] = useState('');
  const [currentTeam, setCurrentTeam] = useState('');
  const [positions, setPositions] = useState<string[]>([]);
  const [referralSource, setReferralSource] = useState('');
  const [customResponses, setCustomResponses] = useState<Record<string, string | string[]>>({});

  useEffect(() => {
    if (!clubSlug) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const { data: club } = await supabase.from('clubs').select('id,name,primary_color').eq('slug', clubSlug).single();
      if (!club) { setNotFound(true); setLoading(false); return; }
      setClubId(club.id);
      setClubName(club.name);
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
    if (!lastName.trim()) errs.last_name = 'Required';
    if (!gender) errs.gender = 'Required';
    if (!emailPrimary.trim()) errs.email_primary = 'Required';
    if (config?.questions) {
      for (const q of config.questions) {
        if (q.required && !customResponses[q.id]) errs[q.id] = 'Required';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !clubId) return;
    setSubmitting(true);

    const { data: player } = await supabase.from('tryout_players').insert({
      club_id: clubId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      gender: gender || null,
      date_of_birth: dob || null,
      grade: grade || null,
      parent_name: parentName.trim() || null,
      email_primary: emailPrimary.trim() || null,
      phone: phone.trim() || null,
      town: town.trim() || null,
      current_team: currentTeam.trim() || null,
      positions: positions.length ? positions : null,
      referral_source: referralSource || null,
      season_label: config?.seasonLabel ?? null,
      source: 'registration',
      maroons_status: 'unknown',
      custom_responses: customResponses,
    }).select('id').single();

    if (player?.id) {
      await supabase.from('tryout_assignments').insert({
        club_id: clubId, player_id: player.id, team: 'Unassigned', status: 'Unassigned', offer_status: 'NotSent',
      });
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1px solid #D1D5DB',
    fontSize: '15px', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const errStyle: React.CSSProperties = { fontSize: '12px', color: '#EF4444', marginTop: '3px' };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB' }}>
      <div style={{ color: '#9CA3AF', fontSize: '15px' }}>Loading…</div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>Form not found</div>
        <div style={{ color: '#6B7280' }}>Check the URL and try again.</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: `${clubColor}20`, border: `2px solid ${clubColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '24px' }}>✓</div>
        <div style={{ fontSize: '22px', fontWeight: '800', color: '#111827', marginBottom: '10px' }}>{config?.successTitle ?? 'Registration Complete!'}</div>
        <div style={{ fontSize: '15px', color: '#6B7280', lineHeight: '1.6' }}>{config?.successBody ?? 'Thank you for registering.'}</div>
      </div>
    </div>
  );

  const f = config;

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: '60px' }}>
      {/* Header */}
      <div style={{ background: clubColor, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: '800', color: '#fff', marginBottom: '6px' }}>{f?.formTitle ?? `${clubName} Tryout Registration`}</div>
        {f?.formSubtitle && <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.8)' }}>{f.formSubtitle}</div>}
        {f?.seasonLabel && <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>Season {f.seasonLabel}</div>}
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: '600px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Player info */}
          <div style={{ background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#111827', marginBottom: '16px' }}>Player Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>First name *</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} style={{ ...inputStyle, borderColor: errors.first_name ? '#EF4444' : '#D1D5DB' }} />
                {errors.first_name && <div style={errStyle}>{errors.first_name}</div>}
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Last name *</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} style={{ ...inputStyle, borderColor: errors.last_name ? '#EF4444' : '#D1D5DB' }} />
                {errors.last_name && <div style={errStyle}>{errors.last_name}</div>}
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Gender *</label>
                <select value={gender} onChange={e => setGender(e.target.value)} style={{ ...inputStyle, borderColor: errors.gender ? '#EF4444' : '#D1D5DB' }}>
                  <option value="">Select…</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                {errors.gender && <div style={errStyle}>{errors.gender}</div>}
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Date of birth</label>
                <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Grade</label>
                <select value={grade} onChange={e => setGrade(e.target.value)} style={inputStyle}>
                  <option value="">Select…</option>
                  {(f?.gradeOptions ?? ['K','1','2','3','4','5','6','7','8']).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Current team</label>
                <input value={currentTeam} onChange={e => setCurrentTeam(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>Positions (select all that apply)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(f?.positionOptions ?? ['GK','CB','LB','RB','CM','CAM','LW','RW','ST','Any']).map(pos => (
                    <button key={pos} type="button" onClick={() => togglePosition(pos)}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: `2px solid ${positions.includes(pos) ? clubColor : '#E5E7EB'}`, background: positions.includes(pos) ? `${clubColor}15` : '#fff', color: positions.includes(pos) ? clubColor : '#374151', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Parent/guardian */}
          <div style={{ background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#111827', marginBottom: '16px' }}>Parent / Guardian</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Full name</label>
                <input value={parentName} onChange={e => setParentName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Email *</label>
                <input type="email" value={emailPrimary} onChange={e => setEmailPrimary(e.target.value)} style={{ ...inputStyle, borderColor: errors.email_primary ? '#EF4444' : '#D1D5DB' }} />
                {errors.email_primary && <div style={errStyle}>{errors.email_primary}</div>}
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Town</label>
                <input value={town} onChange={e => setTown(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Referral */}
          <div style={{ background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>How did you hear about us?</label>
            <select value={referralSource} onChange={e => setReferralSource(e.target.value)} style={inputStyle}>
              <option value="">Select…</option>
              {(f?.referralOptions ?? ['Friend/Family','Social Media','Web Search','Other']).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Custom questions */}
          {(f?.questions ?? []).length > 0 && (
            <div style={{ background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontWeight: '700', fontSize: '15px', color: '#111827', marginBottom: '16px' }}>Additional Information</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {(f?.questions ?? []).map(q => (
                  <div key={q.id}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>
                      {q.label}{q.required && ' *'}
                    </label>
                    {q.helpText && <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '6px' }}>{q.helpText}</div>}
                    {q.type === 'textarea' && (
                      <textarea value={(customResponses[q.id] as string) ?? ''} onChange={e => setCustom(q.id, e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', borderColor: errors[q.id] ? '#EF4444' : '#D1D5DB' }} />
                    )}
                    {q.type === 'select' && (
                      <select value={(customResponses[q.id] as string) ?? ''} onChange={e => setCustom(q.id, e.target.value)} style={{ ...inputStyle, borderColor: errors[q.id] ? '#EF4444' : '#D1D5DB' }}>
                        <option value="">Select…</option>
                        {q.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                    {(q.type === 'text' || q.type === 'date') && (
                      <input type={q.type} value={(customResponses[q.id] as string) ?? ''} onChange={e => setCustom(q.id, e.target.value)} style={{ ...inputStyle, borderColor: errors[q.id] ? '#EF4444' : '#D1D5DB' }} />
                    )}
                    {q.type === 'checkbox' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                        <input type="checkbox" checked={!!(customResponses[q.id])} onChange={e => setCustom(q.id, e.target.checked ? 'true' : '')} />
                        {q.helpText || 'Yes'}
                      </label>
                    )}
                    {['radio','multiselect'].includes(q.type) && q.options.map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                        <input
                          type={q.type === 'radio' ? 'radio' : 'checkbox'}
                          name={q.id}
                          value={opt}
                          checked={q.type === 'radio' ? customResponses[q.id] === opt : ((customResponses[q.id] as string[]) ?? []).includes(opt)}
                          onChange={() => {
                            if (q.type === 'radio') setCustom(q.id, opt);
                            else {
                              const cur = (customResponses[q.id] as string[]) ?? [];
                              setCustom(q.id, cur.includes(opt) ? cur.filter(v => v !== opt) : [...cur, opt]);
                            }
                          }}
                        />
                        {opt}
                      </label>
                    ))}
                    {errors[q.id] && <div style={errStyle}>{errors[q.id]}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="submit" disabled={submitting}
            style={{ padding: '14px', borderRadius: '12px', background: clubColor, color: '#fff', border: 'none', fontSize: '16px', fontWeight: '700', cursor: 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: 'inherit' }}>
            {submitting ? 'Submitting…' : (f?.submitLabel ?? 'Submit Registration')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function TryoutRegistrationPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</div>}>
      <TryoutFormContent />
    </Suspense>
  );
}
