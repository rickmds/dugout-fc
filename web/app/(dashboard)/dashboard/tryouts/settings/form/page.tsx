'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { Save, Plus, Trash2, ExternalLink, Copy, Check, Search, Download, Edit2, X } from 'lucide-react';

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

// One row of the Responses table. Carries the raw first/last/DOB
// alongside the already-formatted display cells so duplicate detection
// can match on the real values rather than re-parsing formatted text.
type ResponseRow = {
  id: string;
  name: string;
  cells: string[];
  isDuplicate: boolean;
};

const MAROONS_DEFAULT: FormConfig = {
  formTitle: '{{clubName}} Tryout Registration',
  formSubtitle: 'Fall 2026 – Spring 2027 Season',
  welcomeText: `Welcome to the {{clubName}} Tryouts for the Fall 2026 – Spring 2027 season!

We are excited to evaluate players interested in joining our competitive teams for the upcoming year. Please complete this form to register for tryouts.

US Soccer Age Group Update: Beginning Fall 2026, US Soccer is transitioning youth soccer from calendar-year age groups to a seasonal-year model (August 1 – July 31). At {{clubName}}, tryout groupings and team placement are based on school grade under the new US Soccer seasonal-year model. For players born in August or September, grade-based alignment will be applied so those players remain with their school peer group.

Tryout Process: Each player is required to attend one tryout session. Following the tryout, selected players may be invited to a team training session for further evaluation. After evaluations are complete, offer letters will be sent based on performance, roster needs, and team balance. Not every player who attends will be offered a roster spot.`,
  // These three were previously seeded with Maroons SC's real venue address
  // and Rick's/Ben's personal emails — a self-serve club that enabled
  // tryouts without noticing would publish that as "their own" contact
  // info. Left as bracketed prompts instead of Maroons-specific defaults;
  // the templated fields above/below are legitimate generic starting copy.
  locationText: '[Add your tryout venue address]',
  sessionScheduleText: '[Add your tryout session dates and times]',
  offerTimelineText: 'Offer letters will be sent via email on June 1st. Families will have one week to accept their roster spot. After the deadline, remaining spots will be offered to waitlisted players. No offers will be released before June 1st.',
  importantInfoText: `• Players must bring shin guards, cleats, and a properly inflated ball
• Please arrive at least 15 minutes early for check-in
• Tryouts are free of charge, but registration is required`,
  contactText: '[Add your tryout program contact name(s) and email(s)]',
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
  // Responses is the default landing tab — once a form exists, checking
  // who's registered is the day-to-day reason to be on this page; editing
  // the 9 setup steps is occasional, not the common case.
  const [activeTab, setActiveTab] = useState<'responses' | 'setup'>('responses');
  const [linkCopied, setLinkCopied] = useState(false);
  const [responseCount, setResponseCount] = useState<number | null>(null);
  const [responseData, setResponseData] = useState<{ headers: string[]; rows: ResponseRow[] } | null>(null);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [responseSearch, setResponseSearch] = useState('');
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Raw text for the 4 comma-separated option fields, kept separate from
  // config[key] (the parsed string[]). The input's value must mirror this,
  // not a `.join(', ')` of the parsed array — reconstructing the string
  // from the array on every keystroke snaps a just-typed trailing comma
  // (or consecutive commas) back out before a second item can be typed,
  // since split(',').filter(Boolean) has already dropped the empty token
  // it produces.
  const [rawOptionText, setRawOptionText] = useState<Record<string, string>>({
    gradeOptions: MAROONS_DEFAULT.gradeOptions.join(', '),
    positionOptions: MAROONS_DEFAULT.positionOptions.join(', '),
    referralOptions: MAROONS_DEFAULT.referralOptions.join(', '),
    jerseySizeOptions: MAROONS_DEFAULT.jerseySizeOptions.join(', '),
  });

  useEffect(() => {
    if (!club) return;
    supabase.from('tryout_form_config').select('*').eq('club_id', club.id).single()
      .then(({ data }) => {
        const merged: FormConfig = data?.config_json ? { ...MAROONS_DEFAULT, ...data.config_json } : MAROONS_DEFAULT;
        if (data?.config_json) {
          setConfig(merged);
          setRawOptionText({
            gradeOptions: merged.gradeOptions.join(', '),
            positionOptions: merged.positionOptions.join(', '),
            referralOptions: merged.referralOptions.join(', '),
            jerseySizeOptions: merged.jerseySizeOptions.join(', '),
          });
        }
        // Responses is the default tab, so load it eagerly right after
        // config resolves — passed explicitly rather than read back off
        // `config` state, since that setConfig above hasn't landed yet
        // in this same tick.
        loadResponses(merged.questions);
      });
    supabase.from('tryout_players').select('id', { count: 'exact', head: true }).eq('club_id', club.id)
      .then(({ count }) => setResponseCount(count ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadResponses is a plain function redefined each render; its real reactive input (club) is already listed here
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

  const publicUrl = club ? `${typeof window !== 'undefined' ? window.location.origin : 'https://pulse-fc.app'}/t/${(club as { slug?: string }).slug ?? ''}` : '';

  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    });
  }

  // One column per thing this form actually asks — the built-in Step
  // 1/2 fields plus every custom question, in the order they're asked —
  // not the full tryout_players row. A handful of that table's columns
  // (current team, the second guardian email, which tryout date) are
  // only ever filled in THROUGH a custom question, so including them
  // again as a separate built-in column would just duplicate the same
  // answer under two headers; team/status/offer_status are the admin's
  // own decisions, not something a family answered, so those live on
  // the Player Pool page instead, not here.
  // Takes `questions` explicitly rather than reading config.questions off
  // component state — called once eagerly right after the config fetch
  // resolves (see the useEffect above), before that state update has
  // actually landed, so reading `config` here would see last render's
  // (possibly still-default) value instead of what was just fetched.
  async function loadResponses(questions: Question[]) {
    if (!club) return;
    setLoadingResponses(true);
    const { data } = await supabase
      .from('tryout_players')
      .select('id,first_name,last_name,gender,date_of_birth,grade,positions,parent_name,email_primary,phone,town,referral_source,custom_responses,created_at')
      .eq('club_id', club.id)
      .order('created_at', { ascending: false });

    const builtIn: [string, string][] = [
      ['first_name', 'First name'], ['last_name', 'Last name'], ['gender', 'Gender'],
      ['date_of_birth', 'Date of birth'], ['grade', 'Grade'], ['positions', 'Preferred position(s)'],
      ['parent_name', 'Parent / Guardian'], ['email_primary', 'Email'], ['phone', 'Phone'],
      ['town', 'Town / City'], ['referral_source', 'How did you hear about us?'],
    ];
    const headers = [...builtIn.map(([, label]) => label), ...questions.map(q => q.label), 'Submitted'];

    const cellText = (v: unknown): string => Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v));

    const people = (data ?? []) as { id: string; first_name: string; last_name: string; date_of_birth: string | null; custom_responses: unknown; created_at: string }[];

    // Duplicate = same name + same DOB, not same email — a parent can
    // register more than one kid with the same email, so email would
    // false-positive on siblings; requiring a real (non-null) DOB on both
    // sides avoids flagging unrelated kids who both just left it blank.
    const dupCounts = new Map<string, number>();
    for (const p of people) {
      if (!p.date_of_birth) continue;
      const key = `${p.first_name.trim().toLowerCase()}|${p.last_name.trim().toLowerCase()}|${p.date_of_birth}`;
      dupCounts.set(key, (dupCounts.get(key) ?? 0) + 1);
    }

    const rows: ResponseRow[] = people.map(p => {
      const builtInVals = builtIn.map(([key]) => cellText((p as unknown as Record<string, unknown>)[key]));
      const responses = (p.custom_responses ?? {}) as Record<string, unknown>;
      const customVals = questions.map(q => cellText(responses[q.id]));
      const key = p.date_of_birth ? `${p.first_name.trim().toLowerCase()}|${p.last_name.trim().toLowerCase()}|${p.date_of_birth}` : null;
      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        cells: [...builtInVals, ...customVals, new Date(p.created_at).toLocaleString('en-US')],
        isDuplicate: !!key && (dupCounts.get(key) ?? 0) > 1,
      };
    });

    setResponseData({ headers, rows });
    setLoadingResponses(false);
  }

  function exportResponsesCSV() {
    if (!responseData || !club) return;
    const csv = [responseData.headers.join(','), ...responseData.rows.map(r => r.cells.map(v => JSON.stringify(v ?? '')).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${club.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-tryout-responses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  async function deleteResponse() {
    if (!deletingPlayer) return;
    setDeleting(true);
    await supabase.from('tryout_players').delete().eq('id', deletingPlayer.id);
    setDeleting(false);
    setDeletingPlayer(null);
    loadResponses(config.questions);
    setResponseCount(c => (c ?? 1) - 1);
  }

  const filteredResponseRows = responseData
    ? (responseSearch.trim()
        ? responseData.rows.filter(r => r.cells.some(cell => cell.toLowerCase().includes(responseSearch.toLowerCase())))
        : responseData.rows)
    : [];

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
      <div style={{ background: '#fff', borderBottom: `3px solid ${club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E'}`, flexShrink: 0 }}>
        <div style={{ padding: '14px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '2px' }}>Tryout Setup</div>
            <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Registration Form</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {publicUrl && (
              <button onClick={copyLink}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: linkCopied ? '#16A34A' : '#64748B', fontWeight: '600', padding: '7px 14px', border: `1px solid ${linkCopied ? '#16A34A' : '#E2E8F0'}`, borderRadius: '6px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                {linkCopied ? <Check size={12} /> : <Copy size={12} />} {linkCopied ? 'Copied!' : 'Copy link'}
              </button>
            )}
            {publicUrl && (
              <a href={publicUrl} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#64748B', textDecoration: 'none', fontWeight: '600', padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: '6px', background: '#fff' }}>
                <ExternalLink size={12} /> Preview form
              </a>
            )}
            {activeTab === 'setup' && (
              <button onClick={handleSave} disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: saved ? '#16A34A' : '#22C55E', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 18px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                <Save size={14} />{saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
        </div>

        {/* Top-level tabs — Responses is the default/common case once a
            form exists; Form Setup is the occasional one-time config. */}
        <div style={{ display: 'flex', gap: '4px', padding: '14px 24px 0' }}>
          {([
            { id: 'responses' as const, label: 'Responses', badge: responseCount },
            { id: 'setup' as const, label: 'Form Setup', badge: null },
          ]).map(t => {
            const active = activeTab === t.id;
            const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 4px', border: 'none', borderBottom: active ? `2px solid ${primary}` : '2px solid transparent', background: 'none', cursor: 'pointer', marginRight: '22px', fontSize: '13.5px', fontWeight: active ? '700' : '600', color: active ? '#0D1117' : '#64748B' }}>
                {t.label}
                {t.badge !== null && <span style={{ fontSize: '11px', background: active ? `${primary}18` : '#F1F5F9', color: active ? primary : '#94A3B8', borderRadius: '10px', padding: '1px 8px', fontWeight: '700' }}>{t.badge}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'responses' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#F0F2F5' }}>
          {hint('One column per question on the form, one row per family — everything they answered, for quickly finding something without leaving the dashboard.')}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '360px' }}>
              <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
              <input placeholder="Search any answer…" value={responseSearch} onChange={e => setResponseSearch(e.target.value)}
                style={{ ...inp, paddingLeft: '32px' }} />
            </div>
            <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '600' }}>
              {responseData ? `${filteredResponseRows.length} of ${responseData.rows.length}` : ''}
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => loadResponses(config.questions)} disabled={loadingResponses}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12.5px', fontWeight: '600', color: '#374151', cursor: loadingResponses ? 'default' : 'pointer', opacity: loadingResponses ? 0.6 : 1 }}>
              {loadingResponses ? 'Refreshing…' : 'Refresh'}
            </button>
            <button onClick={exportResponsesCSV} disabled={!responseData || !responseData.rows.length}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12.5px', fontWeight: '600', color: '#374151', cursor: responseData?.rows.length ? 'pointer' : 'default', opacity: responseData?.rows.length ? 1 : 0.5 }}>
              <Download size={13} /> Export CSV
            </button>
          </div>

          {loadingResponses && !responseData && (
            <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#94A3B8' }}>Loading responses…</div>
          )}

          {responseData && responseData.rows.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#94A3B8', background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              No one has registered yet — once families start submitting the form, their answers show up here.
            </div>
          )}

          {responseData && responseData.rows.some(r => r.isDuplicate) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '12.5px', color: '#92400E' }}>
              <span>⚠</span>
              <span><strong>{responseData.rows.filter(r => r.isDuplicate).length} possible duplicate{responseData.rows.filter(r => r.isDuplicate).length !== 1 ? 's' : ''}</strong> — same first name, last name, and date of birth as another entry (highlighted below). Most likely a double-submit, but check before deleting.</span>
            </div>
          )}

          {responseData && responseData.rows.length > 0 && (
            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '12.5px', width: 'max-content', minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', padding: '9px 10px', width: '64px' }} />
                    {responseData.headers.map((h, i) => (
                      <th key={i} style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', padding: '9px 14px', textAlign: 'left', fontWeight: '700', color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredResponseRows.map((row, ri) => (
                    <tr key={row.id} style={{ borderBottom: ri < filteredResponseRows.length - 1 ? '1px solid #F1F5F9' : 'none', background: row.isDuplicate ? '#FFFBEB' : undefined }}>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => setEditingPlayerId(row.id)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', color: '#64748B' }}><Edit2 size={13} /></button>
                        <button onClick={() => setDeletingPlayer({ id: row.id, name: row.name })} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', color: '#EF4444' }}><Trash2 size={13} /></button>
                      </td>
                      {row.cells.map((cell, ci) => (
                        <td key={ci} style={{ padding: '9px 14px', color: '#0F172A', whiteSpace: 'nowrap', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ci === 0 && row.isDuplicate && <span title="Possible duplicate" style={{ marginRight: '6px' }}>⚠</span>}
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editingPlayerId && (
        <ResponseEditModal
          playerId={editingPlayerId}
          questions={config.questions}
          primary={club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E'}
          onClose={() => setEditingPlayerId(null)}
          onSaved={() => { setEditingPlayerId(null); loadResponses(config.questions); }}
        />
      )}

      {deletingPlayer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }} onClick={() => !deleting && setDeletingPlayer(null)}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '380px', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', marginBottom: '8px' }}>Delete this registration?</div>
            <div style={{ fontSize: '13.5px', color: '#64748B', marginBottom: '22px', lineHeight: '1.6' }}>
              <strong style={{ color: '#0F172A' }}>{deletingPlayer.name}</strong>&apos;s registration and all their answers will be permanently deleted. This can&apos;t be undone.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setDeletingPlayer(null)} disabled={deleting} style={{ flex: 1, padding: '10px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={deleteResponse} disabled={deleting} style={{ flex: 1, padding: '10px', borderRadius: '9px', border: 'none', background: '#EF4444', color: '#fff', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer', opacity: deleting ? 0.7 : 1 }}>{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Body: left nav + right panel (Form Setup tab only) */}
      {activeTab === 'setup' && (
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
                {lbl('Venue name & address', 'e.g. Riverside Sports Complex, 123 Main St, Springfield, NJ 07081')}
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
                {lbl('Contact information', 'e.g. Boys Program: Alex Johnson – alex@club.com')}
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
                      value={rawOptionText[key] ?? ''}
                      onChange={e => {
                        const raw = e.target.value;
                        setRawOptionText(r => ({ ...r, [key]: raw }));
                        setConfig(c => ({ ...c, [key]: raw.split(',').map(s => s.trim()).filter(Boolean) }));
                      }}
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
      )}
    </div>
  );
}

// Fetches the real row fresh on open rather than working off the
// already-flattened display strings in the Responses table — editing
// needs the actual typed values back (an array for positions/multiselect,
// a real date for date inputs), not a joined string reverse-parsed out of
// what's shown on screen.
type EditablePlayer = {
  first_name: string; last_name: string; gender: string | null; date_of_birth: string | null;
  grade: string | null; positions: string[] | null; parent_name: string | null;
  email_primary: string | null; phone: string | null; town: string | null;
  referral_source: string | null; custom_responses: Record<string, unknown> | null;
};

function ResponseEditModal({ playerId, questions, primary, onClose, onSaved }: {
  playerId: string; questions: Question[]; primary: string; onClose: () => void; onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditablePlayer | null>(null);
  const [positionsText, setPositionsText] = useState('');

  useEffect(() => {
    supabase.from('tryout_players')
      .select('first_name,last_name,gender,date_of_birth,grade,positions,parent_name,email_primary,phone,town,referral_source,custom_responses')
      .eq('id', playerId).single()
      .then(({ data }) => {
        if (data) {
          setForm(data as EditablePlayer);
          setPositionsText((data.positions ?? []).join(', '));
        }
        setLoading(false);
      });
  }, [playerId]);

  function setCustom(id: string, val: string | string[]) {
    setForm(f => f ? { ...f, custom_responses: { ...(f.custom_responses ?? {}), [id]: val } } : f);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    const positions = positionsText.split(',').map(s => s.trim()).filter(Boolean);
    await supabase.from('tryout_players').update({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      grade: form.grade || null,
      positions: positions.length ? positions : null,
      parent_name: form.parent_name?.trim() || null,
      email_primary: form.email_primary?.trim() || null,
      phone: form.phone?.trim() || null,
      town: form.town?.trim() || null,
      referral_source: form.referral_source || null,
      custom_responses: form.custom_responses ?? {},
    }).eq('id', playerId);
    setSaving(false);
    onSaved();
  }

  const fieldSt: React.CSSProperties = { padding: '9px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelSt: React.CSSProperties = { fontSize: '11.5px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: '5px' };

  function renderCustomField(q: Question) {
    const val = form?.custom_responses?.[q.id];
    if (q.type === 'checkbox') {
      const checked = !!val;
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', color: '#0F172A' }}>
          <input type="checkbox" checked={checked} onChange={e => setCustom(q.id, e.target.checked ? 'true' : '')} />
          {checked ? 'Yes' : 'No'}
        </label>
      );
    }
    if (q.type === 'multiselect') {
      const sel = (Array.isArray(val) ? val : []) as string[];
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {q.options.map(opt => {
            const on = sel.includes(opt);
            return (
              <button key={opt} type="button"
                onClick={() => setCustom(q.id, on ? sel.filter(v => v !== opt) : [...sel, opt])}
                style={{ padding: '6px 12px', borderRadius: '7px', border: `1.5px solid ${on ? primary : '#E2E8F0'}`, background: on ? `${primary}15` : '#fff', color: on ? primary : '#374151', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
    if (q.type === 'select' || q.type === 'radio') {
      return (
        <select value={(val as string) ?? ''} onChange={e => setCustom(q.id, e.target.value)} style={fieldSt}>
          <option value="">Select…</option>
          {q.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (q.type === 'date') {
      return <input type="date" value={(val as string) ?? ''} onChange={e => setCustom(q.id, e.target.value)} style={fieldSt} />;
    }
    if (q.type === 'textarea') {
      return <textarea value={(val as string) ?? ''} onChange={e => setCustom(q.id, e.target.value)} rows={3} style={{ ...fieldSt, resize: 'vertical' as const }} />;
    }
    return <input value={(val as string) ?? ''} onChange={e => setCustom(q.id, e.target.value)} style={fieldSt} />;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }} onClick={() => !saving && onClose()}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Edit registration</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#64748B" /></button>
        </div>

        {loading && <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#94A3B8' }}>Loading…</div>}

        {!loading && form && (
          <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div><span style={labelSt}>First name</span><input value={form.first_name} onChange={e => setForm(f => f && { ...f, first_name: e.target.value })} style={fieldSt} /></div>
              <div><span style={labelSt}>Last name</span><input value={form.last_name} onChange={e => setForm(f => f && { ...f, last_name: e.target.value })} style={fieldSt} /></div>
              <div><span style={labelSt}>Gender</span>
                <select value={form.gender ?? ''} onChange={e => setForm(f => f && { ...f, gender: e.target.value })} style={fieldSt}>
                  <option value="">Select…</option><option value="Male">Male</option><option value="Female">Female</option>
                </select>
              </div>
              <div><span style={labelSt}>Date of birth</span><input type="date" value={form.date_of_birth ?? ''} onChange={e => setForm(f => f && { ...f, date_of_birth: e.target.value })} style={fieldSt} /></div>
              <div><span style={labelSt}>Grade</span><input value={form.grade ?? ''} onChange={e => setForm(f => f && { ...f, grade: e.target.value })} style={fieldSt} /></div>
              <div><span style={labelSt}>Preferred position(s)</span><input value={positionsText} onChange={e => setPositionsText(e.target.value)} placeholder="GK, Forward" style={fieldSt} /></div>
            </div>

            <div style={{ height: '1px', background: '#F1F5F9' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1/-1' }}><span style={labelSt}>Parent / Guardian</span><input value={form.parent_name ?? ''} onChange={e => setForm(f => f && { ...f, parent_name: e.target.value })} style={fieldSt} /></div>
              <div><span style={labelSt}>Email</span><input type="email" value={form.email_primary ?? ''} onChange={e => setForm(f => f && { ...f, email_primary: e.target.value })} style={fieldSt} /></div>
              <div><span style={labelSt}>Phone</span><input value={form.phone ?? ''} onChange={e => setForm(f => f && { ...f, phone: e.target.value })} style={fieldSt} /></div>
              <div><span style={labelSt}>Town / City</span><input value={form.town ?? ''} onChange={e => setForm(f => f && { ...f, town: e.target.value })} style={fieldSt} /></div>
              <div><span style={labelSt}>How did you hear about us?</span><input value={form.referral_source ?? ''} onChange={e => setForm(f => f && { ...f, referral_source: e.target.value })} style={fieldSt} /></div>
            </div>

            {questions.length > 0 && (
              <>
                <div style={{ height: '1px', background: '#F1F5F9' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {questions.map(q => (
                    <div key={q.id}>
                      <span style={labelSt}>{q.label}</span>
                      {renderCustomField(q)}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ padding: '16px 22px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '10px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving || loading} style={{ flex: 1, padding: '10px', borderRadius: '9px', border: 'none', background: primary, color: '#fff', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}
