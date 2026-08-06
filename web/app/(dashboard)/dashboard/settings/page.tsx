'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Save, Eye, EyeOff, Check, AlertCircle, Lock, User, Target,
  Upload, Palette, Globe, Bell, Download, CreditCard, Trash2, AlertTriangle,
  Settings as SettingsIcon, Building2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import UpgradePrompt from '@/components/dashboard/UpgradePrompt';

type Toast = { type: 'success' | 'error'; msg: string };

const CLUB_SECTIONS = ['Club Profile', 'Branding', 'Tryout Season', 'Payments', 'Notifications', 'Data Exports', 'Subscription', 'Danger Zone'];

const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'USD — US Dollar ($)' },
  { code: 'GBP', symbol: '£', label: 'GBP — British Pound (£)' },
  { code: 'EUR', symbol: '€', label: 'EUR — Euro (€)' },
  { code: 'CAD', symbol: 'CA$', label: 'CAD — Canadian Dollar (CA$)' },
  { code: 'AUD', symbol: 'A$', label: 'AUD — Australian Dollar (A$)' },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function Card({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '20px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{title}</div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '1px' }}>{sub}</div>
        </div>
      </div>
      <div style={{ padding: '24px' }}>{children}</div>
    </div>
  );
}

function SaveButton({ label, saving, primary, onClick, disabled }: { label: string; saving: boolean; primary: string; onClick: () => void; disabled?: boolean }) {
  const [hover, setHover] = useState(false);
  const isDisabled = saving || disabled;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        background: isDisabled ? '#E2E8F0' : hover ? `${primary}dd` : primary,
        color: isDisabled ? '#94A3B8' : '#fff',
        fontWeight: '700', fontSize: '13px',
        padding: '8px 16px', borderRadius: '6px',
        border: 'none', cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', transition: 'background 0.15s',
      }}
    >
      {saving
        ? <><div style={{ width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Saving…</>
        : <><Save size={14} /> {label}</>}
    </button>
  );
}

const labelSt: React.CSSProperties = {
  fontSize: '10px', fontWeight: '800', color: '#94A3B8',
  letterSpacing: '1.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px',
};
const inputSt: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '8px', padding: '10px 13px', fontSize: '14px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const sectionCard = { background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' as const, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' };
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', outline: 'none', boxSizing: 'border-box' as const };
const labelStyle = { fontSize: '12px', fontWeight: '600' as const, color: '#374151', display: 'block' as const, marginBottom: '5px' };

// ── Account tab ────────────────────────────────────────────────────────────────

