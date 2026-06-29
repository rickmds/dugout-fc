'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { Save, Plus, Trash2, GripVertical } from 'lucide-react';

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

const defaultConfig: FormConfig = {
  formTitle: 'Tryout Registration',
  formSubtitle: 'Register your player for tryouts',
  welcomeText: '',
  seasonLabel: '2026-27',
  submitLabel: 'Submit Registration',
  successTitle: 'Registration Complete!',
  successBody: 'Thank you for registering. We will be in touch with tryout details.',
  gradeOptions: ['K','1','2','3','4','5','6','7','8','9','10','11','12'],
  positionOptions: ['GK','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','Any'],
  referralOptions: ['Friend/Family','Social Media','Web Search','Coach','Other'],
  jerseySizeOptions: ['YS','YM','YL','AS','AM','AL','AXL'],
  questions: [],
};

const QUESTION_TYPES = ['text','textarea','select','radio','multiselect','date','checkbox'] as const;

function genId() { return Math.random().toString(36).slice(2, 9); }

export default function TryoutFormConfigPage() {
  const { club } = useDashboard();

  const [config, setConfig] = useState<FormConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!club) return;
    supabase.from('tryout_form_config').select('*').eq('club_id', club.id).single()
      .then(({ data }) => {
        if (data?.config_json) setConfig({ ...defaultConfig, ...data.config_json });
      });
  }, [club]);

  async function handleSave() {
    if (!club) return;
    setSaving(true);
    await supabase.from('tryout_form_config').upsert({ club_id: club.id, config_json: config, season_label: config.seasonLabel }, { onConflict: 'club_id' });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function addQuestion() {
    const q: Question = { id: genId(), type: 'text', label: '', helpText: '', required: false, options: [], fieldKey: '', builtIn: false };
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
      const qs = [...c.questions];
      const i = qs.findIndex(q => q.id === id);
      if (i < 0) return c;
      const j = i + dir;
      if (j < 0 || j >= qs.length) return c;
      [qs[i], qs[j]] = [qs[j], qs[i]];
      return { ...c, questions: qs };
    });
  }

  const inputStyle: React.CSSProperties = { padding: '8px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const label = (text: string) => <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>{text}</label>;

  return (
    <div style={{ padding: '32px 40px', maxWidth: '820px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0F172A', margin: 0 }}>Registration Form</h1>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0' }}>Configure the public tryout registration form.</p>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: saved ? '#16A34A' : '#22C55E', color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 18px', fontWeight: '600', fontSize: '13.5px', cursor: 'pointer' }}>
          <Save size={14} /> {saved ? 'Saved!' : saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* General settings */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#0F172A', marginBottom: '14px' }}>General</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>{label('Season label')}<input value={config.seasonLabel} onChange={e => setConfig(c => ({ ...c, seasonLabel: e.target.value }))} style={inputStyle} /></div>
          <div>{label('Form title')}<input value={config.formTitle} onChange={e => setConfig(c => ({ ...c, formTitle: e.target.value }))} style={inputStyle} /></div>
          <div style={{ gridColumn: '1/-1' }}>{label('Subtitle')}<input value={config.formSubtitle} onChange={e => setConfig(c => ({ ...c, formSubtitle: e.target.value }))} style={inputStyle} /></div>
          <div>{label('Submit button label')}<input value={config.submitLabel} onChange={e => setConfig(c => ({ ...c, submitLabel: e.target.value }))} style={inputStyle} /></div>
          <div>{label('Success title')}<input value={config.successTitle} onChange={e => setConfig(c => ({ ...c, successTitle: e.target.value }))} style={inputStyle} /></div>
          <div style={{ gridColumn: '1/-1' }}>{label('Success message')}<textarea value={config.successBody} onChange={e => setConfig(c => ({ ...c, successBody: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></div>
        </div>
      </div>

      {/* Option lists */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#0F172A', marginBottom: '14px' }}>Drop-down option lists <span style={{ fontWeight: '400', color: '#94A3B8', fontSize: '12px' }}>(comma-separated)</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            ['gradeOptions', 'Grade options'],
            ['positionOptions', 'Position options'],
            ['referralOptions', 'Referral source options'],
            ['jerseySizeOptions', 'Jersey size options'],
          ].map(([key, lbl]) => (
            <div key={key}>
              {label(lbl)}
              <input
                value={(config[key as keyof FormConfig] as string[]).join(',')}
                onChange={e => setConfig(c => ({ ...c, [key]: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                style={inputStyle}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Custom questions */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#0F172A' }}>Custom questions</div>
          <button onClick={addQuestion} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 12px', fontSize: '12.5px', cursor: 'pointer', color: '#374151', fontWeight: '600' }}>
            <Plus size={13} /> Add question
          </button>
        </div>
        {config.questions.length === 0 && (
          <div style={{ color: '#94A3B8', fontSize: '13.5px', textAlign: 'center', padding: '24px 0' }}>No custom questions yet.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {config.questions.map((q, idx) => (
            <div key={q.id} style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', background: '#FAFAFA' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button onClick={() => moveQ(q.id, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', color: '#94A3B8', fontSize: '10px' }}>▲</button>
                  <button onClick={() => moveQ(q.id, 1)} disabled={idx === config.questions.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', color: '#94A3B8', fontSize: '10px' }}>▼</button>
                </div>
                <GripVertical size={14} color="#CBD5E1" />
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                  <input placeholder="Question label" value={q.label} onChange={e => updateQ(q.id, { label: e.target.value })} style={inputStyle} />
                  <select value={q.type} onChange={e => updateQ(q.id, { type: e.target.value as Question['type'] })} style={{ ...inputStyle }}>
                    {QUESTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={q.required} onChange={e => updateQ(q.id, { required: e.target.checked })} /> Required
                </label>
                <button onClick={() => removeQ(q.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}><Trash2 size={14} /></button>
              </div>
              <input placeholder="Help text (optional)" value={q.helpText} onChange={e => updateQ(q.id, { helpText: e.target.value })} style={{ ...inputStyle, fontSize: '12.5px' }} />
              {['select','radio','multiselect'].includes(q.type) && (
                <div style={{ marginTop: '8px' }}>
                  {label('Options (comma-separated)')}
                  <input value={q.options.join(',')} onChange={e => updateQ(q.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} style={{ ...inputStyle, fontSize: '12.5px' }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
