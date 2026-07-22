'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { Save, Plus, Trash2, GripVertical, ExternalLink } from 'lucide-react';

type Question = {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'multiselect' | 'date' | 'checkbox';
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
  welcomeText: string;
  locationText: string;
  sessionScheduleText: string;
  offerTimelineText: string;
  importantInfoText: string;
  contactText: string;
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

function genId() { return Math.random().toString(36).slice(2, 9); }

const MAROONS_DEFAULT: FormConfig = {
  formTitle: '{{clubName}} Tryout Registration',
  formSubtitle: 'Fall 2026 – Spring 2027 Season',
  welcomeText: `Welcome to the {{clubName}} Tryouts for the Fall 2026 – Spring 2027 season!

We are excited to evaluate players interested in joining our competitive teams for the upcoming year. Please complete this form to register for tryouts.

US Soccer Age Group Update: Beginning Fall 2026, US Soccer is transitioning youth soccer from calendar-year age groups to a seasonal-year model (August 1 – July 31). At {{clubName}}, tryout groupings and team placement are based on school grade under the new US Soccer seasonal-year model. For players born in August or September, grade-based alignment will be applied so those players remain with their school peer group.

Tryout Process: Each player is required to attend one tryout session. Following the tryout, selected players may be invited to a team training session for further evaluation. After evaluations are complete, offer letters will be sent based on performance, roster needs, and team balance. Not every player who attends will be offered a roster spot.`,
  locationText: 'Superdome Sports, 134 Hopper Ave, Waldwick, NJ 07463',
  sessionScheduleText: `Saturday, April 11, 2026 (Boys & Girls)
• 1st Grade (Incoming 2nd) — 9:00 AM – 10:00 AM
• 2nd Grade (Incoming 3rd) — 10:00 AM – 11:00 AM
• 3rd Grade (Incoming 4th) — 11:00 AM – 12:00 PM
• 4th Grade (Incoming 5th) — 12:00 PM – 1:00 PM
• 5th Grade (Incoming 6th) — 1:00 PM – 2:00 PM
• 6th/7th Grade (Incoming 7th/8th) — 2:00 PM – 3:00 PM

Tuesday, April 14, 2026 (Girls ONLY)
• 1st/2nd Grade (Incoming 2nd/3rd) — 4:00 PM – 5:00 PM
• 3rd/4th Grade (Incoming 4th/5th) — 5:00 PM – 6:00 PM
• 5th/6th/7th Grade (Incoming 6th/7th/8th) — 6:00 PM – 7:00 PM

Wednesday, April 15, 2026 (Boys ONLY)
• 1st/2nd Grade (Incoming 2nd/3rd) — 4:00 PM – 5:00 PM
• 3rd/4th Grade (Incoming 4th/5th) — 5:00 PM – 6:00 PM
• 5th/6th/7th Grade (Incoming 6th/7th/8th) — 6:00 PM – 7:00 PM`,
  offerTimelineText: 'Offer letters will be sent via email on June 1st. Families will have one week to accept their roster spot. After the deadline, remaining spots will be offered to waitlisted players. No offers will be released before June 1st.',
  importantInfoText: `• Players must bring shin guards, cleats, and a properly inflated ball
• Please arrive at least 15 minutes early for check-in
• Tryouts are free of charge, but registration is required`,
  contactText: 'Boys Program: Rick Breheny – rick@maroonssoccer.com\nGirls Program: Ben Manning – ben@maroonssoccer.com',
  seasonLabel: '2026-27',
  submitLabel: 'Submit Registration',
  successTitle: 'Registration Complete!',
  successBody: 'Thank you for registering for {{clubName}} Tryouts. Offer letters will be sent on June 1st. We look forward to seeing you on the field — good luck!',
  gradeOptions: ['1st Grade','2nd Grade','3rd Grade','4th Grade','5th Grade','6th Grade','7th Grade','8th Grade'],
  positionOptions: ['GK','Defender','Midfielder','Forward','Not Sure'],
  referralOptions: ['Friend','Social Media','Website','Attended a camp/clinic with {{clubName}}','Coach Referral','Other'],
  jerseySizeOptions: ['YS','YM','YL','AS','AM','AL','AXL'],
  questions: [
    {
      id: 'q_tryout_date',
      type: 'radio',
      label: 'Which tryout date will you be attending?',
      helpText: 'Select the session that matches your player\'s grade. See the session schedule above.',
      required: true,
      options: [
        'Saturday, April 11th (Boys & Girls)',
        'Tuesday, April 14th (Girls ONLY)',
        'Wednesday, April 15th (Boys ONLY)',
      ],
      fieldKey: 'tryout_date',
      builtIn: false,
    },
    {
      id: 'q_grade_alignment',
      type: 'radio',
      label: 'Is your child in the school grade that aligns with the October 1 school cutoff?',
      helpText: 'Players born in August or September may be in a different grade than typical for their birthdate.',
      required: true,
      options: [
        'Yes',
        'No — my child is in a higher grade than typical for their birthdate',
        'No — my child is in a lower grade than typical for their birthdate',
      ],
      fieldKey: 'grade_alignment',
      builtIn: false,
    },
    {
      id: 'q_email_secondary',
      type: 'text',
      label: 'Additional Parent / Guardian Email (Optional)',
      helpText: 'If provided, offer letters and important updates will also be sent to this address.',
      required: false,
      options: [],
      fieldKey: 'email_secondary',
      builtIn: false,
    },
    {
      id: 'q_prev_experience',
      type: 'radio',
      label: 'Previous Soccer Experience',
      helpText: '',
      required: true,
      options: ['Recreational', 'Travel / Select', 'Club', 'No prior experience'],
      fieldKey: 'prev_experience',
      builtIn: false,
    },
    {
      id: 'q_dual_card',
      type: 'radio',
      label: 'Do you plan to dual card and play for another club during the 2026–2027 season?',
      helpText: '',
      required: true,
      options: [
        'Yes, I plan to dual card and play for another club.',
        'No, {{clubName}} will be my primary and only club.',
        'Not sure yet.',
      ],
      fieldKey: 'dual_card',
      builtIn: false,
    },
    {
      id: 'q_dual_card_league',
      type: 'radio',
      label: 'If yes, what league will that club compete in?',
      helpText: 'Only complete if you answered Yes above.',
      required: false,
      options: ['US CLUB (NCSA & NPL)', 'NJYS (EDP)', 'Not Sure'],
      fieldKey: 'dual_card_league',
      builtIn: false,
    },
    {
      id: 'q_maroons_status',
      type: 'radio',
      label: 'What is your current status with {{clubName}}?',
      helpText: '',
      required: true,
      options: [
        'I am currently rostered on a {{clubName}} team',
        'I previously played for {{clubName}} and want to return',
        'I have never played for {{clubName}} and am a new player',
      ],
      fieldKey: 'maroons_status',
      builtIn: false,
    },
    {
      id: 'q_agreement_1',
      type: 'checkbox',
      label: 'I confirm that the information provided is accurate, and I understand the tryout process and club policies.',
      helpText: '',
      required: true,
      options: [],
      fieldKey: 'agreement_1',
      builtIn: false,
    },
    {
      id: 'q_agreement_2',
      type: 'checkbox',
      label: 'I acknowledge that I will be contacted regarding tryout results and next steps.',
      helpText: '',
      required: true,
      options: [],
      fieldKey: 'agreement_2',
      builtIn: false,
    },
  ],
};

const QUESTION_TYPES: { value: Question['type']; label: string; icon: string; color: string }[] = [
  { value: 'radio',       label: 'Multiple choice', icon: '◉', color: '#6366F1' },
  { value: 'checkbox',    label: 'Checkbox',        icon: '☑',  color: '#8B5CF6' },
  { value: 'text',        label: 'Short text',      icon: 'T',  color: '#0EA5E9' },
  { value: 'textarea',    label: 'Long text',       icon: '≡',  color: '#0EA5E9' },
  { value: 'select',      label: 'Dropdown',        icon: '▾',  color: '#F59E0B' },
  { value: 'multiselect', label: 'Multi-select',    icon: '☰',  color: '#F59E0B' },
  { value: 'date',        label: 'Date',            icon: '📅', color: '#22C55E' },
];

const BUILT_IN_FIELDS = [
  { label: 'First & last name', icon: '👤' },
  { label: 'Date of birth',     icon: '🎂' },
  { label: 'Gender',            icon: '⚥' },
  { label: 'Grade',             icon: '🏫' },
  { label: 'Positions',         icon: '⚽' },
  { label: 'Parent name',       icon: '👨‍👩‍👦' },
  { label: 'Email',             icon: '✉️' },
  { label: 'Phone',             icon: '📱' },
  { label: 'Town',              icon: '📍' },
  { label: 'How did you hear',  icon: '📣' },
];

function QuestionCard({ q, idx, total, onMove, onUpdate, onRemove }: {
  q: Question; idx: number; total: number;
  onMove: (dir: -1|1) => void;
  onUpdate: (patch: Partial<Question>) => void;
  onRemove: () => void;
}) {
  const [optionDraft, setOptionDraft] = useState('');
  const typeInfo = QUESTION_TYPES.find(t => t.value === q.type) ?? QUESTION_TYPES[0];
  const hasOptions = ['radio','select','multiselect'].includes(q.type);

  function addOption() {
    const val = optionDraft.trim();
    if (!val) return;
    onUpdate({ options: [...q.options, val] });
    setOptionDraft('');
  }
  function removeOption(i: number) {
    onUpdate({ options: q.options.filter((_, j) => j !== i) });
  }
  function editOption(i: number, val: string) {
    const opts = [...q.options]; opts[i] = val; onUpdate({ options: opts });
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC' }}>
        {/* Number badge */}
        <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: typeInfo.color + '18', border: `1.5px solid ${typeInfo.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: typeInfo.color, flexShrink: 0 }}>
          {idx + 1}
        </div>

        {/* Type badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '20px', background: typeInfo.color + '12', border: `1px solid ${typeInfo.color}30`, flexShrink: 0 }}>
          <span style={{ fontSize: '11px' }}>{typeInfo.icon}</span>
          <span style={{ fontSize: '11px', fontWeight: '700', color: typeInfo.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{typeInfo.label}</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Required toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', flexShrink: 0 }}>
          <div
            onClick={() => onUpdate({ required: !q.required })}
            style={{
              width: '34px', height: '19px', borderRadius: '10px', flexShrink: 0, cursor: 'pointer',
              background: q.required ? '#22C55E' : '#E2E8F0', transition: 'background 0.2s', position: 'relative',
            }}>
            <div style={{
              position: 'absolute', top: '2px', left: q.required ? '17px' : '2px',
              width: '15px', height: '15px', borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
            }} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: '600', color: q.required ? '#374151' : '#94A3B8' }}>Required</span>
        </label>

        {/* Move buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
          <button onClick={() => onMove(-1)} disabled={idx === 0}
            style={{ width: '20px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid #E2E8F0', borderRadius: '4px', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#E2E8F0' : '#64748B', fontSize: '9px', padding: 0 }}>▲</button>
          <button onClick={() => onMove(1)} disabled={idx === total - 1}
            style={{ width: '20px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid #E2E8F0', borderRadius: '4px', cursor: idx === total - 1 ? 'default' : 'pointer', color: idx === total - 1 ? '#E2E8F0' : '#64748B', fontSize: '9px', padding: 0 }}>▼</button>
        </div>

        <button onClick={onRemove}
          style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '7px', cursor: 'pointer', flexShrink: 0 }}>
          <Trash2 size={13} color="#EF4444" />
        </button>
      </div>

      {/* Card body */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Question label + type selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'start' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>Question</label>
            <input
              placeholder="e.g. Which tryout date will you attend?"
              value={q.label}
              onChange={e => onUpdate({ label: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #E2E8F0', fontSize: '14px', color: '#0F172A', fontWeight: '500', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ minWidth: '150px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>Answer type</label>
            <select
              value={q.type}
              onChange={e => onUpdate({ type: e.target.value as Question['type'], options: [] })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #E2E8F0', fontSize: '13px', color: '#374151', background: '#fff', outline: 'none', cursor: 'pointer' }}
            >
              {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {/* Help text */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>Helper text <span style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>(optional — shown below the question)</span></label>
          <input
            placeholder="e.g. Players born in Aug/Sep may be in a different grade…"
            value={q.helpText}
            onChange={e => onUpdate({ helpText: e.target.value })}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #E2E8F0', fontSize: '13px', color: '#374151', background: '#F9FAFB', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Options (radio / select / multiselect) */}
        {hasOptions && (
          <div>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
              Answer options <span style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>({q.options.length})</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
              {q.options.map((opt, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: q.type === 'radio' ? '50%' : '5px', border: '2px solid #D1D5DB', background: '#F9FAFB', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: q.type === 'radio' ? '50%' : '2px', background: '#D1D5DB' }} />
                  </div>
                  <input
                    value={opt}
                    onChange={e => editOption(i, e.target.value)}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: '7px', border: '1.5px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none' }}
                  />
                  <button onClick={() => removeOption(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#CBD5E1', flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                placeholder="New option…"
                value={optionDraft}
                onChange={e => setOptionDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                style={{ flex: 1, padding: '7px 10px', borderRadius: '7px', border: '1.5px dashed #CBD5E1', fontSize: '13px', color: '#374151', background: '#F9FAFB', outline: 'none' }}
              />
              <button onClick={addOption}
                style={{ padding: '7px 14px', borderRadius: '7px', background: '#F1F5F9', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: '700', color: '#475569', cursor: 'pointer' }}>
                + Add
              </button>
            </div>
            {q.options.length === 0 && (
              <div style={{ fontSize: '12px', color: '#F59E0B', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                ⚠ Add at least one option for this question type
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TryoutFormConfigPage() {
  const { club } = useDashboard();
  const [config, setConfig] = useState<FormConfig>(MAROONS_DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<'header'|'location'|'schedule'|'offers'|'info'|'contacts'|'options'|'questions'|'success'>('header');

  useEffect(() => {
    if (!club) return;
    supabase.from('tryout_form_config').select('*').eq('club_id', club.id).single()
      .then(({ data }) => {
        if (data?.config_json) setConfig({ ...MAROONS_DEFAULT, ...data.config_json });
      });
  }, [club]);

  async function handleSave() {
    if (!club) return;
    setSaving(true);
    await supabase.from('tryout_form_config').upsert({ club_id: club.id, config_json: config, season_label: config.seasonLabel }, { onConflict: 'club_id' });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function addQuestion() {
    const q: Question = { id: genId(), type: 'radio', label: '', helpText: '', required: false, options: [], fieldKey: genId(), builtIn: false };
    setConfig(c => ({ ...c, questions: [...c.questions, q] }));
  }
  function updateQ(id: string, patch: Partial<Question>) {
    setConfig(c => ({ ...c, questions: c.questions.map(q => q.id === id ? { ...q, ...patch } : q) }));
  }
  function removeQ(id: string) {
    setConfig(c => ({ ...c, questions: c.questions.filter(q => q.id !== id) }));
  }
  function moveQ(id: string, dir: -1 | 1) {
    setConfig(c => {
      const qs = [...c.questions]; const i = qs.findIndex(q => q.id === id); const j = i + dir;
      if (j < 0 || j >= qs.length) return c;
      [qs[i], qs[j]] = [qs[j], qs[i]]; return { ...c, questions: qs };
    });
  }

  const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const ta: React.CSSProperties = { ...inp, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' };
  const lbl = (t: string, sub?: string) => (
    <div style={{ marginBottom: '6px' }}>
      <label style={{ fontSize: '12px', fontWeight: '700', color: '#374151', display: 'block' }}>{t}</label>
      {sub && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
  const hint = (text: string) => (
    <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12.5px', color: '#92400E', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
      <span style={{ flexShrink: 0 }}>👁</span><span><strong>What families see:</strong> {text}</span>
    </div>
  );

  const publicUrl = club ? `${typeof window !== 'undefined' ? window.location.origin : 'https://pulse-fc.app'}/tryout-registration?club=${(club as { slug?: string }).slug ?? ''}` : '';

  type SectionId = 'header'|'location'|'schedule'|'offers'|'info'|'contacts'|'options'|'questions'|'success';

  const SECTIONS: { id: SectionId; num: number; label: string; icon: string; desc: string }[] = [
    { id: 'header',    num: 1, label: 'Header & welcome',  icon: 'H₁', desc: 'Title, subtitle, and intro message' },
    { id: 'location',  num: 2, label: 'Location',          icon: '📍', desc: config.locationText || 'Where tryouts are held' },
    { id: 'schedule',  num: 3, label: 'Session schedule',  icon: '📅', desc: 'Dates, times, and age group breakdown' },
    { id: 'offers',    num: 4, label: 'Offer process',     icon: '📬', desc: 'How and when offers will be sent' },
    { id: 'info',      num: 5, label: 'Important info',    icon: '📌', desc: 'What to bring, what to expect' },
    { id: 'contacts',  num: 6, label: 'Contacts',          icon: '📞', desc: 'Who families should reach out to' },
    { id: 'options',   num: 7, label: 'Drop-down lists',   icon: '⚙', desc: 'Grade, position, referral, jersey sizes' },
    { id: 'questions', num: 8, label: 'Custom questions',  icon: '❓', desc: `${config.questions.length} question${config.questions.length !== 1 ? 's' : ''} added` },
    { id: 'success',   num: 9, label: 'Submit & success',  icon: '✓', desc: 'Confirmation shown after registration' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Sticky header */}
      <div style={{ padding: '14px 24px', background: '#fff', borderBottom: `3px solid ${club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E'}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '2px' }}>Tryout Setup</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Registration Form</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {publicUrl && (
            <a href={publicUrl} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#64748B', textDecoration: 'none', fontWeight: '600', padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: '6px', background: '#fff' }}>
              <ExternalLink size={12} /> Preview form
            </a>
          )}
          <button onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: saved ? '#16A34A' : '#22C55E', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 18px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
            <Save size={14} />{saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Body: left nav + right panel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Left section list */}
        <div style={{ width: '240px', flexShrink: 0, borderRight: '1px solid #E2E8F0', background: '#fff', overflowY: 'auto', padding: '16px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '0 8px', marginBottom: '10px' }}>Form sections</div>
          {SECTIONS.map(s => {
            const active = activeSection === s.id;
            return (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%', padding: '10px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: '2px',
                  background: active ? `${club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E'}12` : 'transparent',
                  borderLeft: active ? `2px solid ${club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E'}` : '2px solid transparent',
                }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800',
                  background: active ? (club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E') : '#F1F5F9',
                  color: active ? '#fff' : '#64748B' }}>
                  {s.num}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: active ? '700' : '500', color: active ? '#0D1117' : '#374151', lineHeight: '1.3' }}>{s.label}</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{s.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right editing panel */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#F0F2F5' }}>

          {activeSection === 'header' && (
            <div style={{ maxWidth: '680px' }}>
              {hint('A bold banner at the top of the form showing your title, subtitle, and a welcome message that explains what the tryout is about.')}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>{lbl('Form title', 'Big bold headline at the top')}<input value={config.formTitle} onChange={e => setConfig(c => ({ ...c, formTitle: e.target.value }))} style={inp} /></div>
                  <div>{lbl('Season label', 'Internal reference, e.g. 2026-27')}<input value={config.seasonLabel} onChange={e => setConfig(c => ({ ...c, seasonLabel: e.target.value }))} style={inp} /></div>
                  <div style={{ gridColumn: '1/-1' }}>{lbl('Subtitle', 'Smaller line below the title, e.g. "Fall 2026 – Spring 2027 Registration"')}<input value={config.formSubtitle} onChange={e => setConfig(c => ({ ...c, formSubtitle: e.target.value }))} style={inp} /></div>
                  <div style={{ gridColumn: '1/-1' }}>{lbl('Welcome / intro text', 'Friendly paragraph explaining the tryout process and what to expect')}<textarea value={config.welcomeText} onChange={e => setConfig(c => ({ ...c, welcomeText: e.target.value }))} rows={8} style={ta} /></div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'location' && (
            <div style={{ maxWidth: '680px' }}>
              {hint('Displayed in a section of the form so families know where to show up.')}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px' }}>
                {lbl('Venue name & address', 'e.g. Superdome Sports, 134 Hopper Ave, Waldwick, NJ 07463')}
                <input value={config.locationText} onChange={e => setConfig(c => ({ ...c, locationText: e.target.value }))} style={inp} />
              </div>
            </div>
          )}

          {activeSection === 'schedule' && (
            <div style={{ maxWidth: '680px' }}>
              {hint('Shown as a formatted block before families pick their tryout date. Use line breaks and bullet points — it renders exactly as you type it.')}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px' }}>
                {lbl('Session schedule', 'Dates, times, and which age groups attend each session')}
                <textarea value={config.sessionScheduleText} onChange={e => setConfig(c => ({ ...c, sessionScheduleText: e.target.value }))} rows={16} style={ta} />
              </div>
            </div>
          )}

          {activeSection === 'offers' && (
            <div style={{ maxWidth: '680px' }}>
              {hint('Displayed in an info block so families understand when and how they will hear back about roster spots.')}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px' }}>
                {lbl('Offer process & timeline')}
                <textarea value={config.offerTimelineText} onChange={e => setConfig(c => ({ ...c, offerTimelineText: e.target.value }))} rows={6} style={ta} />
              </div>
            </div>
          )}

          {activeSection === 'info' && (
            <div style={{ maxWidth: '680px' }}>
              {hint('A bullet-point block shown to families. Include what to bring, what to wear, any fees, and day-of logistics.')}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px' }}>
                {lbl('Important information', 'Use • for bullet points')}
                <textarea value={config.importantInfoText} onChange={e => setConfig(c => ({ ...c, importantInfoText: e.target.value }))} rows={6} style={ta} />
              </div>
            </div>
          )}

          {activeSection === 'contacts' && (
            <div style={{ maxWidth: '680px' }}>
              {hint('Shown at the bottom of the info sections. List the right contact for each program (boys, girls, etc.).')}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px' }}>
                {lbl('Contact information', 'e.g. Boys Program: Rick Breheny – rick@club.com')}
                <textarea value={config.contactText} onChange={e => setConfig(c => ({ ...c, contactText: e.target.value }))} rows={4} style={ta} />
              </div>
            </div>
          )}

          {activeSection === 'options' && (
            <div style={{ maxWidth: '680px' }}>
              {hint('These power the drop-down pickers on the registration form. Edit each list to match what your club uses.')}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {([
                  ['gradeOptions',    'Grade options',           'e.g. 1st Grade, 2nd Grade, 3rd Grade…'],
                  ['positionOptions', 'Position options',        'e.g. GK, Defender, Midfielder, Forward, Not Sure'],
                  ['referralOptions', 'How did you hear options','e.g. Friend, Social Media, Coach Referral…'],
                  ['jerseySizeOptions','Jersey size options',    'e.g. YS, YM, YL, AS, AM, AL, AXL'],
                ] as const).map(([key, label, placeholder]) => (
                  <div key={key}>
                    {lbl(label, 'Comma-separated list')}
                    <input
                      placeholder={placeholder}
                      value={(config[key] as string[]).join(', ')}
                      onChange={e => setConfig(c => ({ ...c, [key]: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                      style={inp}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                      {(config[key] as string[]).map((opt, i) => (
                        <span key={i} style={{ fontSize: '11px', background: '#F1F5F9', color: '#374151', borderRadius: '4px', padding: '2px 8px', fontWeight: '600' }}>{opt}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'questions' && (
            <div style={{ maxWidth: '720px' }}>
              {/* Built-in fields */}
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#15803D', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#22C55E', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '900' }}>✓</span>
                  Always included — no setup needed
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {BUILT_IN_FIELDS.map(f => (
                    <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '20px', background: '#fff', border: '1px solid #D1FAE5', fontSize: '11.5px', color: '#065F46', fontWeight: '600' }}>
                      <span style={{ fontSize: '11px' }}>{f.icon}</span> {f.label}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12.5px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>💡</span>
                <span>Use <code style={{ background: '#FEF3C7', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>{'{{clubName}}'}</code> anywhere — it&apos;ll be replaced with your club name on the live form.</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                {config.questions.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', border: '1px dashed #E2E8F0', borderRadius: '8px' }}>
                    <div style={{ fontSize: '28px', marginBottom: '10px' }}>📋</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>No custom questions yet</div>
                    <div style={{ fontSize: '13px', color: '#94A3B8' }}>Add questions for anything beyond the built-in fields above.</div>
                  </div>
                )}
                {config.questions.map((q, idx) => (
                  <QuestionCard
                    key={q.id} q={q} idx={idx} total={config.questions.length}
                    onMove={dir => moveQ(q.id, dir)}
                    onUpdate={patch => updateQ(q.id, patch)}
                    onRemove={() => removeQ(q.id)}
                  />
                ))}
              </div>

              <button onClick={addQuestion}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '2px dashed #CBD5E1', borderRadius: '8px', padding: '14px 20px', fontSize: '13.5px', cursor: 'pointer', color: '#475569', fontWeight: '700', width: '100%', justifyContent: 'center' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#22C55E'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#CBD5E1'}>
                <Plus size={15} color="#22C55E" /> Add custom question
              </button>
            </div>
          )}

          {activeSection === 'success' && (
            <div style={{ maxWidth: '680px' }}>
              {hint('Shown immediately after a family submits the form. Keep it warm and informative — confirm they\'re registered and tell them what happens next.')}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>{lbl('Submit button label', 'Text on the button families click to send their registration')}<input value={config.submitLabel} onChange={e => setConfig(c => ({ ...c, submitLabel: e.target.value }))} style={inp} /></div>
                <div>{lbl('Success heading', 'e.g. Registration Complete!')}<input value={config.successTitle} onChange={e => setConfig(c => ({ ...c, successTitle: e.target.value }))} style={inp} /></div>
                <div>{lbl('Success message', 'e.g. Thank you! Offer letters will be sent on June 1st.')}<textarea value={config.successBody} onChange={e => setConfig(c => ({ ...c, successBody: e.target.value }))} rows={4} style={ta} /></div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