function AccountTab({ primary, showToast }: { primary: string; showToast: (t: Toast['type'], m: string) => void }) {
  const { profile, reload } = useDashboard();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [email, setEmail]       = useState('');
  const [authProvider, setAuthProvider] = useState('email');

  // Email change form
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail]           = useState('');
  const [confirmEmail, setConfirmEmail]   = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailSent, setEmailSent]         = useState(false);

  // Password change form
  const [newPass, setNewPass]   = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNew, setShowNew]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving]     = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
      setAuthProvider(user?.app_metadata?.provider ?? 'email');
    });
    setFullName(profile?.full_name ?? '');
  }, [profile]);

  async function saveProfile() {
    if (!profile || !fullName.trim()) return;
    setSaving('profile');
    try {
      const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', profile.id);
      if (error) { showToast('error', error.message); return; }
      reload();
      showToast('success', 'Profile saved');
    } finally { setSaving(''); }
  }

  async function changeEmail() {
    if (!newEmail.trim()) return;
    if (newEmail !== confirmEmail) { showToast('error', 'Email addresses do not match'); return; }
    if (!emailPassword.trim()) { showToast('error', 'Enter your current password to confirm'); return; }
    setSaving('email');
    // Verify current password before changing email — prevents account takeover from unattended sessions
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: emailPassword });
    if (authError) { showToast('error', 'Incorrect password — please try again'); setSaving(''); return; }
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setSaving('');
    if (error) { showToast('error', error.message); return; }
    setEmailSent(true);
    setNewEmail(''); setConfirmEmail(''); setEmailPassword('');
  }

  async function changePassword() {
    if (!newPass.trim()) return;
    if (newPass !== confirmPass) { showToast('error', 'Passwords do not match'); return; }
    if (newPass.length < 8) { showToast('error', 'Password must be at least 8 characters'); return; }
    setSaving('password');
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setSaving('');
    if (error) { showToast('error', error.message); return; }
    setNewPass(''); setConfirmPass('');
    showToast('success', 'Password updated');
  }

  return (
    <div style={{ maxWidth: '672px' }}>
      <Card icon={<User size={16} color={primary} />} title="My Profile" sub="Your display name across the dashboard">
        <div style={{ marginBottom: '16px' }}>
          <label style={labelSt}>Full name</label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" style={inputSt} />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={labelSt}>Email address</label>
          <div style={{ ...inputSt, background: '#F8FAFC', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={13} color="#CBD5E1" />
            {email || 'Loading…'}
          </div>
          {authProvider === 'email' ? (
            <button onClick={() => { setShowEmailForm(v => !v); setEmailSent(false); }} style={{ marginTop: '6px', background: 'none', border: 'none', padding: 0, fontSize: '11px', color: primary, fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
              {showEmailForm ? 'Cancel' : 'Change email address →'}
            </button>
          ) : (
            <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Email managed by {authProvider === 'apple' ? 'Apple' : 'Google'} — cannot be changed here</p>
          )}
        </div>

        {/* Email change form */}
        {authProvider === 'email' && showEmailForm && (
          <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '16px', marginBottom: '20px', border: '1px solid #E2E8F0' }}>
            {emailSent ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Check size={16} color="#22C55E" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Confirmation sent</div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Click the link in {newEmail || 'your new email'} to complete the change.</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#EF4444', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <AlertCircle size={11} color="#EF4444" /> Confirm your identity first
                </div>
                <div>
                  <label style={labelSt}>Current password</label>
                  <input type="password" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} placeholder="Your current password" style={inputSt} autoComplete="current-password" />
                </div>
                <div>
                  <label style={labelSt}>New email address</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@email.com" style={inputSt} />
                </div>
                <div>
                  <label style={labelSt}>Confirm new email</label>
                  <input type="email" value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} placeholder="Repeat new email" style={{ ...inputSt, borderColor: confirmEmail && confirmEmail !== newEmail ? '#EF4444' : undefined }} />
                  {confirmEmail && confirmEmail !== newEmail && <p style={{ fontSize: '11px', color: '#EF4444', marginTop: '4px' }}>Emails don&apos;t match</p>}
                </div>
                <SaveButton label="Send confirmation" saving={saving === 'email'} primary={primary} onClick={changeEmail} disabled={!newEmail || !confirmEmail || newEmail !== confirmEmail || !emailPassword} />
              </div>
            )}
          </div>
        )}

        <SaveButton label="Save profile" saving={saving === 'profile'} primary={primary} onClick={saveProfile} />
      </Card>

      <Card icon={<Lock size={16} color="#8B5CF6" />} title="Password" sub="Update your sign-in password">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
          <div>
            <label style={labelSt}>New password</label>
            <div style={{ position: 'relative' }}>
              <input type={showNew ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="At least 8 characters" style={{ ...inputSt, paddingRight: '40px' }} />
              <button onClick={() => setShowNew(v => !v)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: '#94A3B8' }}>
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label style={labelSt}>Confirm new password</label>
            <div style={{ position: 'relative' }}>
              <input type={showConfirm ? 'text' : 'password'} value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Repeat your new password" style={{ ...inputSt, paddingRight: '40px', borderColor: confirmPass && confirmPass !== newPass ? '#EF4444' : undefined }} />
              <button onClick={() => setShowConfirm(v => !v)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: '#94A3B8' }}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPass && confirmPass !== newPass && (
              <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>Passwords don&apos;t match</p>
            )}
          </div>
        </div>
        <SaveButton label="Update password" saving={saving === 'password'} primary="#8B5CF6" onClick={changePassword} disabled={!newPass || newPass !== confirmPass || newPass.length < 8} />
      </Card>
    </div>
  );
}

// ── Club tab ───────────────────────────────────────────────────────────────────

