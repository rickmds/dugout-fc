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

function InfoCard({ title, body, color }: { title: string; body: string; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: '14px', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${color}` }}>
      <div style={{ fontWeight: '700', fontSize: '14px', color: '#111827', marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '14px', color: '#374151', lineHeight: '1.7', whiteSpace: 'pre-line' }}>{body}</div>
    </div>
  );
}

function TryoutFormContent() {
  const params = useSearchParams();
  const clubSlug = params.get('club');

  const [clubId, setClubId]     = useState<string | null>(null);
  const [clubName, setClubName] = useState('');
  const [clubColor, setClubColor] = useState('#22C55E');
  const [config, setConfig]     = useState<FormConfig | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]     = useState<Record<string, string>>({});

  // Built-in fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [gender, setGender]       = useState('');
  const [dob, setDob]             = useState('');
  const [grade, setGrade]         = useState('');
  const [parentName, setParentName] = useState('');
  const [emailPrimary, setEmailPrimary] = useState('');
  const [phone, setPhone]         = useState('');
  const [town, setTown]           = useState('');
  const [positions, setPositions] = useState<string[]>([]);
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
    if (!validate() || !clubId) return;
    setSubmitting(true);

    // Pull email_secondary from custom responses if present
    const emailSecondary = customResponses['q_email_secondary'] as string | undefined;
    const maroonsSt = customResponses['q_maroons_status'] as string | undefined;
    const currentTeamVal = customResponses['q_current_team'] as string | undefined;

    const { data: player } = await supabase.from('tryout_players').insert({
      club_id: clubId,
      first_name: firstName.trim(), last_name: lastName.trim(),
      gender: gender || null, dob: dob || null, grade: grade || null,
      parent_name: parentName.trim() || null,
      email_primary: emailPrimary.trim() || null,
      email_secondary: emailSecondary?.trim() || null,
      phone: phone.trim() || null, town: town.trim() || null,
      current_team: currentTeamVal?.trim() || null,
      positions: positions.length ? positions : null,
      referral_source: referralSource || null,
      season_label: config?.seasonLabel ?? null,
      source: 'registration',
      maroons_status: maroonsSt ?? null,
      custom_responses: customResponses,
    }).select('id').single();

    if (player?.id) {
      await supabase.from('tryout_assignments').insert({
        club_id: clubId, player_id: (player as { id: string }).id,
        team: 'Unassigned', status: 'Unassigned', offer_status: 'NotSent',
      });
    }
    setSubmitting(false); setSubmitted(true);
  }

  const inp: React.CSSProperties = { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '15px', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const errStyle: React.CSSProperties = { fontSize: '12px', color: '#EF4444', marginTop: '3px' };
  const fieldLbl = (t: string, req = false) => <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>{t}{req && ' *'}</label>;

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#9CA3AF' }}>Loading…</div></div>;
  if (notFound) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>Form not found</div><div style={{ color: '#6B7280' }}>Check the URL and try again.</div></div></div>;

  if (submitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: `${clubColor}20`, border: `2px solid ${clubColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '26px' }}>✓</div>
        <div style={{ fontSize: '22px', fontWeight: '800', color: '#111827', marginBottom: '10px' }}>{config?.successTitle ?? 'Registration Complete!'}</div>
        <div style={{ fontSize: '15px', color: '#6B7280', lineHeight: '1.7' }}>{config?.successBody ?? 'Thank you for registering.'}</div>
      </div>
    </div>
  );

  const f = config;
  // Split questions: first question (tryout date) shows before player info; rest after parent info
  const allQuestions = f?.questions ?? [];
  const firstQuestion = allQuestions[0] ?? null;
  const remainingQuestions = allQuestions.slice(1);

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: '60px' }}>
      {/* Hero header */}
      <div style={{ background: clubColor, padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '26px', fontWeight: '800', color: '#fff', marginBottom: '6px' }}>{f?.formTitle ?? `${clubName} Tryout Registration`}</div>
        {f?.formSubtitle && <div style={{ fontSize: '16px', color: 'rgba(255,255,255,0.85)' }}>{f.formSubtitle}</div>}
      </div>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Welcome / info sections */}
          {f?.welcomeText && <InfoCard title="Welcome" body={f.welcomeText} color={clubColor} />}
          {f?.locationText && (
            <div style={{ background: '#fff', borderRadius: '14px', padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ fontSize: '20px', flexShrink: 0 }}>📍</div>
              <div>
                <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#374151', marginBottom: '2px' }}>Location</div>
                <div style={{ fontSize: '14px', color: '#111827', fontWeight: '600' }}>{f.locationText}</div>
              </div>
            </div>
          )}
          {f?.sessionScheduleText && <InfoCard title="🗓️ Tryout Session Schedule" body={f.sessionScheduleText} color="#6366F1" />}
          {f?.offerTimelineText && <InfoCard title="📬 Offer Process & Timeline" body={f.offerTimelineText} color="#F59E0B" />}
          {f?.importantInfoText && <InfoCard title="✅ Important Information" body={f.importantInfoText} color="#22C55E" />}
          {f?.contactText && (
            <div style={{ background: '#fff', borderRadius: '14px', padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ fontSize: '20px', flexShrink: 0 }}>📞</div>
              <div>
                <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#374151', marginBottom: '2px' }}>Contact</div>
                <div style={{ fontSize: '14px', color: '#111827', whiteSpace: 'pre-line' }}>{f.contactText}</div>
              </div>
            </div>
          )}

          <div style={{ borderTop: `3px solid ${clubColor}`, margin: '4px 0' }} />

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* First custom question (tryout date) — before player info */}
            {firstQuestion && (
              <div style={{ background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderTop: `3px solid ${clubColor}` }}>
                <QuestionField q={firstQuestion} value={customResponses[firstQuestion.id]} onChange={setCustom} error={errors[firstQuestion.id]} color={clubColor} />
              </div>
            )}

            {/* Player information */}
            <div style={{ background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontWeight: '700', fontSize: '15px', color: '#111827', marginBottom: '16px' }}>Player Information</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  {fieldLbl('First name', true)}
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} style={{ ...inp, borderColor: errors.first_name ? '#EF4444' : '#D1D5DB' }} />
                  {errors.first_name && <div style={errStyle}>{errors.first_name}</div>}
                </div>
                <div>
                  {fieldLbl('Last name', true)}
                  <input value={lastName} onChange={e => setLastName(e.target.value)} style={{ ...inp, borderColor: errors.last_name ? '#EF4444' : '#D1D5DB' }} />
                  {errors.last_name && <div style={errStyle}>{errors.last_name}</div>}
                </div>
                <div>
                  {fieldLbl('Gender', true)}
                  <select value={gender} onChange={e => setGender(e.target.value)} style={{ ...inp, borderColor: errors.gender ? '#EF4444' : '#D1D5DB' }}>
                    <option value="">Select…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                  {errors.gender && <div style={errStyle}>{errors.gender}</div>}
                </div>
                <div>
                  {fieldLbl('Date of birth', true)}
                  <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={{ ...inp, borderColor: errors.dob ? '#EF4444' : '#D1D5DB' }} />
                  {errors.dob && <div style={errStyle}>{errors.dob}</div>}
                </div>
                <div>
                  {fieldLbl('Current grade (Spring 2026)', true)}
                  <select value={grade} onChange={e => setGrade(e.target.value)} style={{ ...inp, borderColor: errors.grade ? '#EF4444' : '#D1D5DB' }}>
                    <option value="">Select…</option>
                    {(f?.gradeOptions ?? ['K','1','2','3','4','5','6','7','8']).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {errors.grade && <div style={errStyle}>{errors.grade}</div>}
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  {fieldLbl('Primary positions (select all that apply)')}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                    {(f?.positionOptions ?? ['GK','Defender','Midfielder','Forward','Not Sure']).map(pos => (
                      <button key={pos} type="button" onClick={() => togglePosition(pos)}
                        style={{ padding: '7px 14px', borderRadius: '8px', border: `2px solid ${positions.includes(pos) ? clubColor : '#E5E7EB'}`, background: positions.includes(pos) ? `${clubColor}15` : '#fff', color: positions.includes(pos) ? clubColor : '#374151', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Parent/Guardian */}
            <div style={{ background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontWeight: '700', fontSize: '15px', color: '#111827', marginBottom: '16px' }}>Parent / Guardian</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  {fieldLbl('Full name', true)}
                  <input value={parentName} onChange={e => setParentName(e.target.value)} style={{ ...inp, borderColor: errors.parent_name ? '#EF4444' : '#D1D5DB' }} />
                </div>
                <div>
                  {fieldLbl('Email', true)}
                  <input type="email" value={emailPrimary} onChange={e => setEmailPrimary(e.target.value)} style={{ ...inp, borderColor: errors.email_primary ? '#EF4444' : '#D1D5DB' }} />
                  {errors.email_primary && <div style={errStyle}>{errors.email_primary}</div>}
                </div>
                <div>
                  {fieldLbl('Phone', true)}
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inp} />
                </div>
                <div>
                  {fieldLbl('Town')}
                  <input value={town} onChange={e => setTown(e.target.value)} style={inp} />
                </div>
              </div>
            </div>

            {/* Remaining custom questions */}
            {remainingQuestions.length > 0 && (
              <div style={{ background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ fontWeight: '700', fontSize: '15px', color: '#111827', marginBottom: '16px' }}>Soccer Experience & Club Info</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {remainingQuestions.map(q => (
                    <QuestionField key={q.id} q={q} value={customResponses[q.id]} onChange={setCustom} error={errors[q.id]} color={clubColor} />
                  ))}
                </div>
              </div>
            )}

            {/* How did you hear */}
            {(f?.referralOptions ?? []).length > 0 && (
              <div style={{ background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                {fieldLbl('How did you hear about us?')}
                <select value={referralSource} onChange={e => setReferralSource(e.target.value)} style={inp}>
                  <option value="">Select…</option>
                  {(f?.referralOptions ?? []).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}

            <button type="submit" disabled={submitting}
              style={{ padding: '15px', borderRadius: '12px', background: clubColor, color: '#fff', border: 'none', fontSize: '16px', fontWeight: '700', cursor: 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: 'inherit' }}>
              {submitting ? 'Submitting…' : (f?.submitLabel ?? 'Submit Registration')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function QuestionField({ q, value, onChange, error, color }: {
  q: Question; value: string | string[] | undefined;
  onChange: (id: string, val: string | string[]) => void;
  error?: string; color: string;
}) {
  const inp: React.CSSProperties = { width: '100%', padding: '11px 14px', borderRadius: '10px', border: `1px solid ${error ? '#EF4444' : '#D1D5DB'}`, fontSize: '15px', color: '#111827', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div>
      <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>
        {q.label}{q.required && ' *'}
      </label>
      {q.helpText && <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '7px', lineHeight: '1.5' }}>{q.helpText}</div>}

      {q.type === 'text' && (
        <input value={(value as string) ?? ''} onChange={e => onChange(q.id, e.target.value)} style={inp} />
      )}
      {q.type === 'textarea' && (
        <textarea value={(value as string) ?? ''} onChange={e => onChange(q.id, e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} />
      )}
      {q.type === 'date' && (
        <input type="date" value={(value as string) ?? ''} onChange={e => onChange(q.id, e.target.value)} style={inp} />
      )}
      {q.type === 'select' && (
        <select value={(value as string) ?? ''} onChange={e => onChange(q.id, e.target.value)} style={inp}>
          <option value="">Select…</option>
          {q.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {q.type === 'radio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          {q.options.map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 14px', borderRadius: '9px', border: `1.5px solid ${value === opt ? color : '#E5E7EB'}`, background: value === opt ? `${color}08` : '#fff', transition: 'border-color 0.1s' }}>
              <input type="radio" name={q.id} value={opt} checked={value === opt} onChange={() => onChange(q.id, opt)} style={{ accentColor: color, width: '16px', height: '16px', flexShrink: 0 }} />
              <span style={{ fontSize: '14px', color: '#111827', fontWeight: value === opt ? '600' : '400' }}>{opt}</span>
            </label>
          ))}
        </div>
      )}
      {q.type === 'multiselect' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
          {q.options.map(opt => {
            const sel = ((value as string[]) ?? []).includes(opt);
            return (
              <button key={opt} type="button"
                onClick={() => { const cur = (value as string[]) ?? []; onChange(q.id, sel ? cur.filter(v => v !== opt) : [...cur, opt]); }}
                style={{ padding: '7px 14px', borderRadius: '8px', border: `2px solid ${sel ? color : '#E5E7EB'}`, background: sel ? `${color}15` : '#fff', color: sel ? color : '#374151', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                {opt}
              </button>
            );
          })}
        </div>
      )}
      {q.type === 'checkbox' && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', padding: '12px 14px', borderRadius: '9px', border: `1.5px solid ${value ? color : '#E5E7EB'}`, background: value ? `${color}08` : '#fff' }}>
          <input type="checkbox" checked={!!value} onChange={e => onChange(q.id, e.target.checked ? 'true' : '')} style={{ accentColor: color, width: '17px', height: '17px', marginTop: '1px', flexShrink: 0 }} />
          <span style={{ fontSize: '14px', color: '#111827', lineHeight: '1.5' }}>{q.label}</span>
        </label>
      )}
      {error && <div style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>{error}</div>}
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
