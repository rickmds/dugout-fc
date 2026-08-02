'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X, Plus, RefreshCw, Sparkles, FileText, Trash2, GripVertical, Settings2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { WAIVER_TEMPLATES, labelSt, inputSt, backBtnSt, uid } from './shared';
import type { RegForm, FieldDef, FieldType, PriceMode, PaymentOptions } from './shared';

// ── Field type metadata (coach-friendly language) ─────────────────────────────

const FIELD_META: Record<FieldType, { emoji: string; label: string; hint: string; color: string; bg: string }> = {
  section:     { emoji: '📂', label: 'Section header',    hint: 'Groups fields with a title',             color: '#7C3AED', bg: '#F5F3FF' },
  text:        { emoji: '✏️', label: 'Short answer',      hint: 'Single line of text',                    color: '#2563EB', bg: '#EFF6FF' },
  textarea:    { emoji: '📝', label: 'Long answer',        hint: 'Paragraph text box',                    color: '#2563EB', bg: '#EFF6FF' },
  email:       { emoji: '📧', label: 'Email address',      hint: 'Validates format automatically',         color: '#0891B2', bg: '#ECFEFF' },
  phone:       { emoji: '📱', label: 'Phone number',       hint: 'Mobile or home number',                 color: '#059669', bg: '#ECFDF5' },
  number:      { emoji: '🔢', label: 'Number',             hint: 'Accepts digits only',                   color: '#D97706', bg: '#FFFBEB' },
  date:        { emoji: '📅', label: 'Date',               hint: 'Date picker',                           color: '#D97706', bg: '#FFFBEB' },
  select:      { emoji: '🔽', label: 'Dropdown',           hint: 'Pick one from a list',                  color: '#7C3AED', bg: '#F5F3FF' },
  radio:       { emoji: '🔘', label: 'Single choice',      hint: 'Pick one — shown as radio buttons',     color: '#7C3AED', bg: '#F5F3FF' },
  multiselect: { emoji: '☑️', label: 'Multiple choice',    hint: 'Tick all that apply',                   color: '#7C3AED', bg: '#F5F3FF' },
  file:        { emoji: '📎', label: 'File upload',        hint: 'Photo, PDF, or document',               color: '#EA580C', bg: '#FFF7ED' },
  waiver:      { emoji: '✍️', label: 'Consent / waiver',  hint: 'Parent must read and agree',             color: '#DC2626', bg: '#FEF2F2' },
  volunteer:   { emoji: '🙋', label: 'Volunteer sign-up', hint: 'Pick a duty slot',                       color: '#0F766E', bg: '#F0FDFA' },
};

const FIELD_GROUPS: { label: string; types: FieldType[] }[] = [
  { label: 'Basic',    types: ['text', 'textarea', 'number', 'date', 'email', 'phone'] },
  { label: 'Choice',   types: ['dropdown', 'radio', 'multiselect'] as unknown as FieldType[] },
  { label: 'Special',  types: ['file', 'volunteer'] },
  { label: 'Layout',   types: ['section'] },
];

// Fix: group choices use canonical type names
const CANONICAL_GROUPS: { label: string; types: FieldType[] }[] = [
  { label: 'Basic',   types: ['text', 'textarea', 'number', 'date', 'email', 'phone'] },
  { label: 'Choice',  types: ['select', 'radio', 'multiselect'] },
  { label: 'Special', types: ['file', 'volunteer'] },
  { label: 'Layout',  types: ['section'] },
];

// ── Templates ─────────────────────────────────────────────────────────────────

type TplKey = 'season' | 'camp' | 'tryout' | 'membership' | 'tournament' | 'blank';

