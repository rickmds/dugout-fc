'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { Save, ChevronDown, ChevronRight, Info } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false }) as any;

type OfferSettings = {
  id?: string;
  teamsnap_registration_url: string;
  email_subject: string;
  from_name: string;
  offer_deadline: string;
  email_body_html: string;
  email_body_html_u8: string;
};

type EmailTemplate = {
  id?: string;
  template_key: 'waitlist' | 'decline' | 'reminder';
  subject: string;
  from_name: string;
  body_html: string;
};

const MERGE_TOKENS = [
  '{{player_first_name}}', '{{player_full_name}}', '{{parent_name}}',
  '{{team_name}}', '{{age_group}}', '{{club_name}}', '{{season_label}}',
  '{{offer_deadline}}', '{{teamsnap_url}}', '{{accept_link}}', '{{decline_link}}',
];

const TEMPLATE_LABELS: Record<string, string> = { waitlist: 'Waitlist', decline: 'Decline', reminder: 'Reminder' };

function quillModules() {
  return { toolbar: [['bold','italic','underline'],['link'],['clean']] };
}

export default function TryoutOfferSettingsPage() {
  const { club } = useDashboard();

  const [settings, setSettings] = useState<OfferSettings>({
    teamsnap_registration_url: '', email_subject: 'Your Roster Offer',
    from_name: '', offer_deadline: '', email_body_html: '', email_body_html_u8: '',
  });
  const [templates, setTemplates] = useState<Record<string, EmailTemplate>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>('offer');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!club) return;
    (async () => {
      const [{ data: os }, { data: tmpl }] = await Promise.all([
        supabase.from('tryout_offer_settings').select('*').eq('club_id', club.id).single(),
        supabase.from('tryout_email_templates').select('*').eq('club_id', club.id),
      ]);
      if (os) setSettings(os);
      const map: Record<string, EmailTemplate> = {};
      for (const t of (tmpl ?? [])) map[t.template_key] = t;
      setTemplates(map);
    })();
  }, [club]);

  async function handleSave() {
    if (!club) return;
    setSaving(true);
    const payload = { ...settings, club_id: club.id };
    await supabase.from('tryout_offer_settings').upsert(payload, { onConflict: 'club_id' });
    for (const key of ['waitlist','decline','reminder'] as const) {
      const t = templates[key];
      if (t) {
        await supabase.from('tryout_email_templates').upsert(
          { ...t, club_id: club.id, template_key: key },
          { onConflict: 'club_id,template_key' }
        );
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function setTmpl(key: string, patch: Partial<EmailTemplate>) {
    setTemplates(prev => {
      const existing = prev[key] ?? { subject: '', from_name: '', body_html: '', template_key: key as EmailTemplate['template_key'] };
      return { ...prev, [key]: { ...existing, ...patch } };
    });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: '9px',
    border: '1px solid #E2E8F0', fontSize: '14px', color: '#0F172A',
    background: '#fff', outline: 'none', boxSizing: 'border-box',
  };

  const card = (children: React.ReactNode) => (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden', marginBottom: '12px' }}>
      {children}
    </div>
  );

  function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    const open = openSection === id;
    return card(
      <>
        <button onClick={() => setOpenSection(open ? null : id)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', color: '#0F172A' }}>
          {title}
          {open ? <ChevronDown size={15} color="#64748B" /> : <ChevronRight size={15} color="#64748B" />}
        </button>
        {open && <div style={{ padding: '0 20px 20px', borderTop: '1px solid #F1F5F9' }}>{children}</div>}
      </>
    );
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: '780px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0F172A', margin: 0 }}>Offer Settings</h1>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0' }}>Configure offer emails and templates.</p>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: saved ? '#16A34A' : '#22C55E', color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 18px', fontWeight: '600', fontSize: '13.5px', cursor: 'pointer', transition: 'background 0.2s' }}>
          <Save size={14} /> {saved ? 'Saved!' : saving ? 'Saving…' : 'Save All'}
        </button>
      </div>

      {/* Merge tokens hint */}
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '10px 14px', marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <Info size={14} color="#16A34A" style={{ flexShrink: 0, marginTop: '1px' }} />
        <div style={{ fontSize: '12px', color: '#166534', lineHeight: '1.5' }}>
          <strong>Merge tokens:</strong> {MERGE_TOKENS.join(' ')}
        </div>
      </div>

      <Section id="offer" title="Roster Offer Email (U9 and above)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Subject</label>
              <input value={settings.email_subject} onChange={e => setSettings(s => ({ ...s, email_subject: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>From name</label>
              <input value={settings.from_name} onChange={e => setSettings(s => ({ ...s, from_name: e.target.value }))} placeholder="Maroons SC" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Offer deadline</label>
              <input type="datetime-local" value={settings.offer_deadline ? settings.offer_deadline.slice(0,16) : ''} onChange={e => setSettings(s => ({ ...s, offer_deadline: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>TeamSnap registration URL</label>
              <input value={settings.teamsnap_registration_url} onChange={e => setSettings(s => ({ ...s, teamsnap_registration_url: e.target.value }))} placeholder="https://…" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Email body (HTML / rich text)</label>
            {mounted && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '9px', overflow: 'hidden' }}>
                <ReactQuill value={settings.email_body_html} onChange={(v: string) => setSettings(s => ({ ...s, email_body_html: v }))} modules={quillModules()} style={{ minHeight: '180px' }} />
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section id="offer-u8" title="Roster Offer Email (U8 Academy — leave blank to use U9+ template)">
        <div style={{ paddingTop: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Email body</label>
          {mounted && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '9px', overflow: 'hidden' }}>
              <ReactQuill value={settings.email_body_html_u8} onChange={(v: string) => setSettings(s => ({ ...s, email_body_html_u8: v }))} modules={quillModules()} style={{ minHeight: '140px' }} />
            </div>
          )}
        </div>
      </Section>

      {(['waitlist','decline','reminder'] as const).map(key => (
        <Section key={key} id={key} title={`${TEMPLATE_LABELS[key]} Email Template`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Subject</label>
                <input value={templates[key]?.subject ?? ''} onChange={e => setTmpl(key, { subject: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>From name</label>
                <input value={templates[key]?.from_name ?? ''} onChange={e => setTmpl(key, { from_name: e.target.value })} placeholder="Maroons SC" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Body</label>
              {mounted && (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '9px', overflow: 'hidden' }}>
                  <ReactQuill value={templates[key]?.body_html ?? ''} onChange={(v: string) => setTmpl(key, { body_html: v })} modules={quillModules()} style={{ minHeight: '120px' }} />
                </div>
              )}
            </div>
          </div>
        </Section>
      ))}
    </div>
  );
}
