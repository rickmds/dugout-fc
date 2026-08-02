'use client';

import { useEffect, useState } from 'react';
import {
  ChevronDown, ChevronUp, X, Plus, RefreshCw, Sparkles, FileText, Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import {
  FIELD_COLORS, FIELD_TYPE_LABELS, FIELD_CHIP, FIELD_GROUPS, SIDEBAR_BTN_LABELS,
  WAIVER_TEMPLATES, labelSt, inputSt, backBtnSt, uid,
} from './shared';
import type { RegForm, FieldDef, FieldType, PriceMode, PaymentOptions } from './shared';

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
    label: 'Blank form', icon: '📄', desc: 'Start from scratch with your own fields',
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
  const [step, setStep]               = useState<Step>(editingForm ? 'build' : 'template');
  const [templateKey, setTemplateKey] = useState<TplKey | null>(null);
  const [title, setTitle]             = useState(editingForm?.title ?? '');
  const [description, setDescription] = useState(editingForm?.description ?? '');
  const [teamId, setTeamId]           = useState(editingForm?.team_id ?? teams[0]?.id ?? '');
  const [deadline, setDeadline]       = useState(editingForm?.deadline?.slice(0, 16) ?? '');
  const [maxSpots, setMaxSpots]       = useState(editingForm?.max_spots?.toString() ?? '');
  const [seasonLabel, setSeasonLabel] = useState(editingForm?.season_label ?? '');
  const [confMsg, setConfMsg]         = useState(editingForm?.confirmation_message ?? "Thank you for registering! We'll be in touch shortly.");
  const [sendEmail, setSendEmail]     = useState(editingForm?.send_confirmation_email ?? true);
  const [fields, setFields]           = useState<FieldDef[]>(editingForm ? (Array.isArray(editingForm.fields) ? editingForm.fields as FieldDef[] : []) : []);
  const [financialAid, setFinancialAid] = useState(editingForm?.financial_aid_enabled ?? false);
  const [requiredDocs, setRequiredDocs] = useState<string[]>(
    Array.isArray(editingForm?.required_docs) ? (editingForm.required_docs as string[]) : []
  );

  // Pricing
  const [isPaid, setIsPaid]           = useState(!!editingForm?.price || !!editingForm?.price_mode);
  const [priceMode, setPriceMode]     = useState<PriceMode>(editingForm?.price_mode ?? 'flat');
  const [price, setPrice]             = useState(editingForm?.price?.toString() ?? '');
  const [currency, setCurrency]       = useState(editingForm?.currency ?? 'GBP');
  const [payOpts, setPayOpts]         = useState<PaymentOptions>(editingForm?.payment_options ?? 'both');
  const [planInst, setPlanInst]       = useState(editingForm?.plan_installments?.toString() ?? '3');
  const [planFreq, setPlanFreq]       = useState<'monthly'|'weekly'>(editingForm?.plan_frequency ?? 'monthly');
  const [planDeposit, setPlanDeposit] = useState(editingForm?.plan_deposit?.toString() ?? '');

  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  // Saved waivers
  const [savedWaivers, setSavedWaivers] = useState<{ id: string; title: string; body: string }[]>([]);

  // Waiver create modal
  const [showWaiverModal, setShowWaiverModal] = useState(false);
  const [wvTemplate, setWvTemplate]   = useState<string | null>(null);
  const [wvNotes, setWvNotes]         = useState('');
  const [wvBody, setWvBody]           = useState('');
  const [wvTitle, setWvTitle]         = useState('');
  const [wvMode, setWvMode]           = useState<'preview'|'edit'>('preview');
  const [wvGenerating, setWvGenerating] = useState(false);
  const [wvGenError, setWvGenError]   = useState('');
  const [wvSaving, setWvSaving]       = useState(false);

  useEffect(() => {
    if (!club) return;
    supabase.from('waivers').select('id, title, body').eq('club_id', club.id).order('created_at', { ascending: false })
      .then(({ data }) => setSavedWaivers(data ?? []));
  }, [club?.id]);

  function addField(type: FieldType) {
    setFields((p) => [...p, { id: uid(), type, label: FIELD_TYPE_LABELS[type], required: false }]);
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

  function resetWaiverModal() {
    setWvTemplate(null); setWvNotes(''); setWvBody(''); setWvTitle(''); setWvMode('preview'); setWvGenError('');
  }

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
    setWvSaving(true); setWvGenError('');
    const { data: w, error: e } = await supabase
      .from('waivers').insert({ club_id: club.id, title: wvTitle.trim(), body: wvBody.trim(), created_by: profile?.id })
      .select('id, title, body').single();
    if (e || !w) { setWvGenError('Failed to save. Try again.'); setWvSaving(false); return; }
    setSavedWaivers((prev) => [w, ...prev]);
    setFields((prev) => [...prev, { id: uid(), type: 'waiver', label: w.title, required: true, waiver_text: w.body }]);
    setShowWaiverModal(false); resetWaiverModal(); setWvSaving(false);
  }

  async function handleSave() {
    if (!title.trim() || !club) return;
    setSaving(true); setError('');

    const payload = {
      club_id: club.id,
      team_id: teamId || null,
      title: title.trim(),
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

    let err: unknown = null;
    if (editingForm) {
      const { error: e } = await supabase.from('registration_forms').update(payload).eq('id', editingForm.id);
      err = e;
    } else {
      const { error: e } = await supabase.from('registration_forms').insert({ ...payload, status: 'draft' });
      err = e;
    }

    setSaving(false);
    if (err) { setError((err as { message: string }).message); return; }
    onDone();
  }

  // ── STEP 1 — Template ─────────────────────────────────────────────────────
  if (step === 'template') {
    return (
      <div style={{ padding: '28px 32px', maxWidth: '820px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <button onClick={onCancel} style={backBtnSt}>← Cancel</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: 0 }}>New registration form</h1>
          </div>
          <StepIndicator step={step} primary={primary} />
        </div>

        <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Choose a template</h2>
        <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px' }}>Start with a ready-made set of fields, or build from scratch.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '28px' }}>
          {(Object.entries(TEMPLATES) as [TplKey, typeof TEMPLATES[TplKey]][]).map(([key, t]) => (
            <button key={key} onClick={() => setTemplateKey(key)}
              style={{ background: templateKey === key ? `${primary}08` : '#fff', border: `2px solid ${templateKey === key ? primary : '#E2E8F0'}`, borderRadius: '14px', padding: '20px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' } as React.CSSProperties}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>{t.icon}</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>{t.label}</div>
              <div style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>{t.desc}</div>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '10px' }}>{t.fields.length} fields</div>
            </button>
          ))}
        </div>

        <button onClick={() => {
          if (!templateKey) return;
          const tpl = TEMPLATES[templateKey];
          setTitle(templateKey === 'blank' ? '' : tpl.label);
          setFields(makeFields(tpl.fields));
          setStep('build');
        }} disabled={!templateKey}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: templateKey ? primary : '#CBD5E1', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px 24px', fontWeight: '700', fontSize: '14px', cursor: templateKey ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          Use this template → Customise fields
        </button>
      </div>
    );
  }

  // ── STEP 2 — Build fields ─────────────────────────────────────────────────
  if (step === 'build') {
    return (
      <div style={{ padding: '28px 32px', maxWidth: '1100px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <button onClick={() => { if (editingForm) onCancel(); else setStep('template'); }} style={backBtnSt}>
            ← {editingForm ? 'Cancel' : 'Back'}
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: 0 }}>
              {editingForm ? 'Edit form' : 'Build your form'}
            </h1>
          </div>
          {!editingForm && <StepIndicator step={step} primary={primary} />}
        </div>

        {/* Title + description */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
          <div>
            <label style={labelSt}>Form title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fall 2025 Season Registration" style={{ ...inputSt, fontSize: '15px', fontWeight: '600' }} />
          </div>
          <div>
            <label style={labelSt}>Description shown to parents</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional brief description" style={inputSt} />
          </div>
        </div>

        {/* Two-column */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 210px', gap: '20px', alignItems: 'start' }}>
          {/* Field list */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Form fields</h3>
              <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600' }}>{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
              {fields.map((f, i) => (
                <FieldEditor key={f.id} field={f} index={i} total={fields.length} primary={primary} allFields={fields}
                  onChange={(p) => updateField(f.id, p)}
                  onRemove={() => removeField(f.id)}
                  onMove={(dir) => moveField(f.id, dir)} />
              ))}
              {fields.length === 0 && (
                <div style={{ border: '2px dashed #E2E8F0', borderRadius: '12px', padding: '48px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '10px' }}>📋</div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#94A3B8', marginBottom: '4px' }}>No fields yet</div>
                  <div style={{ fontSize: '12px', color: '#CBD5E1' }}>Click a field type on the right to add it</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {!editingForm && <button onClick={() => setStep('template')} style={backBtnSt}>← Back</button>}
              <button onClick={() => editingForm ? setStep('settings') : setStep('settings')}
                disabled={!title.trim() || fields.length === 0}
                style={{ flex: 1, padding: '13px', background: !title.trim() || fields.length === 0 ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: !title.trim() || fields.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                Next → Form settings
              </button>
            </div>
          </div>

          {/* Sticky sidebar */}
          <div style={{ position: 'sticky', top: '24px' }}>
            <div style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '12px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Add a field</div>
              </div>
              <div style={{ padding: '10px 10px 14px' }}>
                {FIELD_GROUPS.map((group) => (
                  <div key={group.label} style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '9px', fontWeight: '800', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '5px', paddingLeft: '4px' }}>{group.label}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {group.types.map((type) => {
                        const c = FIELD_COLORS[type];
                        return (
                          <button key={type} onClick={() => addField(type)}
                            style={{ display: 'flex', alignItems: 'center', gap: '7px', background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '7px', padding: '7px 10px', fontSize: '12px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}
                            onMouseEnter={(e) => { const el = e.currentTarget; el.style.background = c.bg; el.style.color = c.color; el.style.borderColor = `${c.color}40`; }}
                            onMouseLeave={(e) => { const el = e.currentTarget; el.style.background = '#F8FAFC'; el.style.color = '#374151'; el.style.borderColor = '#F1F5F9'; }}>
                            <span style={{ fontSize: '11px', color: c.color, fontWeight: '900' }}>+</span>
                            {SIDEBAR_BTN_LABELS[type]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Saved waivers */}
                <div>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '5px', paddingLeft: '4px' }}>Waivers</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {savedWaivers.map((w) => (
                      <button key={w.id}
                        onClick={() => setFields((p) => [...p, { id: uid(), type: 'waiver', label: w.title, required: true, waiver_text: w.body }])}
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '7px', padding: '7px 10px', fontSize: '12px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}
                        onMouseEnter={(e) => { const el = e.currentTarget; el.style.background = '#FEF2F2'; el.style.color = '#DC2626'; }}
                        onMouseLeave={(e) => { const el = e.currentTarget; el.style.background = '#F8FAFC'; el.style.color = '#374151'; }}
                        title={w.body.slice(0, 120)}>
                        <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: '900' }}>+</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</span>
                      </button>
                    ))}
                    {savedWaivers.length === 0 && <p style={{ fontSize: '11px', color: '#CBD5E1', margin: '0 0 4px 4px' }}>No saved waivers yet</p>}
                    <button onClick={() => setShowWaiverModal(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: '7px', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '7px', padding: '7px 10px', fontSize: '12px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}
                      onMouseEnter={(e) => { const el = e.currentTarget; el.style.background = '#FEF2F2'; el.style.color = '#DC2626'; el.style.borderColor = '#DC2626'; }}
                      onMouseLeave={(e) => { const el = e.currentTarget; el.style.background = '#F8FAFC'; el.style.color = '#64748B'; el.style.borderColor = '#CBD5E1'; }}>
                      <Sparkles size={11} /> Create new waiver
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Waiver create modal */}
        {showWaiverModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.28)' }}>
              <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Create a waiver</h2>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 0' }}>Saves to your Waivers library and attaches here.</p>
                </div>
                <button onClick={() => { setShowWaiverModal(false); resetWaiverModal(); }} style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex', color: '#64748B' }}><X size={16} /></button>
              </div>
              <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Template</div>
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
                  <label style={labelSt}>Notes for AI (optional)</label>
                  <textarea value={wvNotes} onChange={(e) => setWvNotes(e.target.value)} rows={2} style={{ width: '100%', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} placeholder="Specific requirements, clauses, or dates to include…" />
                </div>
                <button onClick={handleWvGenerate} disabled={!wvTemplate || wvGenerating}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: !wvTemplate || wvGenerating ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 20px', fontSize: '14px', fontWeight: '700', cursor: !wvTemplate || wvGenerating ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {wvGenerating ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : wvBody ? <><RefreshCw size={14} /> Regenerate</> : <><Sparkles size={14} /> Generate with AI</>}
                </button>
                {wvGenError && <p style={{ fontSize: '12px', color: '#DC2626', margin: '-12px 0 0' }}>{wvGenError}</p>}
                {wvBody && (
                  <>
                    <div>
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                        {(['preview', 'edit'] as const).map((m) => (
                          <button key={m} onClick={() => setWvMode(m)} style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: wvMode === m ? '#0F172A' : '#F1F5F9', color: wvMode === m ? '#fff' : '#64748B', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>{m === 'preview' ? 'Preview' : 'Edit text'}</button>
                        ))}
                      </div>
                      {wvMode === 'preview' ? (
                        <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                          <div style={{ background: primary, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>{club?.name ?? 'Your Club'}</span>
                          </div>
                          <div style={{ background: '#F8FAFC', padding: '20px', maxHeight: '240px', overflowY: 'auto' }}>
                            <h2 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: '0 0 12px' }}>{wvTitle || 'Untitled'}</h2>
                            <div style={{ borderBottom: '1.5px solid #E2E8F0', marginBottom: '14px' }} />
                            <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.8', whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif', margin: 0 }}>{wvBody}</p>
                          </div>
                        </div>
                      ) : (
                        <textarea value={wvBody} onChange={(e) => setWvBody(e.target.value)} rows={8}
                          style={{ width: '100%', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                      )}
                    </div>
                    <div>
                      <label style={labelSt}>Waiver title</label>
                      <input value={wvTitle} onChange={(e) => setWvTitle(e.target.value)} placeholder="e.g. Season Participation Waiver 2025/26"
                        style={{ width: '100%', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px', fontSize: '14px', fontWeight: '600', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setShowWaiverModal(false); resetWaiverModal(); }} style={{ padding: '12px 18px', background: '#F1F5F9', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={handleWvSaveAndAttach} disabled={!wvBody.trim() || !wvTitle.trim() || wvSaving}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: !wvBody.trim() || !wvTitle.trim() || wvSaving ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: !wvBody.trim() || !wvTitle.trim() || wvSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    <FileText size={14} /> {wvSaving ? 'Saving…' : 'Save & attach'}
                  </button>
                </div>
              </div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
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
        </div>
        {!editingForm && <StepIndicator step={step} primary={primary} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Team + capacity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
          <div>
            <label style={labelSt}>Team</label>
            <div style={{ position: 'relative' }}>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ ...inputSt, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}>
                {isOrgAdmin && <option value="">All teams (club-wide)</option>}
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </div>
          <div>
            <label style={labelSt}>Max spots (blank = unlimited)</label>
            <input type="number" min="1" value={maxSpots} onChange={(e) => setMaxSpots(e.target.value)} placeholder="e.g. 25" style={inputSt} />
          </div>
          <div>
            <label style={labelSt}>Season label</label>
            <input value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} placeholder="e.g. 2025/26" style={inputSt} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <label style={labelSt}>Registration deadline (optional)</label>
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={inputSt} />
          </div>
        </div>

        {/* Financial aid */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '14px 16px', cursor: 'pointer' }}>
          <input type="checkbox" checked={financialAid} onChange={(e) => setFinancialAid(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: primary } as React.CSSProperties} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A' }}>Enable financial assistance requests</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>Parents can request fee waivers or discounts. Requests appear in Payments tab for your review.</div>
          </div>
        </label>

        {/* Required docs */}
        <div>
          <label style={labelSt}>Required documents</label>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '-2px 0 10px' }}>Parents must submit these documents. Track completion in Submissions.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
            {requiredDocs.map((doc, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px' }}>
                <input value={doc} onChange={(e) => { const n = [...requiredDocs]; n[i] = e.target.value; setRequiredDocs(n); }} placeholder="e.g. Birth certificate" style={{ ...inputSt, flex: 1 }} />
                <button onClick={() => setRequiredDocs((p) => p.filter((_, j) => j !== i))} style={{ padding: '8px', background: '#FEF2F2', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#DC2626', display: 'flex' }}><X size={14} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setRequiredDocs((p) => [...p, ''])} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={12} /> Add required document
          </button>
        </div>

        {/* Pricing */}
        <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 18px', cursor: 'pointer', background: isPaid ? '#F0FDF4' : '#F8FAFC', borderBottom: isPaid ? '1px solid #D1FAE5' : 'none' }}>
            <div style={{ width: '40px', height: '22px', borderRadius: '11px', background: isPaid ? primary : '#CBD5E1', position: 'relative', flexShrink: 0, cursor: 'pointer' }} onClick={() => setIsPaid((p) => !p)}>
              <div style={{ position: 'absolute', top: '2px', left: isPaid ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>This registration has a fee</div>
              <div style={{ fontSize: '12px', color: '#64748B' }}>Set a price and payment options</div>
            </div>
          </label>
          {isPaid && (
            <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {([['flat','Flat fee','Everyone pays the same'],['field','Field-linked','Price from a dropdown'],['tiers','Manual tiers','Parent selects tier']] as [PriceMode, string, string][]).map(([val, lbl, sub]) => (
                  <button key={val} onClick={() => setPriceMode(val)}
                    style={{ padding: '12px', borderRadius: '10px', border: `2px solid ${priceMode === val ? primary : '#E2E8F0'}`, background: priceMode === val ? `${primary}08` : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: priceMode === val ? primary : '#374151' }}>{lbl}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>{sub}</div>
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label style={labelSt}>Currency</label>
                  <div style={{ position: 'relative' }}>
                    <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...inputSt, appearance: 'none', paddingRight: '28px', cursor: 'pointer' }}>
                      <option value="GBP">£ GBP</option><option value="USD">$ USD</option><option value="EUR">€ EUR</option>
                    </select>
                    <ChevronDown size={12} color="#64748B" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
                {priceMode === 'flat' && (
                  <div>
                    <label style={labelSt}>Total fee</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#64748B', fontWeight: '600' }}>{sym}</span>
                      <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" style={{ ...inputSt, paddingLeft: '28px' }} />
                    </div>
                  </div>
                )}
                {(priceMode === 'field' || priceMode === 'tiers') && <div><label style={labelSt}>Pricing configured</label><div style={{ fontSize: '13px', color: '#64748B', paddingTop: '10px' }}>Set up after creating the form</div></div>}
              </div>
              <div>
                <label style={labelSt}>Payment options</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {([['full','Full payment only'],['plan','Payment plan only'],['both','Full or plan']] as [PaymentOptions, string][]).map(([val, lbl]) => (
                    <button key={val} onClick={() => setPayOpts(val)}
                      style={{ padding: '10px', borderRadius: '10px', border: `2px solid ${payOpts === val ? primary : '#E2E8F0'}`, background: payOpts === val ? `${primary}08` : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: '600', color: payOpts === val ? primary : '#374151' }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              {payOpts !== 'full' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelSt}>Installments</label>
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
                      <span style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#64748B', fontWeight: '600' }}>{sym}</span>
                      <input type="number" min="0" step="0.01" value={planDeposit} onChange={(e) => setPlanDeposit(e.target.value)} placeholder="0.00" style={{ ...inputSt, paddingLeft: '28px' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirmation */}
        <div>
          <label style={labelSt}>Confirmation message shown after submission</label>
          <textarea value={confMsg} onChange={(e) => setConfMsg(e.target.value)} rows={3} style={{ ...inputSt, resize: 'vertical' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '14px 16px', cursor: 'pointer' }}>
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: primary } as React.CSSProperties} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A' }}>Send confirmation email to parents</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>Auto-email the confirmation message above after each submission</div>
          </div>
        </label>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#DC2626' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setStep('build')} style={backBtnSt}>← Back</button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 1, padding: '13px', background: saving ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? (editingForm ? 'Saving…' : 'Creating…') : editingForm ? 'Save changes' : 'Create form (draft)'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step, primary }: { step: 'template' | 'build' | 'settings'; primary: string }) {
  const STEPS = ['template', 'build', 'settings'] as const;
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: step === s ? primary : STEPS.indexOf(step) > i ? '#22C55E' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: step === s || STEPS.indexOf(step) > i ? '#fff' : '#94A3B8' }}>{i + 1}</div>
          {i < 2 && <div style={{ width: '24px', height: '2px', background: '#E2E8F0' }} />}
        </div>
      ))}
    </div>
  );
}

// ── Field editor ──────────────────────────────────────────────────────────────

function FieldEditor({ field: f, index, total, primary, allFields, onChange, onRemove, onMove }: {
  field: FieldDef; index: number; total: number; primary: string; allFields: FieldDef[];
  onChange: (p: Partial<FieldDef>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [showLogic, setShowLogic]     = useState(false);
  const [showDesc, setShowDesc]       = useState(!!f.description);

  const isSection    = f.type === 'section';
  const needsOptions = ['select', 'radio', 'multiselect'].includes(f.type);
  const needsWaiver  = f.type === 'waiver';
  const needsAccept  = f.type === 'file';
  const needsSlots   = f.type === 'volunteer';
  const c = FIELD_COLORS[f.type] ?? { color: '#64748B', bg: '#F8FAFC' };
  const hasLogic     = (f.logic?.showIf?.length ?? 0) > 0;

  const logicCandidates = allFields.filter((x) => x.id !== f.id && ['select', 'radio', 'multiselect', 'text', 'email', 'phone'].includes(x.type));

  return (
    <div style={{ background: '#fff', border: `1.5px solid ${hasLogic ? '#C4B5FD' : '#E2E8F0'}`, borderRadius: '12px', padding: '14px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: isSection ? 0 : '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <button onClick={() => onMove(-1)} disabled={index === 0} style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '2px', color: index === 0 ? '#E2E8F0' : '#94A3B8', display: 'flex' }}><ChevronUp size={12} /></button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', padding: '2px', color: index === total - 1 ? '#E2E8F0' : '#94A3B8', display: 'flex' }}><ChevronDown size={12} /></button>
        </div>
        <span style={{ fontSize: '9px', fontWeight: '800', color: c.color, background: c.bg, borderRadius: '4px', padding: '2px 7px', letterSpacing: '0.5px' }}>{FIELD_CHIP[f.type]}</span>
        <input value={f.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="Field label"
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: '14px', fontWeight: isSection ? '700' : '600', color: '#0F172A', fontFamily: 'inherit', background: 'transparent' }} />
        {hasLogic && <span style={{ fontSize: '9px', fontWeight: '700', color: '#7C3AED', background: '#EDE9FE', borderRadius: '4px', padding: '2px 6px' }}>Conditional</span>}
        {!isSection && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94A3B8', cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={f.required} onChange={(e) => onChange({ required: e.target.checked })} style={{ accentColor: primary } as React.CSSProperties} />
            Required
          </label>
        )}
        <button onClick={() => setShowDesc((s) => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94A3B8', fontSize: '11px', fontWeight: '600', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>{showDesc ? '− desc' : '+ desc'}</button>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#CBD5E1', display: 'flex' }}><Trash2 size={13} /></button>
      </div>

      {!isSection && (
        <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {showDesc && (
            <input value={f.description ?? ''} onChange={(e) => onChange({ description: e.target.value })} placeholder="Helper text shown below the field"
              style={{ width: '100%', border: '1px solid #E2E8F0', outline: 'none', fontSize: '13px', color: '#64748B', fontFamily: 'inherit', background: '#F8FAFC', borderRadius: '8px', padding: '7px 10px', boxSizing: 'border-box' }} />
          )}
          {needsOptions && (
            <div>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>Options (comma-separated)</div>
              <input value={f.options ?? ''} onChange={(e) => onChange({ options: e.target.value })} placeholder="Option 1, Option 2, Option 3"
                style={{ width: '100%', border: '1px solid #E2E8F0', outline: 'none', fontSize: '13px', fontFamily: 'inherit', background: '#F8FAFC', borderRadius: '8px', padding: '7px 10px', boxSizing: 'border-box' }} />
            </div>
          )}
          {needsWaiver && (
            <textarea value={f.waiver_text ?? ''} onChange={(e) => onChange({ waiver_text: e.target.value })} placeholder="Full consent text that parents must agree to…" rows={3}
              style={{ width: '100%', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', color: '#374151', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          )}
          {needsSlots && (
            <div>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>Volunteer slots (one per line)</div>
              <textarea value={f.volunteer_slots ?? ''} onChange={(e) => onChange({ volunteer_slots: e.target.value })} placeholder="Canteen duty — 14 Sept&#10;Field setup — 21 Sept&#10;Kit washing — weekly" rows={4}
                style={{ width: '100%', background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', color: '#374151', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          )}
          {needsAccept && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600' }}>Accept:</span>
              {[['image/*,.pdf','Images & PDF'],['image/*','Images only'],['.pdf','PDF only']].map(([val, lbl]) => (
                <button key={val} onClick={() => onChange({ accept: val })}
                  style={{ padding: '3px 9px', borderRadius: '5px', border: `1.5px solid ${f.accept === val ? c.color : '#E2E8F0'}`, background: f.accept === val ? c.bg : '#F8FAFC', color: f.accept === val ? c.color : '#64748B', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {lbl}
                </button>
              ))}
            </div>
          )}

          {/* Conditional logic */}
          {logicCandidates.length > 0 && (
            <div>
              <button onClick={() => setShowLogic((s) => !s)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '600', color: hasLogic ? '#7C3AED' : '#94A3B8', fontFamily: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                {showLogic ? '▾' : '▸'} Conditional logic {hasLogic ? `(${f.logic!.showIf.length} rule${f.logic!.showIf.length !== 1 ? 's' : ''})` : ''}
              </button>
              {showLogic && (
                <div style={{ marginTop: '8px', background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#7C3AED', fontWeight: '600', marginBottom: '8px' }}>Show this field only if…</div>
                  {(f.logic?.showIf ?? []).map((rule, ri) => (
                    <div key={ri} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <select value={rule.fieldId} onChange={(e) => {
                        const updated = [...(f.logic?.showIf ?? [])]; updated[ri] = { ...updated[ri], fieldId: e.target.value };
                        onChange({ logic: { showIf: updated } });
                      }} style={{ flex: 1, padding: '5px 8px', border: '1px solid #DDD6FE', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', background: '#fff', outline: 'none' }}>
                        <option value="">— pick field —</option>
                        {logicCandidates.map((lc) => <option key={lc.id} value={lc.id}>{lc.label}</option>)}
                      </select>
                      <select value={rule.operator} onChange={(e) => {
                        const updated = [...(f.logic?.showIf ?? [])]; updated[ri] = { ...updated[ri], operator: e.target.value as 'equals'|'not_equals'|'contains' };
                        onChange({ logic: { showIf: updated } });
                      }} style={{ padding: '5px 8px', border: '1px solid #DDD6FE', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', background: '#fff', outline: 'none' }}>
                        <option value="equals">equals</option>
                        <option value="not_equals">does not equal</option>
                        <option value="contains">contains</option>
                      </select>
                      <input value={rule.value} onChange={(e) => {
                        const updated = [...(f.logic?.showIf ?? [])]; updated[ri] = { ...updated[ri], value: e.target.value };
                        onChange({ logic: { showIf: updated } });
                      }} placeholder="value" style={{ flex: 1, padding: '5px 8px', border: '1px solid #DDD6FE', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', outline: 'none' }} />
                      <button onClick={() => {
                        const updated = (f.logic?.showIf ?? []).filter((_, j) => j !== ri);
                        onChange({ logic: updated.length ? { showIf: updated } : undefined });
                      }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A78BFA', display: 'flex', padding: '2px' }}><X size={13} /></button>
                    </div>
                  ))}
                  <button onClick={() => {
                    const updated = [...(f.logic?.showIf ?? []), { fieldId: '', operator: 'equals' as const, value: '' }];
                    onChange({ logic: { showIf: updated } });
                  }} style={{ fontSize: '11px', color: '#7C3AED', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Plus size={11} /> Add condition
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