const TEMPLATES: Record<TplKey, { label: string; icon: string; desc: string; fields: Omit<FieldDef, 'id'>[] }> = {
  season: {
    label: 'Season Registration', icon: '📋', desc: 'Full season sign-up with medical and emergency info',
    fields: [
      { type: 'section', label: 'Player information', required: false },
      { type: 'text',    label: "Player's full name", required: true },
      { type: 'date',    label: 'Date of birth', required: true },
      { type: 'select',  label: 'Primary position', required: true, options: 'Goalkeeper,Defender,Midfielder,Forward' },
      { type: 'number',  label: 'Jersey number (preference)', required: false },
      { type: 'section', label: 'Parent / Guardian', required: false },
      { type: 'text',    label: 'Parent / guardian name', required: true },
      { type: 'email',   label: 'Email address', required: true },
      { type: 'phone',   label: 'Mobile number', required: true },
      { type: 'section', label: 'Medical & Emergency', required: false },
      { type: 'text',    label: 'Emergency contact name', required: true },
      { type: 'phone',   label: 'Emergency contact phone', required: true },
      { type: 'textarea', label: 'Medical conditions or allergies', required: false, placeholder: 'List any or write "None"' },
      { type: 'section', label: 'Consents', required: false },
      { type: 'waiver',  label: 'Season participation waiver', required: true, waiver_text: 'I consent to my child participating in all club training sessions and matches this season and acknowledge the inherent risks of physical activity.' },
    ],
  },
  camp: {
    label: 'Camp / Clinic', icon: '⚽', desc: 'Single-event or short-programme registration',
    fields: [
      { type: 'section', label: 'Player information', required: false },
      { type: 'text',    label: "Player's full name", required: true },
      { type: 'date',    label: 'Date of birth', required: true },
      { type: 'select',  label: 'Primary position', required: false, options: 'Goalkeeper,Defender,Midfielder,Forward' },
      { type: 'section', label: 'Parent / Guardian', required: false },
      { type: 'text',    label: 'Parent / guardian name', required: true },
      { type: 'email',   label: 'Email address', required: true },
      { type: 'phone',   label: 'Mobile number', required: true },
      { type: 'section', label: 'Medical & Emergency', required: false },
      { type: 'text',    label: 'Emergency contact name', required: true },
      { type: 'phone',   label: 'Emergency contact phone', required: true },
      { type: 'textarea', label: 'Medical conditions or allergies', required: false, placeholder: 'List any or write "None"' },
      { type: 'section', label: 'Consents', required: false },
      { type: 'waiver',  label: 'Photo & video consent', required: true, waiver_text: 'I give permission for my child to be photographed and filmed during camp activities. Images may be used on club social media.' },
      { type: 'waiver',  label: 'Medical treatment consent', required: true, waiver_text: 'I consent to staff seeking emergency medical treatment for my child if required and I cannot be reached.' },
    ],
  },
  tryout: {
    label: 'Tryout / Trial', icon: '🏆', desc: 'Quick form for players applying for a team trial',
    fields: [
      { type: 'section', label: 'Player information', required: false },
      { type: 'text',    label: "Player's full name", required: true },
      { type: 'date',    label: 'Date of birth', required: true },
      { type: 'select',  label: 'Primary position', required: true, options: 'Goalkeeper,Defender,Midfielder,Forward' },
      { type: 'select',  label: 'Secondary position', required: false, options: 'Goalkeeper,Defender,Midfielder,Forward,None' },
      { type: 'text',    label: 'Current club', required: false, placeholder: 'Club name or "Unattached"' },
      { type: 'section', label: 'Parent / Guardian', required: false },
      { type: 'text',    label: 'Parent / guardian name', required: true },
      { type: 'email',   label: 'Email address', required: true },
      { type: 'phone',   label: 'Mobile number', required: true },
      { type: 'section', label: 'Consents', required: false },
      { type: 'waiver',  label: 'Medical treatment consent', required: true, waiver_text: 'I consent to staff seeking emergency medical treatment for my child if required and I cannot be reached in time.' },
    ],
  },
  membership: {
    label: 'Club Membership', icon: '🏅', desc: 'Annual membership registration for the whole club',
    fields: [
      { type: 'section', label: 'Player information', required: false },
      { type: 'text',    label: "Player's full name", required: true },
      { type: 'date',    label: 'Date of birth', required: true },
      { type: 'section', label: 'Contact details', required: false },
      { type: 'text',    label: 'Parent / guardian name', required: true },
      { type: 'email',   label: 'Email address', required: true },
      { type: 'phone',   label: 'Mobile number', required: true },
      { type: 'text',    label: 'Home address', required: false },
      { type: 'section', label: 'Consents', required: false },
      { type: 'waiver',  label: 'Membership terms', required: true, waiver_text: 'I agree to the club rules and code of conduct for the current membership year.' },
    ],
  },
  tournament: {
    label: 'Tournament Entry', icon: '🥇', desc: 'Entry form for an away tournament or cup competition',
    fields: [
      { type: 'section',    label: 'Player information', required: false },
      { type: 'text',       label: "Player's full name", required: true },
      { type: 'date',       label: 'Date of birth', required: true },
      { type: 'section',    label: 'Parent / Guardian', required: false },
      { type: 'text',       label: 'Parent / guardian name', required: true },
      { type: 'email',      label: 'Email address', required: true },
      { type: 'phone',      label: 'Mobile number', required: true },
      { type: 'section',    label: 'Travel & logistics', required: false },
      { type: 'radio',      label: 'Can you provide transport?', required: true, options: 'Yes,No,If needed' },
      { type: 'number',     label: 'Available car seats (if driving)', required: false },
      { type: 'select',     label: 'Dietary requirements', required: false, options: 'None,Vegetarian,Vegan,Halal,Nut allergy,Other' },
      { type: 'section',    label: 'Consents', required: false },
      { type: 'waiver',     label: 'Tournament travel consent', required: true, waiver_text: 'I consent to my child travelling to and from the tournament with the club and participating in all activities.' },
    ],
  },
  blank: {
    label: 'Blank form', icon: '📄', desc: 'Start from scratch — add only the fields you need',
    fields: [
      { type: 'text',  label: 'Full name',     required: true },
      { type: 'email', label: 'Email address', required: true },
      { type: 'phone', label: 'Phone number',  required: false },
    ],
  },
};

