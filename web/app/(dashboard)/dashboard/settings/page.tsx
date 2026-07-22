'use client';

import { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, Check, AlertCircle, Lock, User, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type Toast = { type: 'success' | 'error'; msg: string };

export default function SettingsPage() {
  const { profile, club, reload } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  // Profile
  const [fullName, setFullName]     = useState(profile?.full_name ?? '');
  const [email, setEmail]           = useState('');

  // Password
  const [newPass, setNewPass]       = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNew, setShowNew]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Tryout season toggle
  const [tryoutsActive,   setTryoutsActive]   = useState(club?.tryouts_active ?? false);
  const [savingTryouts,   setSavingTryouts]   = useState(false);

  // State
  const [saving, setSaving]         = useState('');
  const [toast, setToast]           = useState<Toast | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });
    setFullName(profile?.full_name ?? '');
    setTryoutsActive(club?.tryouts_active ?? false);
  }, [profile, club]);

  function showToast(type: Toast['type'], msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Tryout season toggle ───────────────────────────────────────────────────
  async function toggleTryouts() {
    if (!club) return;
    setSavingTryouts(true);
    const next = !tryoutsActive;
    await supabase.from('clubs').update({ tryouts_active: next }).eq('id', club.id);
    setTryoutsActive(next);
    reload();
    setSavingTryouts(false);
    showToast('success', `Tryout season ${next ? 'enabled' : 'disabled'}`);
  }

  // ── Save profile ───────────────────────────────────────────────────────────
  async function saveProfile() {
    if (!profile || !fullName.trim()) return;
    setSaving('profile');
    await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', profile.id);
    reload();
    setSaving('');
    showToast('success', 'Profile saved');
  }

  // ── Change password ────────────────────────────────────────────────────────
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
    <div style={{ background: '#F0F2F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '28px', right: '28px', zIndex: 100,
          background: toast.type === 'success' ? '#0F172A' : '#DC2626',
          color: '#fff', borderRadius: '8px', padding: '13px 18px',
          display: 'flex', alignItems: 'center', gap: '10px',
          fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          animation: 'slideUp 0.2s ease',
        }}>
          {toast.type === 'success'
            ? <Check size={16} color="#22C55E" strokeWidth={2.5} />
            : <AlertCircle size={16} color="#fff" />}
          {toast.msg}
        </div>
      )}
      <style>{`
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px' }}>
        <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Account</div>
        <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Settings</h1>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94A3B8' }}>Manage your profile and password</p>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: '672px' }}>

        {/* ── Profile ───────────────────────────────────────────────────────── */}
        <Card icon={<User size={16} color={primary} />} title="My Profile" sub="Your display name across the dashboard">

        {/* Name */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelSt}>Full name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" style={inputSt} />
        </div>

        {/* Email (read-only) */}
        <div style={{ marginBottom: '20px' }}>
          <label style={labelSt}>Email address</label>
          <div style={{ ...inputSt, background: '#F8FAFC', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={13} color="#CBD5E1" />
            {email || 'Loading…'}
          </div>
          <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Email cannot be changed here — contact support if needed</p>
        </div>

        <SaveButton label="Save profile" saving={saving === 'profile'} primary={primary} onClick={saveProfile} />
      </Card>

      {/* ── Tryout Season (org_admin only) ────────────────────────────── */}
      {(profile?.role === 'org_admin' || profile?.role === 'app_admin') && (
        <Card icon={<Target size={16} color="#F59E0B" />} title="Tryout Season" sub="Show or hide the Tryouts section across the dashboard">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', marginBottom: '4px' }}>
                {tryoutsActive ? 'Tryout season is ON' : 'Tryout season is OFF'}
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', lineHeight: 1.6 }}>
                {tryoutsActive
                  ? 'The Tryouts section is visible in the sidebar. Turn it off after tryout season to keep your dashboard focused.'
                  : 'The Tryouts section is hidden. Enable it when tryout season begins to unlock player registration, team builder, offers, and more.'}
              </div>
            </div>
            <button
              onClick={toggleTryouts}
              disabled={savingTryouts}
              style={{
                flexShrink: 0, width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                background: tryoutsActive ? '#F59E0B' : '#E2E8F0', position: 'relative', transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: '3px', width: '22px', height: '22px', borderRadius: '50%',
                background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                transition: 'left 0.2s', left: tryoutsActive ? '27px' : '3px',
              }} />
            </button>
          </div>
        </Card>
      )}

      {/* ── Password ──────────────────────────────────────────────────────── */}
      <Card icon={<Lock size={16} color="#8B5CF6" />} title="Password" sub="Update your sign-in password">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
          <div>
            <label style={labelSt}>New password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNew ? 'text' : 'password'}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="At least 8 characters"
                style={{ ...inputSt, paddingRight: '40px' }}
              />
              <button onClick={() => setShowNew((v) => !v)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: '#94A3B8' }}>
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label style={labelSt}>Confirm new password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="Repeat your new password"
                style={{ ...inputSt, paddingRight: '40px', borderColor: confirmPass && confirmPass !== newPass ? '#EF4444' : undefined }}
              />
              <button onClick={() => setShowConfirm((v) => !v)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: '#94A3B8' }}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPass && confirmPass !== newPass && (
              <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>Passwords don't match</p>
            )}
          </div>
        </div>
        <SaveButton label="Update password" saving={saving === 'password'} primary="#8B5CF6" onClick={changePassword} disabled={!newPass || newPass !== confirmPass || newPass.length < 8} />
        </Card>
      </div>
    </div>
  );
}

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
      <div style={{ padding: '24px' }}>
        {children}
      </div>
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