function ClubTab({ primary, showToast, initialSection }: { primary: string; showToast: (t: Toast['type'], m: string) => void; initialSection?: string }) {
  const { club, profile, reload, canUse } = useDashboard();
  const [active,    setActive]    = useState(initialSection ?? 'Club Profile');
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tryoutsActive, setTryoutsActive] = useState(club?.tryouts_active ?? false);
  const [savingTryouts, setSavingTryouts] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);

  const [profileForm, setProfileForm] = useState({
    name: '', slug: '', website: '', contact_email: '', tagline: '', currency: 'USD',
  });
  const [brandForm, setBrandForm] = useState({
    primary_color: '#22C55E', secondary_color: '#ffffff',
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    stripe_fee_handling:   'absorb' as 'absorb' | 'pass_on',
    allow_partial_payments: false,
    late_fee_enabled:       false,
    late_fee_type:          'fixed' as 'fixed' | 'percent',
    late_fee_amount:        '10',
    late_fee_grace_days:    '7',
    hardship_fund_enabled:  false,
  });

  useEffect(() => {
    if (!club) return;
    setProfileForm({ name: club.name ?? '', slug: (club as any).slug ?? '', website: (club as any).website ?? '', contact_email: (club as any).contact_email ?? '', tagline: (club as any).tagline ?? '', currency: (club as any).currency ?? 'USD' });
    setBrandForm({ primary_color: club.primary_color ?? '#22C55E', secondary_color: (club as any).secondary_color ?? '#ffffff' });
    setLogoPreview(club.logo_url);
    setTryoutsActive(club?.tryouts_active ?? false);
    setPaymentForm({
      stripe_fee_handling:   (club as any).stripe_fee_handling   ?? 'absorb',
      allow_partial_payments: (club as any).allow_partial_payments ?? false,
      late_fee_enabled:       (club as any).late_fee_enabled       ?? false,
      late_fee_type:          (club as any).late_fee_type          ?? 'fixed',
      late_fee_amount:        String((club as any).late_fee_amount ?? 10),
      late_fee_grace_days:    String((club as any).late_fee_grace_days ?? 7),
      hardship_fund_enabled:  (club as any).hardship_fund_enabled  ?? false,
    });
  }, [club]);

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 2000); }

  async function saveProfile() {
    if (!club) return;
    setSaving(true);
    const { error } = await supabase.from('clubs').update({
      name: profileForm.name, slug: profileForm.slug,
      website: profileForm.website, contact_email: profileForm.contact_email,
      tagline: profileForm.tagline, currency: profileForm.currency,
    }).eq('id', club.id);
    setSaving(false);
    if (error) { showToast('error', `Save failed: ${error.message}`); return; }
    flash(); reload();
  }

  async function saveBranding() {
    if (!club) return;
    setSaving(true);
    const { error } = await supabase.from('clubs').update({ primary_color: brandForm.primary_color, secondary_color: brandForm.secondary_color }).eq('id', club.id);
    setSaving(false);
    if (error) { showToast('error', `Save failed: ${error.message}`); return; }
    flash(); reload();
  }

  async function savePayments() {
    if (!club) return;
    setSaving(true);
    const { error } = await supabase.from('clubs').update({
      stripe_fee_handling:   paymentForm.stripe_fee_handling,
      allow_partial_payments: paymentForm.allow_partial_payments,
      late_fee_enabled:       paymentForm.late_fee_enabled,
      late_fee_type:          paymentForm.late_fee_type,
      late_fee_amount:        parseFloat(paymentForm.late_fee_amount) || 0,
      late_fee_grace_days:    parseInt(paymentForm.late_fee_grace_days) || 7,
      hardship_fund_enabled:  paymentForm.hardship_fund_enabled,
    }).eq('id', club.id);
    setSaving(false);
    if (error) { showToast('error', `Save failed: ${error.message}`); return; }
    showToast('success', 'Payment settings saved');
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

  async function toggleTryouts() {
    if (!club) return;
    setSavingTryouts(true);
    const next = !tryoutsActive;
    try {
      const { error } = await supabase.from('clubs').update({ tryouts_active: next }).eq('id', club.id);
      if (error) { showToast('error', error.message); return; }
      setTryoutsActive(next);
      reload();
      showToast('success', `Tryout season ${next ? 'enabled' : 'disabled'}`);
    } finally { setSavingTryouts(false); }
  }

  async function exportCSV(type: string) {
    if (!club) return;
    let rows: any[] = [];
    const teamIds = (await supabase.from('teams').select('id').eq('club_id', club.id)).data?.map((t: any) => t.id) ?? [];
    if (type === 'players') {
      const { data } = await supabase.from('players').select('full_name,jersey_number,position,date_of_birth,teams(name)').in('team_id', teamIds);
      rows = (data ?? []).map((p: any) => ({ Name: p.full_name, Jersey: p.jersey_number, Position: p.position, DOB: p.date_of_birth, Team: p.teams?.name }));
    } else if (type === 'fees') {
      const { data } = await supabase.from('player_fees').select('description,amount_due,amount_paid,discount,status,due_date,last_reminded_at,created_at,players(full_name),teams(name)').in('team_id', teamIds).order('created_at', { ascending: false });
      rows = (data ?? []).map((f: any) => ({
        Player: f.players?.full_name, Team: f.teams?.name, Fee: f.description,
        Invoiced: f.amount_due, Discount: f.discount, NetDue: Math.max(0, f.amount_due - f.discount),
        Paid: f.amount_paid, Balance: Math.max(0, f.amount_due - f.discount - f.amount_paid),
        Status: f.status, DueDate: f.due_date, LastReminded: f.last_reminded_at?.slice(0, 10) ?? '', Created: f.created_at?.slice(0, 10),
      }));
    } else if (type === 'payments') {
      const { data } = await supabase.from('fee_payments').select('amount,method,reference,paid_at,player_fees!inner(description,players(full_name),teams(name))').in('player_fee_id', (await supabase.from('player_fees').select('id').in('team_id', teamIds)).data?.map((f: any) => f.id) ?? []).order('paid_at', { ascending: false });
      rows = (data ?? []).map((p: any) => ({
        Player: p.player_fees?.players?.full_name, Team: p.player_fees?.teams?.name,
        Fee: p.player_fees?.description, Amount: p.amount, Method: p.method,
        Reference: p.reference ?? '', Date: p.paid_at?.slice(0, 10),
      }));
    } else if (type === 'events') {
      const { data } = await supabase.from('events').select('title,type,event_date,event_time,location,teams(name)').in('team_id', teamIds).order('event_date');
      rows = (data ?? []).map((e: any) => ({ Title: e.title, Type: e.type, Date: e.event_date, Time: e.event_time, Location: e.location, Team: e.teams?.name }));
    }
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${club?.name}-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '20px', alignItems: 'start' }}>

      {/* Sub-nav */}
      <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', position: 'sticky', top: '20px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {CLUB_SECTIONS.map(s => (
          <button key={s} onClick={() => setActive(s)} style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '8px 12px 8px 14px', borderRadius: '8px',
            background: active === s ? `${primary}12` : 'transparent',
            color: active === s ? primary : '#374151',
            borderTop: 'none', borderRight: 'none', borderBottom: 'none',
            borderLeft: active === s ? `3px solid ${primary}` : '3px solid transparent',
            cursor: 'pointer', fontSize: '13px',
            fontWeight: active === s ? '700' : '500', fontFamily: 'inherit',
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
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Your club&apos;s public-facing details</div>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <label style={labelStyle}>Club name *<input value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} style={{ ...inputStyle, marginTop: '5px' }} /></label>
                <label style={labelStyle}>URL slug *<input value={profileForm.slug} onChange={e => setProfileForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} style={{ ...inputStyle, marginTop: '5px' }} /></label>
              </div>
              <label style={labelStyle}>Tagline<input value={profileForm.tagline} onChange={e => setProfileForm(f => ({ ...f, tagline: e.target.value }))} placeholder="e.g. Developing players, building champions" style={{ ...inputStyle, marginTop: '5px' }} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <label style={labelStyle}>Website<input value={profileForm.website} onChange={e => setProfileForm(f => ({ ...f, website: e.target.value }))} placeholder="https://" style={{ ...inputStyle, marginTop: '5px' }} /></label>
                <label style={labelStyle}>Contact email<input type="email" value={profileForm.contact_email} onChange={e => setProfileForm(f => ({ ...f, contact_email: e.target.value }))} style={{ ...inputStyle, marginTop: '5px' }} /></label>
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
                <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '8px' }}>Applies to all fees and offer letters across the club.</div>
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
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '10px' }}>Club Logo</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '72px', height: '72px', borderRadius: '14px', border: '2px dashed #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#F8FAFC' }}>
                    {logoPreview ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Upload size={22} color="#CBD5E1" />}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Primary colour</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                    <input type="color" value={brandForm.primary_color} onChange={e => setBrandForm(f => ({ ...f, primary_color: e.target.value }))} style={{ width: '44px', height: '44px', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer', padding: '2px' }} />
                    <input value={brandForm.primary_color} onChange={e => setBrandForm(f => ({ ...f, primary_color: e.target.value }))} style={{ ...inputStyle, width: '120px' }} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Secondary colour</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                    <input type="color" value={brandForm.secondary_color} onChange={e => setBrandForm(f => ({ ...f, secondary_color: e.target.value }))} style={{ width: '44px', height: '44px', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer', padding: '2px' }} />
                    <input value={brandForm.secondary_color} onChange={e => setBrandForm(f => ({ ...f, secondary_color: e.target.value }))} style={{ ...inputStyle, width: '120px' }} />
                  </div>
                </div>
              </div>
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

        {active === 'Tryout Season' && (
          <div style={sectionCard}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Tryout Season</div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Show or hide the Tryouts section across the dashboard</div>
            </div>
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>
                    {tryoutsActive ? 'Tryout season is ON' : 'Tryout season is OFF'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6, maxWidth: '480px' }}>
                    {tryoutsActive
                      ? 'The Tryouts section is visible in the sidebar. Turn it off after tryout season to keep your dashboard focused.'
                      : 'The Tryouts section is hidden. Enable it when tryout season begins to unlock player registration, team builder, offers, and more.'}
                  </div>
                </div>
                <button
                  onClick={toggleTryouts}
                  disabled={savingTryouts}
                  style={{ flexShrink: 0, width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: tryoutsActive ? '#F59E0B' : '#E2E8F0', position: 'relative', transition: 'background 0.2s' }}
                >
                  <div style={{ position: 'absolute', top: '3px', width: '22px', height: '22px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: tryoutsActive ? '27px' : '3px' }} />
                </button>
              </div>
            </div>
          </div>
        )}

        {active === 'Payments' && (
          <div style={sectionCard}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CreditCard size={18} color={primary} />
              <div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Payment Settings</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Configure how parents pay fees online</div>
              </div>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Payout account status */}
              {(club as any)?.stripe_connect_onboarded ? (
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={16} color="#fff" strokeWidth={3} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#15803D' }}>Payouts connected</div>
                    <div style={{ fontSize: '12px', color: '#166534', marginTop: '2px' }}>Online payments are active. Funds go directly to your bank account.</div>
                  </div>
                </div>
              ) : (club as any)?.stripe_connect_account_id ? (
                <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '10px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertCircle size={16} color="#F59E0B" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400E' }}>Bank account setup incomplete</div>
                      <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>Finish connecting your bank account to start accepting online payments.</div>
                    </div>
                  </div>
                  <button
                    disabled={connectingStripe}
                    onClick={async () => {
                      setConnectingStripe(true);
                      const { data: { session } } = await supabase.auth.getSession();
                      const res = await fetch('/api/stripe/connect/init', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }, body: JSON.stringify({ club_id: club!.id }) });
                      const data = await res.json();
                      if (data.url) { window.location.href = data.url; } else { setConnectingStripe(false); showToast('error', data.error ?? 'Could not generate link.'); }
                    }}
                    style={{ flexShrink: 0, padding: '8px 18px', borderRadius: '7px', background: '#F59E0B', border: 'none', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: connectingStripe ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                  >
                    {connectingStripe ? 'Redirecting…' : 'Continue setup →'}
                  </button>
                </div>
              ) : (
                <div style={{ border: '1.5px dashed #CBD5E1', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${primary}15`, border: `1.5px solid ${primary}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CreditCard size={22} color={primary} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#0F172A' }}>Accept payments online</div>
                    <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '4px', maxWidth: '380px' }}>Connect your bank account to collect fees directly. Pulse FC handles security, compliance, and payouts.</div>
                  </div>
                  <div style={{ width: '100%', maxWidth: '400px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', textAlign: 'left' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', marginBottom: '8px' }}>What you&apos;ll need — takes about 5 minutes</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {[
                        'Your club\'s legal business name and EIN (tax ID)',
                        'Business address',
                        'Bank account details for payouts',
                        'A government-issued ID for identity verification',
                      ].map(item => (
                        <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: '#64748B' }}>
                          <span style={{ color: '#22C55E', fontWeight: '700', flexShrink: 0, marginTop: '1px' }}>✓</span>
                          {item}
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #E2E8F0', fontSize: '11px', color: '#94A3B8' }}>This is a one-time setup required by law. Once done, payments go directly to your bank account with no manual steps.</div>
                  </div>
                  <button
                    disabled={connectingStripe}
                    onClick={async () => {
                      setConnectingStripe(true);
                      const { data: { session } } = await supabase.auth.getSession();
                      const res = await fetch('/api/stripe/connect/init', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }, body: JSON.stringify({ club_id: club!.id }) });
                      const data = await res.json();
                      if (data.url) { window.location.href = data.url; } else { setConnectingStripe(false); showToast('error', data.error ?? 'Could not start setup.'); }
                    }}
                    style={{ padding: '10px 24px', borderRadius: '8px', background: primary, border: 'none', color: '#fff', fontSize: '13.5px', fontWeight: '700', cursor: connectingStripe ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '7px' }}
                  >
                    <CreditCard size={15} /> {connectingStripe ? 'Setting up…' : 'Connect bank account'}
                  </button>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>Money goes directly to your bank — Pulse FC never holds your funds.</div>
                </div>
              )}

              {/* Fee handling */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>Who covers transaction fees?</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px' }}>Online payment fees (~4.4% per transaction) are either absorbed by the club or passed entirely to parents — no manual percentages to set.</div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {(['absorb', 'pass_on'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setPaymentForm(f => ({ ...f, stripe_fee_handling: opt }))}
                      style={{
                        flex: 1, padding: '14px 16px', borderRadius: '10px', border: `2px solid ${paymentForm.stripe_fee_handling === opt ? primary : '#E2E8F0'}`,
                        background: paymentForm.stripe_fee_handling === opt ? `${primary}10` : '#F8FAFC',
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: '700', color: paymentForm.stripe_fee_handling === opt ? primary : '#374151', marginBottom: '4px' }}>
                        {opt === 'absorb' ? 'Club covers all fees' : 'Parents cover all fees'}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                        {opt === 'absorb'
                          ? 'Parents pay exactly the stated amount. Club absorbs ~4.4% in fees.'
                          : 'Parents pay a ~4.5% surcharge. Club nets the full fee amount.'}
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '11px', fontWeight: '700', color: paymentForm.stripe_fee_handling === opt ? primary : '#94A3B8' }}>
                        {opt === 'absorb' ? 'e.g. $100 fee → parent pays $100, club nets ~$95.60' : 'e.g. $100 fee → parent pays ~$104.50, club nets $100.00'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height: '1px', background: '#F1F5F9' }} />

              {/* Partial payments */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Allow partial payments</div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>Parents can choose to pay any amount up to the full balance. Useful for instalment arrangements.</div>
                </div>
                <button
                  onClick={() => setPaymentForm(f => ({ ...f, allow_partial_payments: !f.allow_partial_payments }))}
                  style={{ flexShrink: 0, width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: paymentForm.allow_partial_payments ? primary : '#E2E8F0', position: 'relative', transition: 'background 0.2s' }}
                >
                  <div style={{ position: 'absolute', top: '3px', width: '22px', height: '22px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: paymentForm.allow_partial_payments ? '27px' : '3px' }} />
                </button>
              </div>

              <div style={{ height: '1px', background: '#F1F5F9' }} />

              {/* What parents see */}
              <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '16px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>What parents experience</div>
                {[
                  'Email notification the moment a fee is assigned',
                  'Automated reminder every 7 days until paid',
                  'No login required — one click from the email to pay',
                  'Secure online checkout — card saved for future payments',
                  'Branded receipt email the moment payment clears',
                  'Fee marked paid automatically — nothing for you to do',
                ].map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '7px' }}>
                    <Check size={13} color="#22C55E" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: '#374151' }}>{f}</span>
                  </div>
                ))}
              </div>

              <div style={{ height: '1px', background: '#F1F5F9' }} />

              {/* Late fee automation */}
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', marginBottom: paymentForm.late_fee_enabled ? '14px' : '0' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Late fee automation</div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>Automatically add a penalty to overdue fees after a grace period. Applied once per fee at 2am daily.</div>
                  </div>
                  <button
                    onClick={() => setPaymentForm(f => ({ ...f, late_fee_enabled: !f.late_fee_enabled }))}
                    style={{ flexShrink: 0, width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: paymentForm.late_fee_enabled ? primary : '#E2E8F0', position: 'relative', transition: 'background 0.2s' }}
                  >
                    <div style={{ position: 'absolute', top: '3px', width: '22px', height: '22px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: paymentForm.late_fee_enabled ? '27px' : '3px' }} />
                  </button>
                </div>
                {paymentForm.late_fee_enabled && (
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Penalty type</div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {(['fixed', 'percent'] as const).map(t => (
                            <button key={t} onClick={() => setPaymentForm(f => ({ ...f, late_fee_type: t }))}
                              style={{ flex: 1, padding: '7px 10px', borderRadius: '7px', border: `1.5px solid ${paymentForm.late_fee_type === t ? primary : '#E2E8F0'}`, background: paymentForm.late_fee_type === t ? `${primary}10` : '#fff', fontSize: '12px', fontWeight: '700', color: paymentForm.late_fee_type === t ? primary : '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                              {t === 'fixed' ? 'Fixed $' : 'Percent %'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                          {paymentForm.late_fee_type === 'fixed' ? 'Penalty amount ($)' : 'Penalty amount (%)'}
                        </div>
                        <input type="number" min="0" step="0.01" value={paymentForm.late_fee_amount} onChange={e => setPaymentForm(f => ({ ...f, late_fee_amount: e.target.value }))}
                          style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '7px', padding: '8px 12px', fontSize: '13px', outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Grace period (days after due date)</div>
                      <input type="number" min="0" max="365" value={paymentForm.late_fee_grace_days} onChange={e => setPaymentForm(f => ({ ...f, late_fee_grace_days: e.target.value }))}
                        style={{ width: '120px', border: '1.5px solid #E2E8F0', borderRadius: '7px', padding: '8px 12px', fontSize: '13px', outline: 'none', fontFamily: 'inherit', background: '#fff' }} />
                      <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '5px' }}>
                        e.g. {paymentForm.late_fee_grace_days || 7} days grace → penalty applied on day {(parseInt(paymentForm.late_fee_grace_days) || 7) + 1}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ height: '1px', background: '#F1F5F9' }} />

              {/* Hardship fund */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Hardship fund</div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>Show an optional donation prompt on every payment page. Parents can add $5, $10, $25, or a custom amount to support teammates who need help with fees.</div>
                </div>
                <button
                  onClick={() => setPaymentForm(f => ({ ...f, hardship_fund_enabled: !f.hardship_fund_enabled }))}
                  style={{ flexShrink: 0, width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: paymentForm.hardship_fund_enabled ? primary : '#E2E8F0', position: 'relative', transition: 'background 0.2s' }}
                >
                  <div style={{ position: 'absolute', top: '3px', width: '22px', height: '22px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: paymentForm.hardship_fund_enabled ? '27px' : '3px' }} />
                </button>
              </div>

              <button
                onClick={savePayments}
                disabled={saving}
                style={{ alignSelf: 'flex-start', background: primary, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Save size={14} /> {saving ? 'Saving…' : 'Save payment settings'}
              </button>
            </div>
          </div>
        )}

        {active === 'Notifications' && (
          <div style={sectionCard}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Notification Preferences</div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>What Pulse FC sends automatically</div>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '0' }}>
              {[
                { label: 'New announcement posted',       sub: 'Push + email to all team members' },
                { label: 'Event RSVP deadline reminder',  sub: '24 hrs before lock time' },
                { label: 'Event cancelled or changed',    sub: 'Immediate push + email' },
                { label: 'Fee payment reminder',          sub: '3 days before due date' },
                { label: 'New player invited',            sub: 'Email to parent' },
              ].map(({ label, sub }, i, arr) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#0F172A' }}>{label}</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '1px' }}>{sub}</div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#22C55E', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', padding: '3px 8px' }}>ON</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', fontSize: '12px', color: '#94A3B8' }}>
              Individual preferences (mute, frequency) are managed in the mobile app under Settings → Notifications.
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
                { key: 'players',  label: 'Player Registry', desc: 'All players — name, position, team, DOB' },
                { key: 'fees',     label: 'Fee Report',      desc: 'All fees — invoiced, paid, balance, status, due date' },
                { key: 'payments', label: 'Payment History', desc: 'All recorded payments — amount, method, date (for accounting)' },
                { key: 'events',   label: 'Event History',   desc: 'All events — type, date, location, team' },
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
                Pulse FC is currently free while we validate with our first clubs. Pricing will be introduced later — you&apos;ll have plenty of notice before any charges apply.
              </div>
              <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>What&apos;s included</div>
                {['Unlimited teams & players', 'AI schedule import', 'AI roster import', 'Lineup builder', 'Parent communications', 'Push notifications', 'Fee tracking'].map(f => (
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
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#FFF5F5', borderRadius: '10px', border: '1px solid #FEE2E2' }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A' }}>Delete this club</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>Permanently removes all teams, players, events, and data. This cannot be undone.</div>
                </div>
                <button onClick={() => alert('Please contact support@pulse-fc.app to delete your club.')} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #EF4444', background: '#fff', fontSize: '13px', fontWeight: '700', color: '#EF4444', cursor: 'pointer', flexShrink: 0 }}>
                  Delete Club
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function SettingsPageInner() {
  const { club, profile } = useDashboard();
  const searchParams = useSearchParams();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const isAdmin = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  const connectParam  = searchParams.get('connect');
  const sectionParam  = searchParams.get('section');
  const initialTab    = searchParams.get('tab') === 'club' && isAdmin ? 'club' : 'account';

  const [tab, setTab] = useState<'account' | 'club'>(initialTab);
  const [toast, setToast] = useState<Toast | null>(null);

  function showToast(type: Toast['type'], msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    if (!connectParam) return;
    if (connectParam === 'success')    showToast('success', 'Payouts connected — you can now accept online payments.');
    if (connectParam === 'incomplete') showToast('error',   'Bank account setup not completed. Click "Continue setup" to finish.');
    if (connectParam === 'error')      showToast('error',   'Something went wrong. Please try connecting your bank account again.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectParam]);

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '28px', right: '28px', zIndex: 100, background: toast.type === 'success' ? '#0F172A' : '#DC2626', color: '#fff', borderRadius: '8px', padding: '13px 18px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', animation: 'slideUp 0.2s ease' }}>
          {toast.type === 'success' ? <Check size={16} color="#22C55E" strokeWidth={2.5} /> : <AlertCircle size={16} color="#fff" />}
          {toast.msg}
        </div>
      )}
      <style>{`
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin    { to   { transform: rotate(360deg); } }
      `}</style>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px 0' }}>
        <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Configuration</div>
        <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: '0 0 12px', letterSpacing: '-0.5px' }}>Settings</h1>

        {/* Tabs */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: '0' }}>
            {([
              { key: 'account', label: 'My Account', icon: <User size={14} /> },
              { key: 'club',    label: 'Club',        icon: <Building2 size={14} /> },
            ] as const).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 18px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '13.5px', fontWeight: tab === key ? '800' : '500',
                  color: tab === key ? primary : '#64748B',
                  borderBottom: tab === key ? `2px solid ${primary}` : '2px solid transparent',
                  marginBottom: '-3px',
                  transition: 'color 0.12s',
                  fontFamily: 'inherit',
                }}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '24px 32px' }}>
        {tab === 'account'
          ? <AccountTab primary={primary} showToast={showToast} />
          : <ClubTab primary={primary} showToast={showToast} initialSection={sectionParam ?? undefined} />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}