function makeFields(defs: Omit<FieldDef, 'id'>[]): FieldDef[] {
  return defs.map((d) => ({ ...d, id: uid() }));
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FormBuilder({ editingForm, onDone, onCancel }: {
  editingForm: RegForm | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { profile, club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const isOrgAdmin = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  type Step = 'template' | 'build' | 'settings';
  const [step, setStep]           = useState<Step>(editingForm ? 'build' : 'template');
  const [templateKey, setTemplateKey] = useState<TplKey | null>(null);
  const [title, setTitle]         = useState(editingForm?.title ?? '');
  const [description, setDescription] = useState(editingForm?.description ?? '');
  const [teamId, setTeamId]       = useState(editingForm?.team_id ?? teams[0]?.id ?? '');
  const [deadline, setDeadline]   = useState(editingForm?.deadline?.slice(0, 16) ?? '');
  const [maxSpots, setMaxSpots]   = useState(editingForm?.max_spots?.toString() ?? '');
  const [seasonLabel, setSeasonLabel] = useState(editingForm?.season_label ?? '');
  const [confMsg, setConfMsg]     = useState(editingForm?.confirmation_message ?? "Thank you for registering! We'll be in touch shortly.");
  const [sendEmail, setSendEmail] = useState(editingForm?.send_confirmation_email ?? true);
  const [fields, setFields]       = useState<FieldDef[]>(editingForm ? (Array.isArray(editingForm.fields) ? editingForm.fields as FieldDef[] : []) : []);
  const [financialAid, setFinancialAid] = useState(editingForm?.financial_aid_enabled ?? false);
  const [requiredDocs, setRequiredDocs] = useState<string[]>(Array.isArray(editingForm?.required_docs) ? (editingForm.required_docs as string[]) : []);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  // Pricing
  const [isPaid, setIsPaid]       = useState(!!editingForm?.price || !!editingForm?.price_mode);
  const [priceMode, setPriceMode] = useState<PriceMode>(editingForm?.price_mode ?? 'flat');
  const [price, setPrice]         = useState(editingForm?.price?.toString() ?? '');
  const [currency, setCurrency]   = useState(editingForm?.currency ?? 'GBP');
  const [payOpts, setPayOpts]     = useState<PaymentOptions>(editingForm?.payment_options ?? 'both');
  const [planInst, setPlanInst]   = useState(editingForm?.plan_installments?.toString() ?? '3');
  const [planFreq, setPlanFreq]   = useState<'monthly'|'weekly'>(editingForm?.plan_frequency ?? 'monthly');
  const [planDeposit, setPlanDeposit] = useState(editingForm?.plan_deposit?.toString() ?? '');

  // Saved waivers
  const [savedWaivers, setSavedWaivers] = useState<{ id: string; title: string; body: string }[]>([]);

  // Waiver create modal
  const [showWaiverModal, setShowWaiverModal] = useState(false);
  const [wvTemplate, setWvTemplate] = useState<string | null>(null);
  const [wvNotes, setWvNotes]     = useState('');
  const [wvBody, setWvBody]       = useState('');
  const [wvTitle, setWvTitle]     = useState('');
  const [wvMode, setWvMode]       = useState<'preview'|'edit'>('preview');
  const [wvGenerating, setWvGenerating] = useState(false);
  const [wvGenError, setWvGenError] = useState('');
  const [wvSaving, setWvSaving]   = useState(false);

  useEffect(() => {
    if (!club) return;
    supabase.from('waivers').select('id, title, body').eq('club_id', club.id).order('created_at', { ascending: false })
      .then(({ data }) => setSavedWaivers(data ?? []));
  }, [club?.id]);

  function addField(type: FieldType) {
    const meta = FIELD_META[type];
    setFields((p) => [...p, { id: uid(), type, label: meta.label, required: type !== 'section' }]);
  }
  function updateField(id: string, patch: Partial<FieldDef>) {
    setFields((p) => p.map((f) => f.id === id ? { ...f, ...patch } : f));
  }
  function removeField(id: string) { setFields((p) => p.filter((f) => f.id !== id)); }
  function moveField(id: string, dir: -1 | 1) {
    setFields((p) => {
      const i = p.findIndex((f) => f.id === id);
      if (i + dir < 0 || i + dir >= p.length) return p;
      const n = [...p]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; return n;
    });
  }

  function resetWaiver() { setWvTemplate(null); setWvNotes(''); setWvBody(''); setWvTitle(''); setWvMode('preview'); setWvGenError(''); }

  async function handleWvGenerate() {
    if (!wvTemplate || !club) return;
    setWvGenerating(true); setWvGenError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/ai/generate-waiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ template_type: wvTemplate, custom_notes: wvNotes, club_name: club.name }),
      });
      const data = await res.json();
      if (data.body) {
        setWvBody(data.body);
        if (!wvTitle.trim()) {
          const tmpl = WAIVER_TEMPLATES.find((t) => t.id === wvTemplate);
          if (tmpl) { const yr = new Date().getFullYear(); setWvTitle(`${tmpl.label} ${yr}/${String(yr + 1).slice(2)}`); }
        }
      } else { setWvGenError('Generation failed. Try again.'); }
    } catch { setWvGenError('Generation failed. Try again.'); }
    finally { setWvGenerating(false); }
  }

  async function handleWvSaveAndAttach() {
    if (!club || !wvTitle.trim() || !wvBody.trim()) return;
    setWvSaving(true);
    const { data: w, error: e } = await supabase
      .from('waivers').insert({ club_id: club.id, title: wvTitle.trim(), body: wvBody.trim(), created_by: profile?.id })
      .select('id, title, body').single();
    if (e || !w) { setWvGenError('Failed to save. Try again.'); setWvSaving(false); return; }
    setSavedWaivers((p) => [w, ...p]);
    setFields((p) => [...p, { id: uid(), type: 'waiver', label: w.title, required: true, waiver_text: w.body }]);
    setShowWaiverModal(false); resetWaiver(); setWvSaving(false);
  }

  async function handleSave() {
    if (!title.trim() || !club) return;
    setSaving(true); setError('');
    const payload = {
      club_id: club.id, team_id: teamId || null, title: title.trim(),
      description: description.trim() || null,
      fields: fields.map(({ id: _id, ...rest }) => rest),
      deadline: deadline || null,
      max_spots: maxSpots ? parseInt(maxSpots) : null,
      confirmation_message: confMsg,
      send_confirmation_email: sendEmail,
      season_label: seasonLabel.trim() || null,
      financial_aid_enabled: financialAid,
      required_docs: requiredDocs.filter((d) => d.trim()),
      price: isPaid && priceMode === 'flat' && price ? parseFloat(price) : null,
      currency,
      payment_options: isPaid ? payOpts : 'full',
      plan_installments: parseInt(planInst) || 3,
      plan_frequency: planFreq,
      plan_deposit: isPaid && planDeposit ? parseFloat(planDeposit) : null,
      price_mode: isPaid ? priceMode : null,
      created_by: profile?.id,
    };
    const { error: e } = editingForm
      ? await supabase.from('registration_forms').update(payload).eq('id', editingForm.id)
      : await supabase.from('registration_forms').insert({ ...payload, status: 'draft' });
    setSaving(false);
    if (e) { setError(e.message); return; }
    onDone();
  }

  // ── STEP 1 — Template ─────────────────────────────────────────────────────
  if (step === 'template') {
    return (
      <div style={{ padding: '32px', maxWidth: '860px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <button onClick={onCancel} style={backBtnSt}>← Cancel</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', margin: 0 }}>New registration form</h1>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '3px 0 0' }}>Pick a starting point — you can customise every field after</p>
          </div>
          <StepPills step={step} primary={primary} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '32px' }}>
          {(Object.entries(TEMPLATES) as [TplKey, typeof TEMPLATES[TplKey]][]).map(([key, t]) => {
            const sel = templateKey === key;
            return (
              <button key={key} onClick={() => setTemplateKey(key)}
                style={{ background: sel ? `${primary}08` : '#fff', border: `2px solid ${sel ? primary : '#E2E8F0'}`, borderRadius: '16px', padding: '22px 18px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', outline: 'none' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px', lineHeight: 1 }}>{t.icon}</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: sel ? primary : '#0F172A', marginBottom: '5px' }}>{t.label}</div>
                <div style={{ fontSize: '12px', color: '#64748B', lineHeight: '1.5', marginBottom: '12px' }}>{t.desc}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: sel ? primary : '#94A3B8', background: sel ? `${primary}15` : '#F1F5F9', borderRadius: '20px', padding: '2px 8px' }}>
                    {t.fields.filter(f => f.type !== 'section').length} fields
                  </span>
                  {t.fields.some(f => f.type === 'waiver') && (
                    <span style={{ fontSize: '10px', fontWeight: '700', color: '#DC2626', background: '#FEE2E2', borderRadius: '20px', padding: '2px 8px' }}>✍️ waiver included</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <button onClick={() => {
          if (!templateKey) return;
          const tpl = TEMPLATES[templateKey];
          setTitle(templateKey === 'blank' ? '' : tpl.label);
          setFields(makeFields(tpl.fields));
          setStep('build');
        }} disabled={!templateKey}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: templateKey ? primary : '#CBD5E1', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px 28px', fontWeight: '700', fontSize: '15px', cursor: templateKey ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          Use template — customise fields →
        </button>
      </div>
    );
  }

  // ── STEP 2 — Build ────────────────────────────────────────────────────────
  const nonSectionCount = fields.filter(f => f.type !== 'section').length;
  const waiverCount     = fields.filter(f => f.type === 'waiver').length;

  if (step === 'build') {
    return (
      <div style={{ padding: '28px 32px', maxWidth: '1080px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <button onClick={() => { if (editingForm) onCancel(); else setStep('template'); }} style={backBtnSt}>
            ← {editingForm ? 'Cancel' : 'Back'}
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: 0 }}>
              {editingForm ? `Editing: ${editingForm.title}` : 'Build your form'}
            </h1>
          </div>
          {!editingForm && <StepPills step={step} primary={primary} />}
        </div>

        {/* Form title */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          <div>
            <label style={labelSt}>Form title <span style={{ color: '#DC2626' }}>*</span></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fall 2025 Season Registration"
              style={{ ...inputSt, fontSize: '15px', fontWeight: '600' }} />
          </div>
          <div>
            <label style={labelSt}>Short description for parents (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this form for?" style={inputSt} />
          </div>
        </div>

        {/* Stats bar */}
        {fields.length > 0 && (
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', padding: '10px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '12px', color: '#64748B', flexWrap: 'wrap' }}>
            <span>📋 <strong style={{ color: '#0F172A' }}>{nonSectionCount}</strong> question{nonSectionCount !== 1 ? 's' : ''}</span>
            {waiverCount > 0 && <span>✍️ <strong style={{ color: '#DC2626' }}>{waiverCount}</strong> consent{waiverCount !== 1 ? 's' : ''}</span>}
            <span style={{ color: fields.filter(f => f.required).length > 0 ? '#D97706' : '#94A3B8' }}>
              ⚡ <strong>{fields.filter(f => f.required).length}</strong> required
            </span>
            <span style={{ marginLeft: 'auto', color: '#94A3B8' }}>Estimated time: ~{Math.max(1, Math.ceil(nonSectionCount * 0.5))} min</span>
          </div>
        )}

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 258px', gap: '20px', alignItems: 'start' }}>

          {/* Left — field list */}
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
              {fields.length === 0 ? (
                <EmptyFieldsState onAdd={addField} primary={primary} />
              ) : (
                fields.map((f, i) => (
                  <FieldCard key={f.id} field={f} index={i} total={fields.length} primary={primary} allFields={fields}
                    onChange={(p) => updateField(f.id, p)}
                    onRemove={() => removeField(f.id)}
                    onMove={(dir) => moveField(f.id, dir)} />
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {!editingForm && <button onClick={() => setStep('template')} style={backBtnSt}>← Back</button>}
              <button onClick={() => setStep('settings')} disabled={!title.trim() || fields.length === 0}
                style={{ flex: 1, padding: '13px', background: !title.trim() || fields.length === 0 ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: !title.trim() || fields.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {!title.trim() ? 'Add a form title to continue' : fields.length === 0 ? 'Add at least one field to continue' : 'Next — form settings →'}
              </button>
            </div>
          </div>

          {/* Right — sticky sidebar */}
          <div style={{ position: 'sticky', top: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* Waivers — top of sidebar, most prominent */}
            <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', background: '#FEE2E2', borderBottom: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ fontSize: '14px' }}>✍️</span>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Consents & Waivers</span>
              </div>
              <div style={{ padding: '8px' }}>
                {savedWaivers.length === 0 && (
                  <p style={{ fontSize: '11px', color: '#EF4444', margin: '4px 4px 8px', fontStyle: 'italic' }}>No saved waivers yet</p>
                )}
                {savedWaivers.map((w) => (
                  <button key={w.id}
                    onClick={() => setFields((p) => [...p, { id: uid(), type: 'waiver', label: w.title, required: true, waiver_text: w.body }])}
                    title={w.body.slice(0, 120)}
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', width: '100%', padding: '7px 9px', background: '#fff', border: '1px solid #FECACA', borderRadius: '7px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#991B1B' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}>
                    <span style={{ flexShrink: 0 }}>+</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</span>
                  </button>
                ))}
                <button onClick={() => setShowWaiverModal(true)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', padding: '9px', background: '#DC2626', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: '700', color: '#fff' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#B91C1C'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#DC2626'; }}>
                  <Sparkles size={12} /> Create waiver with AI
                </button>
              </div>
            </div>

            {/* Field types */}
            <div style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Add a field</span>
              </div>
              <div style={{ padding: '8px' }}>
                {CANONICAL_GROUPS.map((group) => (
                  <div key={group.label} style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '9px', fontWeight: '800', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px', paddingLeft: '4px' }}>{group.label}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {group.types.map((type) => {
                        const m = FIELD_META[type];
                        return (
                          <button key={type} onClick={() => addField(type)}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%', transition: 'all 0.1s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = m.bg; e.currentTarget.style.borderColor = `${m.color}30`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#F1F5F9'; }}>
                            <span style={{ fontSize: '14px', flexShrink: 0 }}>{m.emoji}</span>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Waiver create modal */}
        {showWaiverModal && (
          <WaiverModal
            club={club} profile={profile} primary={primary}
            wvTemplate={wvTemplate} setWvTemplate={setWvTemplate}
            wvNotes={wvNotes} setWvNotes={setWvNotes}
            wvBody={wvBody} setWvBody={setWvBody}
            wvTitle={wvTitle} setWvTitle={setWvTitle}
            wvMode={wvMode} setWvMode={setWvMode}
            wvGenerating={wvGenerating} wvGenError={wvGenError} wvSaving={wvSaving}
            onGenerate={handleWvGenerate}
            onSaveAndAttach={handleWvSaveAndAttach}
            onClose={() => { setShowWaiverModal(false); resetWaiver(); }}
          />
        )}
      </div>
    );
  }

  // ── STEP 3 — Settings ─────────────────────────────────────────────────────
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';

  return (
    <div style={{ padding: '28px 32px', maxWidth: '820px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <button onClick={() => setStep('build')} style={backBtnSt}>← Back</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Form settings</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '3px 0 0' }}>Team, deadline, fees, and what happens after someone submits</p>
        </div>
        {!editingForm && <StepPills step={step} primary={primary} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Team + capacity + season */}
        <SettingsCard title="Who is this for?" emoji="👥">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelSt}>Team</label>
              <div style={{ position: 'relative' }}>
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ ...inputSt, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}>
                  {isOrgAdmin && <option value="">All teams (club-wide)</option>}
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <ChevronDown size={13} color="#64748B" style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              </div>
            </div>
            <div>
              <label style={labelSt}>Max spots</label>
              <input type="number" min="1" value={maxSpots} onChange={(e) => setMaxSpots(e.target.value)} placeholder="Unlimited" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Season label</label>
              <input value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} placeholder="e.g. 2025/26" style={inputSt} />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <label style={labelSt}>Registration deadline (optional)</label>
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ ...inputSt, maxWidth: '320px' }} />
          </div>
        </SettingsCard>

        {/* Pricing */}
        <SettingsCard title="Registration fee" emoji="💳">
          <Toggle on={isPaid} onChange={setIsPaid} label="This registration has a fee" primary={primary} />
          {isPaid && (
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelSt}>Fee type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {([['flat','💰 Flat fee','Same price for everyone'],['field','📋 Linked to a field','Price based on a dropdown answer'],['tiers','🎚️ Multiple tiers','Parent selects which tier applies']] as [PriceMode, string, string][]).map(([val, lbl, sub]) => (
                    <button key={val} onClick={() => setPriceMode(val)}
                      style={{ padding: '11px', borderRadius: '10px', border: `2px solid ${priceMode === val ? primary : '#E2E8F0'}`, background: priceMode === val ? `${primary}08` : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: priceMode === val ? primary : '#374151', marginBottom: '2px' }}>{lbl}</div>
                      <div style={{ fontSize: '11px', color: '#94A3B8' }}>{sub}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label style={labelSt}>Currency</label>
                  <div style={{ position: 'relative' }}>
                    <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...inputSt, appearance: 'none', paddingRight: '28px', cursor: 'pointer' }}>
                      <option value="GBP">£ GBP</option><option value="USD">$ USD</option><option value="EUR">€ EUR</option>
                    </select>
                    <ChevronDown size={12} color="#64748B" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
                {priceMode === 'flat' ? (
                  <div>
                    <label style={labelSt}>Amount</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#64748B', fontWeight: '700' }}>{sym}</span>
                      <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" style={{ ...inputSt, paddingLeft: '28px' }} />
                    </div>
                  </div>
                ) : <div style={{ paddingTop: '24px', fontSize: '13px', color: '#94A3B8' }}>Configure after creating</div>}
              </div>
              <div>
                <label style={labelSt}>How can parents pay?</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {([['full','Pay in full'],['plan','Payment plan only'],['both','Either — their choice']] as [PaymentOptions, string][]).map(([val, lbl]) => (
                    <button key={val} onClick={() => setPayOpts(val)}
                      style={{ padding: '10px', borderRadius: '10px', border: `2px solid ${payOpts === val ? primary : '#E2E8F0'}`, background: payOpts === val ? `${primary}08` : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: '600', color: payOpts === val ? primary : '#374151' }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              {payOpts !== 'full' && (
                <div style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payment plan settings</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={labelSt}>Number of payments</label>
                      <input type="number" min="2" max="24" value={planInst} onChange={(e) => setPlanInst(e.target.value)} style={inputSt} />
                    </div>
                    <div>
                      <label style={labelSt}>Frequency</label>
                      <div style={{ position: 'relative' }}>
                        <select value={planFreq} onChange={(e) => setPlanFreq(e.target.value as 'monthly'|'weekly')} style={{ ...inputSt, appearance: 'none', paddingRight: '28px', cursor: 'pointer' }}>
                          <option value="monthly">Monthly</option><option value="weekly">Weekly</option>
                        </select>
                        <ChevronDown size={12} color="#64748B" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      </div>
                    </div>
                    <div>
                      <label style={labelSt}>Initial deposit</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#64748B', fontWeight: '700' }}>{sym}</span>
                        <input type="number" min="0" step="0.01" value={planDeposit} onChange={(e) => setPlanDeposit(e.target.value)} placeholder="0.00" style={{ ...inputSt, paddingLeft: '28px' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </SettingsCard>

        {/* Financial aid */}
        <SettingsCard title="Financial assistance" emoji="🤝">
          <Toggle on={financialAid} onChange={setFinancialAid} label="Allow parents to request a fee reduction or waiver" primary={primary} />
          {financialAid && <p style={{ fontSize: '12px', color: '#64748B', margin: '8px 0 0' }}>Requests appear in Submissions for your review. You approve or deny them individually.</p>}
        </SettingsCard>

        {/* Required docs */}
        <SettingsCard title="Required documents" emoji="📎">
          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 12px', lineHeight: '1.5' }}>Add documents parents must upload or submit before their registration is complete. Track them in Submissions.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
            {requiredDocs.map((doc, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px' }}>
                <input value={doc} onChange={(e) => { const n = [...requiredDocs]; n[i] = e.target.value; setRequiredDocs(n); }} placeholder="e.g. Birth certificate" style={{ ...inputSt, flex: 1 }} />
                <button onClick={() => setRequiredDocs((p) => p.filter((_, j) => j !== i))} style={{ padding: '8px 10px', background: '#FEF2F2', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#DC2626', display: 'flex' }}><X size={14} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setRequiredDocs((p) => [...p, ''])} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={12} /> Add document
          </button>
        </SettingsCard>

        {/* After submission */}
        <SettingsCard title="After someone submits" emoji="✅">
          <div style={{ marginBottom: '14px' }}>
            <label style={labelSt}>Confirmation message shown to parents</label>
            <textarea value={confMsg} onChange={(e) => setConfMsg(e.target.value)} rows={3} style={{ ...inputSt, resize: 'vertical' }} />
          </div>
          <Toggle on={sendEmail} onChange={setSendEmail} label="Also send this as a confirmation email" primary={primary} />
        </SettingsCard>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#DC2626' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setStep('build')} style={backBtnSt}>← Back</button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 1, padding: '14px', background: saving ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? (editingForm ? 'Saving…' : 'Creating form…') : editingForm ? 'Save changes' : '✓ Create form (saved as draft)'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step pills ────────────────────────────────────────────────────────────────

function StepPills({ step, primary }: { step: 'template' | 'build' | 'settings'; primary: string }) {
  const STEPS = [
    { id: 'template', label: 'Template' },
    { id: 'build',    label: 'Fields' },
    { id: 'settings', label: 'Settings' },
  ] as const;
  const idx = STEPS.findIndex(s => s.id === step);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {STEPS.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '20px', background: step === s.id ? primary : idx > i ? '#DCFCE7' : '#F1F5F9' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: step === s.id ? 'rgba(255,255,255,0.3)' : idx > i ? '#16A34A' : '#CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '800', color: step === s.id ? '#fff' : idx > i ? '#fff' : '#94A3B8', flexShrink: 0 }}>
              {idx > i ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: '11px', fontWeight: '700', color: step === s.id ? '#fff' : idx > i ? '#15803D' : '#94A3B8', whiteSpace: 'nowrap' }}>{s.label}</span>
          </div>
          {i < 2 && <div style={{ width: '16px', height: '2px', background: idx > i ? '#86EFAC' : '#E2E8F0' }} />}
        </div>
      ))}
    </div>
  );
}

// ── Settings card wrapper ─────────────────────────────────────────────────────

function SettingsCard({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '8px', background: '#FAFAFA' }}>
        <span style={{ fontSize: '16px' }}>{emoji}</span>
        <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{title}</span>
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ on, onChange, label, primary }: { on: boolean; onChange: (v: boolean) => void; label: string; primary: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
      <div onClick={() => onChange(!on)}
        style={{ width: '42px', height: '24px', borderRadius: '12px', background: on ? primary : '#CBD5E1', position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'background 0.2s' }}>
        <div style={{ position: 'absolute', top: '3px', left: on ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
      </div>
      <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>{label}</span>
    </label>
  );
}

// ── Empty fields state ────────────────────────────────────────────────────────

function EmptyFieldsState({ onAdd, primary }: { onAdd: (t: FieldType) => void; primary: string }) {
  const QUICK: { type: FieldType; label: string }[] = [
    { type: 'text',    label: '✏️ Short answer' },
    { type: 'email',   label: '📧 Email' },
    { type: 'select',  label: '🔽 Dropdown' },
    { type: 'waiver',  label: '✍️ Consent' },
    { type: 'section', label: '📂 Section' },
  ];
  return (
    <div style={{ border: '2px dashed #E2E8F0', borderRadius: '14px', padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
      <div style={{ fontSize: '15px', fontWeight: '700', color: '#64748B', marginBottom: '6px' }}>No fields yet</div>
      <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '20px' }}>Add fields from the panel on the right, or use a quick-add:</div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {QUICK.map(q => (
          <button key={q.type} onClick={() => onAdd(q.type)}
            style={{ padding: '8px 14px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = primary; e.currentTarget.style.color = primary; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#374151'; }}>
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Field card ────────────────────────────────────────────────────────────────

function FieldCard({ field: f, index, total, primary, allFields, onChange, onRemove, onMove }: {
  field: FieldDef; index: number; total: number; primary: string; allFields: FieldDef[];
  onChange: (p: Partial<FieldDef>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const meta = FIELD_META[f.type] ?? FIELD_META.text;
  const isSection    = f.type === 'section';
  const needsOptions = ['select', 'radio', 'multiselect'].includes(f.type);
  const isWaiver     = f.type === 'waiver';
  const isFile       = f.type === 'file';
  const isVolunteer  = f.type === 'volunteer';
  const hasLogic     = (f.logic?.showIf?.length ?? 0) > 0;
  const logicCandidates = allFields.filter((x) => x.id !== f.id && ['select', 'radio', 'multiselect', 'text', 'email', 'phone'].includes(x.type));

  if (isSection) {
    return (
      <div style={{ background: `${meta.color}12`, border: `1.5px solid ${meta.color}30`, borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', opacity: 0.5 }}>
          <button onClick={() => onMove(-1)} disabled={index === 0} style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '1px', color: meta.color, display: 'flex', opacity: index === 0 ? 0.3 : 1 }}>▲</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', padding: '1px', color: meta.color, display: 'flex', opacity: index === total - 1 ? 0.3 : 1 }}>▼</button>
        </div>
        <span style={{ fontSize: '12px' }}>📂</span>
        <input value={f.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="Section name"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '13px', fontWeight: '800', color: meta.color, fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.5px' }} />
        <span style={{ fontSize: '10px', color: `${meta.color}80`, fontWeight: '600' }}>SECTION</span>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: `${meta.color}60`, display: 'flex', padding: '2px' }}><X size={13} /></button>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: `1.5px solid ${hasLogic ? '#C4B5FD' : '#E2E8F0'}`, borderRadius: '12px', overflow: 'hidden' }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px' }}>
        {/* Reorder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
          <button onClick={() => onMove(-1)} disabled={index === 0}
            style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '2px', color: index === 0 ? '#E2E8F0' : '#CBD5E1', display: 'flex', fontSize: '10px' }}>▲</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1}
            style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', padding: '2px', color: index === total - 1 ? '#E2E8F0' : '#CBD5E1', display: 'flex', fontSize: '10px' }}>▼</button>
        </div>

        {/* Type icon */}
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
          {meta.emoji}
        </div>

        {/* Label + type name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <input value={f.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="Question label"
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '14px', fontWeight: '600', color: '#0F172A', fontFamily: 'inherit', background: 'transparent', marginBottom: '1px' }} />
          <div style={{ fontSize: '11px', color: meta.color, fontWeight: '600' }}>{meta.label}</div>
        </div>

        {/* Required toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flexShrink: 0 }}>
          <div onClick={() => onChange({ required: !f.required })}
            style={{ width: '30px', height: '17px', borderRadius: '9px', background: f.required ? primary : '#CBD5E1', position: 'relative', cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: '2px', left: f.required ? '14px' : '2px', width: '13px', height: '13px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
          </div>
          <span style={{ fontSize: '11px', fontWeight: '600', color: f.required ? '#374151' : '#94A3B8', whiteSpace: 'nowrap' }}>Required</span>
        </label>

        {/* Advanced / delete */}
        {(logicCandidates.length > 0 || f.description !== undefined) && (
          <button onClick={() => setShowAdvanced(s => !s)} title="Advanced options"
            style={{ background: showAdvanced ? '#F1F5F9' : 'none', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '5px', color: hasLogic ? '#7C3AED' : '#CBD5E1', display: 'flex', flexShrink: 0 }}>
            <Settings2 size={14} />
          </button>
        )}
        <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', color: '#E2E8F0', display: 'flex', flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#DC2626'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#E2E8F0'; }}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Expanded detail area */}
      {(needsOptions || isWaiver || isFile || isVolunteer || showAdvanced) && (
        <div style={{ borderTop: '1px solid #F1F5F9', padding: '12px 14px 14px', paddingLeft: '70px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* Options */}
          {needsOptions && (
            <div>
              <label style={{ fontSize: '11px', color: '#64748B', fontWeight: '600', display: 'block', marginBottom: '5px' }}>Options — type each choice, separated by commas</label>
              <input value={f.options ?? ''} onChange={(e) => onChange({ options: e.target.value })} placeholder="e.g. Goalkeeper, Defender, Midfielder, Forward"
                style={{ width: '100%', border: '1.5px solid #E2E8F0', outline: 'none', fontSize: '13px', fontFamily: 'inherit', background: '#F8FAFC', borderRadius: '8px', padding: '8px 11px', boxSizing: 'border-box' }} />
              {f.options && (
                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {f.options.split(',').map(o => o.trim()).filter(Boolean).map((o, i) => (
                    <span key={i} style={{ fontSize: '11px', background: meta.bg, color: meta.color, borderRadius: '5px', padding: '2px 7px', fontWeight: '600' }}>{o}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Waiver text */}
          {isWaiver && (
            <div>
              <label style={{ fontSize: '11px', color: '#DC2626', fontWeight: '700', display: 'block', marginBottom: '5px' }}>Consent text parents must read and agree to</label>
              <textarea value={f.waiver_text ?? ''} onChange={(e) => onChange({ waiver_text: e.target.value })} placeholder="Type the full consent wording here…" rows={3}
                style={{ width: '100%', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '8px', padding: '9px 11px', fontSize: '13px', color: '#374151', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          )}

          {/* File type */}
          {isFile && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '600' }}>Accept:</span>
              {[['image/*,.pdf','📸 Images & PDF'],['image/*','📸 Images only'],['.pdf','📄 PDF only']].map(([val, lbl]) => (
                <button key={val} onClick={() => onChange({ accept: val })}
                  style={{ padding: '5px 10px', borderRadius: '6px', border: `1.5px solid ${f.accept === val ? meta.color : '#E2E8F0'}`, background: f.accept === val ? meta.bg : '#F8FAFC', color: f.accept === val ? meta.color : '#64748B', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {lbl}
                </button>
              ))}
            </div>
          )}

          {/* Volunteer slots */}
          {isVolunteer && (
            <div>
              <label style={{ fontSize: '11px', color: '#0F766E', fontWeight: '700', display: 'block', marginBottom: '5px' }}>Volunteer slots — one per line</label>
              <textarea value={f.volunteer_slots ?? ''} onChange={(e) => onChange({ volunteer_slots: e.target.value })} rows={3}
                placeholder={'Canteen duty — 14 Sept\nField setup — 21 Sept\nKit washing — weekly'}
                style={{ width: '100%', background: '#F0FDFA', border: '1.5px solid #CCFBF1', borderRadius: '8px', padding: '9px 11px', fontSize: '13px', color: '#374151', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          )}

          {/* Advanced: helper text + conditional logic */}
          {showAdvanced && (
            <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#64748B', fontWeight: '600', display: 'block', marginBottom: '5px' }}>Helper text shown below this question (optional)</label>
                <input value={f.description ?? ''} onChange={(e) => onChange({ description: e.target.value })} placeholder="Extra instructions for parents…"
                  style={{ width: '100%', border: '1.5px solid #E2E8F0', outline: 'none', fontSize: '13px', fontFamily: 'inherit', background: '#F8FAFC', borderRadius: '8px', padding: '8px 11px', boxSizing: 'border-box' }} />
              </div>

              {logicCandidates.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', color: '#7C3AED', fontWeight: '700', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>🔀</span> Show this field only if… {hasLogic && <span style={{ background: '#EDE9FE', borderRadius: '4px', padding: '1px 6px' }}>{f.logic!.showIf.length} rule{f.logic!.showIf.length !== 1 ? 's' : ''} active</span>}
                  </div>
                  <div style={{ background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(f.logic?.showIf ?? []).map((rule, ri) => (
                      <div key={ri} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select value={rule.fieldId} onChange={(e) => {
                          const u = [...(f.logic?.showIf ?? [])]; u[ri] = { ...u[ri], fieldId: e.target.value };
                          onChange({ logic: { showIf: u } });
                        }} style={{ flex: 1, minWidth: '120px', padding: '6px 8px', border: '1px solid #DDD6FE', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', background: '#fff', outline: 'none' }}>
                          <option value="">— pick a question —</option>
                          {logicCandidates.map((lc) => <option key={lc.id} value={lc.id}>{lc.label}</option>)}
                        </select>
                        <select value={rule.operator} onChange={(e) => {
                          const u = [...(f.logic?.showIf ?? [])]; u[ri] = { ...u[ri], operator: e.target.value as 'equals'|'not_equals'|'contains' };
                          onChange({ logic: { showIf: u } });
                        }} style={{ padding: '6px 8px', border: '1px solid #DDD6FE', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', background: '#fff', outline: 'none' }}>
                          <option value="equals">equals</option>
                          <option value="not_equals">does not equal</option>
                          <option value="contains">contains</option>
                        </select>
                        <input value={rule.value} onChange={(e) => {
                          const u = [...(f.logic?.showIf ?? [])]; u[ri] = { ...u[ri], value: e.target.value };
                          onChange({ logic: { showIf: u } });
                        }} placeholder="answer value" style={{ flex: 1, minWidth: '80px', padding: '6px 8px', border: '1px solid #DDD6FE', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', outline: 'none' }} />
                        <button onClick={() => {
                          const u = (f.logic?.showIf ?? []).filter((_, j) => j !== ri);
                          onChange({ logic: u.length ? { showIf: u } : undefined });
                        }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A78BFA', display: 'flex', padding: '4px' }}><X size={13} /></button>
                      </div>
                    ))}
                    <button onClick={() => {
                      const u = [...(f.logic?.showIf ?? []), { fieldId: '', operator: 'equals' as const, value: '' }];
                      onChange({ logic: { showIf: u } });
                    }} style={{ fontSize: '12px', color: '#7C3AED', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}>
                      <Plus size={11} /> Add condition
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Waiver modal ──────────────────────────────────────────────────────────────

function WaiverModal({ club, profile, primary, wvTemplate, setWvTemplate, wvNotes, setWvNotes, wvBody, setWvBody, wvTitle, setWvTitle, wvMode, setWvMode, wvGenerating, wvGenError, wvSaving, onGenerate, onSaveAndAttach, onClose }: {
  club: { name: string } | null; profile: { id: string } | null; primary: string;
  wvTemplate: string | null; setWvTemplate: (v: string) => void;
  wvNotes: string; setWvNotes: (v: string) => void;
  wvBody: string; setWvBody: (v: string) => void;
  wvTitle: string; setWvTitle: (v: string) => void;
  wvMode: 'preview'|'edit'; setWvMode: (v: 'preview'|'edit') => void;
  wvGenerating: boolean; wvGenError: string; wvSaving: boolean;
  onGenerate: () => void; onSaveAndAttach: () => void; onClose: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.28)' }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: 0 }}>✍️ Create a consent / waiver</h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '3px 0 0' }}>AI writes it for you — saves to your Waivers library and attaches to this form</p>
          </div>
          <button onClick={onClose} style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex', color: '#64748B' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>What type of waiver?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {WAIVER_TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => setWvTemplate(t.id)}
                  style={{ border: `2px solid ${wvTemplate === t.id ? primary : '#E2E8F0'}`, borderRadius: '10px', padding: '12px', background: wvTemplate === t.id ? `${primary}0D` : '#FAFAFA', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  <div style={{ fontSize: '20px', marginBottom: '6px' }}>{t.emoji}</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: wvTemplate === t.id ? primary : '#0F172A', marginBottom: '2px' }}>{t.label}</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelSt}>Any specific details to include? (optional)</label>
            <textarea value={wvNotes} onChange={(e) => setWvNotes(e.target.value)} rows={2} placeholder="e.g. away travel, overnight stay, specific dates…"
              style={{ width: '100%', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button onClick={onGenerate} disabled={!wvTemplate || wvGenerating}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: !wvTemplate || wvGenerating ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 20px', fontSize: '14px', fontWeight: '700', cursor: !wvTemplate || wvGenerating ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {wvGenerating ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Writing waiver…</> : wvBody ? <><RefreshCw size={14} /> Rewrite</> : <><Sparkles size={14} /> Generate with AI</>}
          </button>
          {wvGenError && <p style={{ fontSize: '12px', color: '#DC2626', margin: '-8px 0 0' }}>{wvGenError}</p>}
          {wvBody && (
            <>
              <div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                  {(['preview', 'edit'] as const).map((m) => (
                    <button key={m} onClick={() => setWvMode(m)} style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: wvMode === m ? '#0F172A' : '#F1F5F9', color: wvMode === m ? '#fff' : '#64748B', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>{m === 'preview' ? '👁 Preview' : '✏️ Edit text'}</button>
                  ))}
                </div>
                {wvMode === 'preview' ? (
                  <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ background: primary, padding: '14px 18px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>{club?.name ?? 'Your Club'}</span>
                    </div>
                    <div style={{ background: '#F8FAFC', padding: '18px', maxHeight: '220px', overflowY: 'auto' }}>
                      <h2 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: '0 0 10px' }}>{wvTitle || 'Untitled waiver'}</h2>
                      <hr style={{ border: 'none', borderTop: '1.5px solid #E2E8F0', margin: '0 0 12px' }} />
                      <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.8', whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif', margin: 0 }}>{wvBody}</p>
                    </div>
                  </div>
                ) : (
                  <textarea value={wvBody} onChange={(e) => setWvBody(e.target.value)} rows={8}
                    style={{ width: '100%', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                )}
              </div>
              <div>
                <label style={labelSt}>Waiver title (shown to parents)</label>
                <input value={wvTitle} onChange={(e) => setWvTitle(e.target.value)} placeholder="e.g. Season Participation Waiver 2025/26"
                  style={{ width: '100%', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px', fontSize: '14px', fontWeight: '600', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={onClose} style={{ padding: '12px 18px', background: '#F1F5F9', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={onSaveAndAttach} disabled={!wvBody.trim() || !wvTitle.trim() || wvSaving}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: !wvBody.trim() || !wvTitle.trim() || wvSaving ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: !wvBody.trim() || !wvTitle.trim() || wvSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              <FileText size={14} /> {wvSaving ? 'Saving…' : 'Save & add to form'}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
