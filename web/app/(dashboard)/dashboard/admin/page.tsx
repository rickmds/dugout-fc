'use client';

import { useEffect, useState, useCallback } from 'react';
import { Shield, Upload, Palette, Globe, Bell, Download, CreditCard, Trash2, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import UpgradePrompt from '@/components/dashboard/UpgradePrompt';

const SECTIONS = ['Club Profile', 'Branding', 'Notifications', 'Data Exports', 'Subscription', 'Danger Zone'];

const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'USD — US Dollar ($)' },
  { code: 'GBP', symbol: '£', label: 'GBP — British Pound (£)' },
  { code: 'EUR', symbol: '€', label: 'EUR — Euro (€)' },
  { code: 'CAD', symbol: 'CA$', label: 'CAD — Canadian Dollar (CA$)' },
  { code: 'AUD', symbol: 'A$', label: 'AUD — Australian Dollar (A$)' },
];

export default function ClubAdminPage() {
  const { club, profile, reload, canUse } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [active,  setActive]  = useState('Club Profile');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [uploading, setUploading] = useState(false);

  // Club profile form
  const [profileForm, setProfileForm] = useState({
    name: '', slug: '', website: '', contact_email: '', tagline: '', currency: 'USD',
  });

  // Branding form
  const [brandForm, setBrandForm] = useState({
    primary_color: '#22C55E', secondary_color: '#ffffff',
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!club) return;
    setProfileForm({ name: club.name ?? '', slug: (club as any).slug ?? '', website: (club as any).website ?? '', contact_email: (club as any).contact_email ?? '', tagline: (club as any).tagline ?? '', currency: (club as any).currency ?? 'USD' });
    setBrandForm({ primary_color: club.primary_color ?? '#22C55E', secondary_color: (club as any).secondary_color ?? '#ffffff' });
    setLogoPreview(club.logo_url);
  }, [club]);

  async function saveProfile() {
    if (!club) return;
    setSaving(true);
    const { error } = await supabase.from('clubs').update({
      name: profileForm.name, slug: profileForm.slug,
      website: profileForm.website, contact_email: profileForm.contact_email,
      tagline: profileForm.tagline, currency: profileForm.currency,
    }).eq('id', club.id);
    setSaving(false);
    if (error) { alert(`Save failed: ${error.message}`); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    reload();
  }

  async function saveBranding() {
    if (!club) return;
    setSaving(true);
    await supabase.from('clubs').update({ primary_color: brandForm.primary_color, secondary_color: brandForm.secondary_color }).eq('id', club.id);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
    reload();
  }

  async function uploadLogo(file: File) {
    if (!club) return;
    setUploading(true);
    const ext  = file.name.split('.').pop();
    const path = `${club.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('club-logos').upload(path, file, { upsert: true });
    if (!error) {
      const { data: url } = supabase.storage.from('club-logos').getPublicUrl(path);
      await supabase.from('clubs').update({ logo_url: url.publicUrl }).eq('id', club.id);
      setLogoPreview(url.publicUrl);
      reload();
    }
    setUploading(false);
  }

  async function exportCSV(type: string) {
    if (!club) return;
    let rows: any[] = [];
    if (type === 'players') {
      const { data } = await supabase.from('players').select('full_name,jersey_number,position,date_of_birth,teams(name)').in('team_id', (await supabase.from('teams').select('id').eq('club_id', club.id)).data?.map((t: any) => t.id) ?? []);
      rows = (data ?? []).map((p: any) => ({ Name: p.full_name, Jersey: p.jersey_number, Position: p.position, DOB: p.date_of_birth, Team: p.teams?.name }));
    } else if (type === 'fees') {
      const { data } = await supabase.from('player_fees').select('description,amount_due,amount_paid,discount,status,due_date,players(full_name),teams(name)').in('team_id', (await supabase.from('teams').select('id').eq('club_id', club.id)).data?.map((t: any) => t.id) ?? []);
      rows = (data ?? []).map((f: any) => ({ Player: f.players?.full_name, Team: f.teams?.name, Fee: f.description, Due: f.amount_due, Paid: f.amount_paid, Discount: f.discount, Status: f.status, DueDate: f.due_date }));
    } else if (type === 'events') {
      const teamIds = (await supabase.from('teams').select('id').eq('club_id', club.id)).data?.map((t: any) => t.id) ?? [];
      const { data } = await supabase.from('events').select('title,type,event_date,event_time,location,teams(name)').in('team_id', teamIds).order('event_date');
      rows = (data ?? []).map((e: any) => ({ Title: e.title, Type: e.type, Date: e.event_date, Time: e.event_time, Location: e.location, Team: e.teams?.name }));
    }
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${club.name}-${type}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: '12px', fontWeight: '600' as const, color: '#374151', display: 'block' as const, marginBottom: '5px' };
  const sectionCard = { background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' as const, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Club</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Administration</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94A3B8' }}>Manage your club settings, branding, and data</p>
        </div>
      </div>
      <div style={{ padding: '24px 32px' }}>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '20px', alignItems: 'start' }}>

        {/* Sidebar nav */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', position: 'sticky', top: '20px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {SECTIONS.map(s => (
            <button key={s} onClick={() => setActive(s)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 12px 8px 14px',
              borderRadius: '8px',
              background: active === s ? `${primary}12` : 'transparent',
              color: active === s ? primary : '#374151',
              borderTop: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              borderLeft: active === s ? `3px solid ${primary}` : '3px solid transparent',
              cursor: 'pointer',
              fontSize: '13px', fontWeight: active === s ? '700' : '500',
              fontFamily: 'inherit',
              transition: 'background 0.12s, color 0.12s',
            }}>
              {s}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {active === 'Club Profile' && (
            <div style={sectionCard}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Club Profile</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Your club's public-facing details</div>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <label style={labelStyle}>Club name *<input value={profileForm.name} onChange={e => setProfileForm(f => ({...f, name: e.target.value}))} style={{ ...inputStyle, marginTop: '5px' }} /></label>
                  <label style={labelStyle}>URL slug *<input value={profileForm.slug} onChange={e => setProfileForm(f => ({...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'')}))} style={{ ...inputStyle, marginTop: '5px' }} /></label>
                </div>
                <label style={labelStyle}>Tagline<input value={profileForm.tagline} onChange={e => setProfileForm(f => ({...f, tagline: e.target.value}))} placeholder="e.g. Developing players, building champions" style={{ ...inputStyle, marginTop: '5px' }} /></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <label style={labelStyle}>Website<input value={profileForm.website} onChange={e => setProfileForm(f => ({...f, website: e.target.value}))} placeholder="https://" style={{ ...inputStyle, marginTop: '5px' }} /></label>
                  <label style={labelStyle}>Contact email<input type="email" value={profileForm.contact_email} onChange={e => setProfileForm(f => ({...f, contact_email: e.target.value}))} style={{ ...inputStyle, marginTop: '5px' }} /></label>
                </div>
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Currency</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {CURRENCIES.map(c => (
                      <button key={c.code} onClick={() => setProfileForm(f => ({ ...f, currency: c.code }))}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '9px', border: `2px solid ${profileForm.currency === c.code ? primary : '#E2E8F0'}`, background: profileForm.currency === c.code ? `${primary}10` : '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: profileForm.currency === c.code ? '700' : '500', color: profileForm.currency === c.code ? primary : '#374151', transition: 'all 0.15s' }}>
                        <span style={{ fontSize: '15px', fontWeight: '700' }}>{c.symbol}</span>
                        <span>{c.code}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '8px' }}>
                    Applies to all fees and offer letters across the club.
                  </div>
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                {saved && <span style={{ fontSize: '13px', color: '#22C55E', display: 'flex', alignItems: 'center', gap: '5px' }}><Check size={14} /> Saved</span>}
                <button onClick={saveProfile} disabled={saving} style={{ background: primary, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {active === 'Branding' && !canUse('branding') && (
            <div style={{ ...sectionCard, padding: '32px' }}>
              <UpgradePrompt feature="Custom Branding" description="Add your club logo and brand colours so every screen, email, and notification feels like your club — not a generic app." requiredPlan="Team Pro" />
            </div>
          )}
          {active === 'Branding' && canUse('branding') && (
            <div style={sectionCard}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Branding</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Logo and colours used across the app and emails</div>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Logo */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '10px' }}>Club Logo</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '72px', height: '72px', borderRadius: '14px', border: '2px dashed #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#F8FAFC' }}>
                      {logoPreview
                        ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <Upload size={22} color="#CBD5E1" />}
                    </div>
                    <div>
                      <label style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer' }}>
                        {uploading ? 'Uploading…' : 'Upload Logo'}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0]); }} />
                      </label>
                      <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '5px' }}>PNG or SVG, min 200×200px</div>
                    </div>
                  </div>
                </div>
                {/* Colors */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Primary colour</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                      <input type="color" value={brandForm.primary_color} onChange={e => setBrandForm(f => ({...f, primary_color: e.target.value}))} style={{ width: '44px', height: '44px', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer', padding: '2px' }} />
                      <input value={brandForm.primary_color} onChange={e => setBrandForm(f => ({...f, primary_color: e.target.value}))} style={{ ...inputStyle, width: '120px' }} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Secondary colour</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                      <input type="color" value={brandForm.secondary_color} onChange={e => setBrandForm(f => ({...f, secondary_color: e.target.value}))} style={{ width: '44px', height: '44px', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer', padding: '2px' }} />
                      <input value={brandForm.secondary_color} onChange={e => setBrandForm(f => ({...f, secondary_color: e.target.value}))} style={{ ...inputStyle, width: '120px' }} />
                    </div>
                  </div>
                </div>
                {/* Preview */}
                <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Preview</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: brandForm.primary_color }} />
                    <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: brandForm.secondary_color, border: '1px solid #E2E8F0' }} />
                    <div style={{ padding: '7px 18px', borderRadius: '8px', background: brandForm.primary_color, fontSize: '13px', fontWeight: '700', color: '#fff' }}>Button</div>
                    <div style={{ padding: '7px 18px', borderRadius: '8px', background: brandForm.secondary_color, border: `1px solid ${brandForm.primary_color}`, fontSize: '13px', fontWeight: '700', color: brandForm.primary_color }}>Outline</div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                {saved && <span style={{ fontSize: '13px', color: '#22C55E', display: 'flex', alignItems: 'center', gap: '5px' }}><Check size={14} /> Saved</span>}
                <button onClick={saveBranding} disabled={saving} style={{ background: primary, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>Save Branding</button>
              </div>
            </div>
          )}

          {active === 'Notifications' && (
            <div style={sectionCard}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Notification Preferences</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Club-wide defaults (coaches and parents can override per-device)</div>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '0' }}>
                {[
                  { label: 'New announcement posted',     sub: 'Push + email to all team members' },
                  { label: 'Event RSVP deadline reminder',sub: '24 hrs before lock time' },
                  { label: 'Event cancelled or changed',  sub: 'Immediate push + email' },
                  { label: 'New team email received',     sub: 'Email only' },
                  { label: 'Fee payment reminder',        sub: '3 days before due date' },
                  { label: 'New player invited',          sub: 'Email to parent' },
                ].map(({ label, sub }, i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: i < arr.length-1 ? '1px solid #F1F5F9' : 'none' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#0F172A' }}>{label}</div>
                      <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '1px' }}>{sub}</div>
                    </div>
                    <div style={{ width: '42px', height: '24px', borderRadius: '12px', background: primary, cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', right: '3px', top: '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', fontSize: '12px', color: '#94A3B8' }}>
                Individual push notification settings are managed in the mobile app.
              </div>
            </div>
          )}

          {active === 'Data Exports' && (
            <div style={sectionCard}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Data Exports</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Download your club data as CSV</div>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { key: 'players', label: 'Player Registry', desc: 'All players — name, position, team, DOB' },
                  { key: 'fees',    label: 'Fee Report',      desc: 'All fees — amounts, status, payments' },
                  { key: 'events',  label: 'Event History',   desc: 'All events — type, date, location, team' },
                ].map(({ key, label, desc }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A' }}>{label}</div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{desc}</div>
                    </div>
                    <button onClick={() => exportCSV(key)} style={{ padding: '7px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Download size={13} /> Export CSV
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {active === 'Subscription' && (
            <div style={sectionCard}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Subscription & Billing</div>
              </div>
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '10px', padding: '8px 14px', marginBottom: '20px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E' }} />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#166534' }}>Free plan — Beta access</span>
                </div>
                <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.7, marginBottom: '20px' }}>
                  Pulse FC is currently free while we validate with our first clubs. Pricing will be introduced later — you'll have plenty of notice before any charges apply.
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>What's included</div>
                  {['Unlimited teams & players','AI schedule import','AI roster import','Lineup builder','Parent communications','Push notifications','Fee tracking'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <Check size={13} color="#22C55E" />
                      <span style={{ fontSize: '13px', color: '#374151' }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {active === 'Danger Zone' && (
            <div style={{ ...sectionCard, border: '1px solid #FEE2E2', borderLeft: '4px solid #EF4444' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #FEE2E2', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={18} color="#EF4444" />
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#EF4444' }}>Danger Zone</div>
              </div>
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#FFF5F5', borderRadius: '10px', border: '1px solid #FEE2E2' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A' }}>Delete this club</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>Permanently removes all teams, players, events, and data. This cannot be undone.</div>
                  </div>
                  <button onClick={() => alert('Please contact rick@mdssoccer.com to delete your club.')} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #EF4444', background: '#fff', fontSize: '13px', fontWeight: '700', color: '#EF4444', cursor: 'pointer', flexShrink: 0 }}>
                    Delete Club
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
      </div>
    </div>
  );
}
