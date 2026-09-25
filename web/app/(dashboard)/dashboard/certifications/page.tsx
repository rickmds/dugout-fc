'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, Clock, AlertTriangle, XCircle,
  CheckCircle, ChevronDown, ExternalLink, RefreshCw, Plus, Bell, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type CertStatus = 'pending' | 'verified' | 'rejected' | 'expired';

type Cert = {
  id: string;
  profile_id: string;
  cert_type: string;
  license_level: string | null;
  custom_label: string | null;
  expiry_date: string | null;
  doc_url: string | null;
  status: CertStatus;
  submitted_at: string;
  verified_by: string | null;
  verified_at: string | null;
  rejection_note: string | null;
  coach_name: string;
  coach_email: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CERT_LABELS: Record<string, string> = {
  background_check:  'Background Check',
  safesport:         'SafeSport',
  coaching_license:  'Coaching License',
  first_aid_cpr:     'First Aid / CPR',
  custom:            'Other',
};

const CERT_COLORS: Record<string, string> = {
  background_check: '#3B82F6',
  safesport:        '#8B5CF6',
  coaching_license: '#F59E0B',
  first_aid_cpr:    '#EF4444',
  custom:           '#6B7280',
};

const STATUS_CONFIG: Record<CertStatus, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: 'Pending review', bg: '#FEF3C7', color: '#92400E', icon: <Clock size={11} /> },
  verified: { label: 'Verified',       bg: '#F0FDF4', color: '#166534', icon: <CheckCircle size={11} /> },
  rejected: { label: 'Rejected',       bg: '#FEF2F2', color: '#991B1B', icon: <XCircle size={11} /> },
  expired:  { label: 'Expired',        bg: '#F9FAFB', color: '#6B7280', icon: <AlertTriangle size={11} /> },
};

type FilterKey = 'all' | 'pending' | 'verified' | 'expiring' | 'expired' | 'rejected';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ExpiryChip({ date }: { date: string | null }) {
  if (!date) return <span style={{ fontSize: '12px', color: '#94A3B8' }}>No expiry</span>;
  const d = daysUntil(date);
  const color = d === null ? '#94A3B8' : d < 0 ? '#EF4444' : d <= 14 ? '#F59E0B' : d <= 60 ? '#F97316' : '#22C55E';
  const label = d === null ? fmtDate(date) : d < 0 ? `Expired ${Math.abs(d)}d ago` : d === 0 ? 'Expires today' : `${d}d left`;
  return (
    <span style={{ fontSize: '12px', fontWeight: '700', color }}>
      {fmtDate(date)} <span style={{ fontWeight: '500', color }}>({label})</span>
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CertificationsPage() {
  const { club, profile } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [certs, setCerts]       = useState<Cert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<FilterKey>('all');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [saving, setSaving]     = useState<string | null>(null);
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null);

  // Admin-entered certs — a coach can only submit their own from mobile, so
  // an admin who's already seen the physical document (in person, over
  // email, whatever) had no way to log it on their behalf; it just had to
  // wait for the coach to do it themselves.
  const [staffList, setStaffList] = useState<{ id: string; full_name: string }[]>([]);
  const [showAddCert, setShowAddCert] = useState(false);
  const [addForm, setAddForm] = useState({ profile_id: '', cert_type: 'background_check', license_level: '', custom_label: '', expiry_date: '' });
  const [addSaving, setAddSaving] = useState(false);

  // Reminders — pending/expiring/expired certs had no nudge path at all;
  // an admin had to notice on this page and separately message the coach.
  const [reminding, setReminding] = useState<string | null>(null);
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());
  const [bulkReminding, setBulkReminding] = useState(false);

  const load = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('staff_certifications')
      .select(`
        id, profile_id, cert_type, license_level, custom_label,
        expiry_date, doc_url, status, submitted_at, verified_by,
        verified_at, rejection_note,
        profiles!staff_certifications_profile_id_fkey(full_name)
      `)
      .eq('club_id', club.id)
      .order('submitted_at', { ascending: false });

    if (!error && data) {
      // Also fetch emails
      const profileIds = [...new Set(data.map(r => r.profile_id))];
      const emailMap: Record<string, string> = {};
      if (profileIds.length) {
        const { data: users } = await supabase.rpc('get_staff_emails', { p_club_id: club.id });
        (users as { id: string; email: string }[] ?? []).forEach(u => { emailMap[u.id] = u.email; });
      }

      setCerts(data.map(r => ({
        ...r,
        coach_name: (r.profiles as unknown as { full_name: string } | null)?.full_name ?? 'Unknown',
        coach_email: emailMap[r.profile_id] ?? '',
      })));
    }
    setLoading(false);
  }, [club]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!club) return;
    supabase.from('profiles').select('id, full_name').eq('club_id', club.id).in('role', ['coach', 'org_admin']).order('full_name')
      .then(({ data }) => setStaffList((data ?? []) as { id: string; full_name: string }[]));
  }, [club]);

  // Auto-expire past-due verified certs
  useEffect(() => {
    if (!certs.length || !club) return;
    const toExpire = certs.filter(c =>
      c.status === 'verified' && c.expiry_date && daysUntil(c.expiry_date)! < 0
    );
    if (toExpire.length) {
      Promise.all(
        toExpire.map(c =>
          supabase.from('staff_certifications').update({ status: 'expired' }).eq('id', c.id)
        )
      ).then(() => load());
    }
  }, [certs, club, load]);

  async function verify(id: string) {
    if (!profile) return;
    setSaving(id);
    await supabase.from('staff_certifications').update({
      status: 'verified',
      verified_by: profile.id,
      verified_at: new Date().toISOString(),
      rejection_note: null,
    }).eq('id', id);
    setSaving(null);
    load();
  }

  async function reject(id: string) {
    if (!rejectNote.trim()) return;
    setSaving(id);
    await supabase.from('staff_certifications').update({
      status: 'rejected',
      rejection_note: rejectNote.trim(),
      verified_by: null,
      verified_at: null,
    }).eq('id', id);
    setSaving(null);
    setRejecting(null);
    setRejectNote('');
    load();
  }

  // Logged by the admin, not submitted by the coach — created straight as
  // verified, since the whole point is the admin already has the physical
  // document in hand. No doc_url: there's nothing to upload on the coach's
  // behalf, and the admin having seen it is the verification.
  async function addCertForCoach() {
    if (!club || !profile || !addForm.profile_id) return;
    setAddSaving(true);
    try {
      const { error } = await supabase.from('staff_certifications').insert({
        club_id: club.id,
        profile_id: addForm.profile_id,
        cert_type: addForm.cert_type,
        license_level: addForm.cert_type === 'coaching_license' ? (addForm.license_level || null) : null,
        custom_label: addForm.cert_type === 'custom' ? (addForm.custom_label || null) : null,
        expiry_date: addForm.expiry_date || null,
        status: 'verified',
        verified_by: profile.id,
        verified_at: new Date().toISOString(),
      });
      if (error) { alert(`Could not add certification: ${error.message}`); return; }
      setShowAddCert(false);
      setAddForm({ profile_id: '', cert_type: 'background_check', license_level: '', custom_label: '', expiry_date: '' });
      load();
    } finally {
      setAddSaving(false);
    }
  }

  async function sendReminder(certId: string) {
    setReminding(certId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/cert-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ cert_id: certId }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? 'Could not send reminder.'); return; }
      setRemindedIds(prev => new Set(prev).add(certId));
    } finally {
      setReminding(null);
    }
  }

  async function sendBulkReminders(ids: string[]) {
    setBulkReminding(true);
    try {
      for (const id of ids) {
        if (remindedIds.has(id)) continue;
        await sendReminder(id);
      }
    } finally {
      setBulkReminding(false);
    }
  }

  // ── Filter logic ──
  const filtered = certs.filter(c => {
    if (filter === 'all')      return true;
    if (filter === 'pending')  return c.status === 'pending';
    if (filter === 'verified') return c.status === 'verified';
    if (filter === 'rejected') return c.status === 'rejected';
    if (filter === 'expired')  return c.status === 'expired';
    if (filter === 'expiring') {
      if (c.status !== 'verified' || !c.expiry_date) return false;
      const d = daysUntil(c.expiry_date);
      return d !== null && d >= 0 && d <= 60;
    }
    return true;
  });

  // ── Counts ──
  const pending  = certs.filter(c => c.status === 'pending').length;
  const expiring = certs.filter(c => {
    if (c.status !== 'verified' || !c.expiry_date) return false;
    const d = daysUntil(c.expiry_date);
    return d !== null && d >= 0 && d <= 60;
  }).length;
  const expired  = certs.filter(c => c.status === 'expired').length;
  const verified = certs.filter(c => c.status === 'verified').length;

  // ── Group by coach ──
  const byCoach: Record<string, { name: string; certs: Cert[] }> = {};
  filtered.forEach(c => {
    if (!byCoach[c.profile_id]) byCoach[c.profile_id] = { name: c.coach_name, certs: [] };
    byCoach[c.profile_id].certs.push(c);
  });

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px' }}>
        <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Compliance</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Staff Certifications</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowAddCert(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: 'none', background: primary, fontSize: '12px', fontWeight: '700', color: '#fff', cursor: 'pointer' }}>
              <Plus size={12} /> Add Certification
            </button>
            <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12px', fontWeight: '600', color: '#374151', cursor: 'pointer' }}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94A3B8' }}>Coaches submit their own certs, or you can log one on their behalf</p>
      </div>

      <div style={{ padding: '24px 32px' }}>

        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Verified',       value: verified,  color: '#22C55E', bg: '#F0FDF4', border: '#BBF7D0', icon: <ShieldCheck size={16} color="#22C55E" /> },
            { label: 'Pending review', value: pending,   color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', icon: <Clock size={16} color="#F59E0B" /> },
            { label: 'Expiring ≤60d',  value: expiring,  color: '#F97316', bg: '#FFF7ED', border: '#FED7AA', icon: <AlertTriangle size={16} color="#F97316" /> },
            { label: 'Expired',        value: expired,   color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', icon: <XCircle size={16} color="#EF4444" /> },
          ].map(({ label, value, color, bg, border, icon }) => (
            <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {icon}
              <div>
                <div style={{ fontSize: '22px', fontWeight: '900', color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '11px', fontWeight: '600', color, opacity: 0.7, marginTop: '2px' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#fff', padding: '4px', borderRadius: '10px', border: '1px solid #E2E8F0', width: 'fit-content' }}>
          {([
            { key: 'all',      label: 'All',          count: certs.length },
            { key: 'pending',  label: 'Pending',       count: pending,  alert: true },
            { key: 'verified', label: 'Verified',      count: verified },
            { key: 'expiring', label: 'Expiring soon', count: expiring, alert: expiring > 0 },
            { key: 'expired',  label: 'Expired',       count: expired,  alert: expired > 0 },
            { key: 'rejected', label: 'Rejected',      count: certs.filter(c => c.status === 'rejected').length },
          ] as { key: FilterKey; label: string; count: number; alert?: boolean }[]).map(({ key, label, count, alert }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                background: filter === key ? primary : 'transparent',
                color: filter === key ? '#fff' : '#374151',
                fontSize: '12.5px', fontWeight: filter === key ? '700' : '500',
                fontFamily: 'inherit', transition: 'background 0.12s',
              }}
            >
              {label}
              <span style={{
                fontSize: '11px', fontWeight: '700',
                background: filter === key ? 'rgba(255,255,255,0.25)' : (alert && count > 0 ? '#EF4444' : '#F1F5F9'),
                color: filter === key ? '#fff' : (alert && count > 0 ? '#fff' : '#64748B'),
                borderRadius: '10px', padding: '1px 7px',
              }}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {(filter === 'pending' || filter === 'expiring' || filter === 'expired') && filtered.length > 0 && (
          <button
            onClick={() => sendBulkReminders(filtered.map(c => c.id))}
            disabled={bulkReminding || filtered.every(c => remindedIds.has(c.id))}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', padding: '8px 16px', borderRadius: '8px', border: '1px solid #FDE68A', background: '#FFFBEB', fontSize: '12.5px', fontWeight: '700', color: '#92400E', cursor: bulkReminding ? 'default' : 'pointer', opacity: bulkReminding ? 0.6 : 1 }}
          >
            <Bell size={13} /> {bulkReminding ? 'Sending…' : `Remind all ${filtered.length} coach${filtered.length !== 1 ? 'es' : ''}`}
          </button>
        )}

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8', fontSize: '14px' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '60px 32px', textAlign: 'center' }}>
            <ShieldCheck size={32} color="#E2E8F0" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>
              {filter === 'all' ? 'No certifications submitted yet' : `No ${filter} certifications`}
            </div>
            <div style={{ fontSize: '13px', color: '#94A3B8' }}>
              Coaches submit their certifications from the mobile app under Settings → My Certifications.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(byCoach).map(([profileId, { name, certs: coachCerts }]) => {
              const isExpanded = expandedCoach === profileId || Object.keys(byCoach).length === 1;
              const pendingCount = coachCerts.filter(c => c.status === 'pending').length;
              return (
                <div key={profileId} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>

                  {/* Coach header */}
                  <button
                    onClick={() => setExpandedCoach(isExpanded && Object.keys(byCoach).length > 1 ? null : profileId)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                  >
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: '#fff', flexShrink: 0 }}>
                      {name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{name}</div>
                      <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '1px' }}>{coachCerts.length} certification{coachCerts.length !== 1 ? 's' : ''}</div>
                    </div>
                    {pendingCount > 0 && (
                      <span style={{ fontSize: '11px', fontWeight: '800', background: '#FEF3C7', color: '#92400E', borderRadius: '10px', padding: '3px 10px', border: '1px solid #FDE68A' }}>
                        {pendingCount} pending
                      </span>
                    )}
                    <ChevronDown size={16} color="#94A3B8" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>

                  {/* Cert rows */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #F1F5F9' }}>
                      {coachCerts.map((cert, i) => {
                        const sc = STATUS_CONFIG[cert.status];
                        const typeColor = CERT_COLORS[cert.cert_type] ?? '#6B7280';
                        const certLabel = cert.cert_type === 'custom'
                          ? (cert.custom_label ?? 'Other')
                          : cert.cert_type === 'coaching_license' && cert.license_level
                          ? `${cert.license_level} License`
                          : CERT_LABELS[cert.cert_type];

                        return (
                          <div key={cert.id}>
                            {i > 0 && <div style={{ height: '1px', background: '#F8FAFC' }} />}
                            <div style={{ padding: '14px 20px 14px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>

                                {/* Cert type pill */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', background: `${typeColor}12`, border: `1px solid ${typeColor}25`, flexShrink: 0, marginTop: '2px' }}>
                                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: typeColor }} />
                                  <span style={{ fontSize: '11.5px', fontWeight: '700', color: typeColor }}>{certLabel}</span>
                                </div>

                                {/* Details */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', background: sc.bg, color: sc.color, borderRadius: '6px', padding: '2px 8px' }}>
                                      {sc.icon} {sc.label}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '12px', color: '#64748B' }}>
                                      Submitted {fmtDate(cert.submitted_at)}
                                    </span>
                                    <ExpiryChip date={cert.expiry_date} />
                                  </div>
                                  {cert.status === 'rejected' && cert.rejection_note && (
                                    <div style={{ marginTop: '6px', padding: '8px 10px', background: '#FEF2F2', borderRadius: '6px', fontSize: '12px', color: '#991B1B', border: '1px solid #FECACA' }}>
                                      Rejection note: {cert.rejection_note}
                                    </div>
                                  )}
                                  {cert.status === 'verified' && cert.verified_at && (
                                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#94A3B8' }}>
                                      Verified {fmtDate(cert.verified_at)}
                                    </div>
                                  )}
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                  {cert.doc_url && (
                                    <a
                                      href={cert.doc_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12px', fontWeight: '600', color: '#374151', textDecoration: 'none' }}
                                    >
                                      <ExternalLink size={11} /> View doc
                                    </a>
                                  )}

                                  {(cert.status === 'pending' || cert.status === 'expired' || (cert.status === 'verified' && (() => { const d = daysUntil(cert.expiry_date); return d !== null && d >= 0 && d <= 60; })())) && (
                                    <button
                                      onClick={() => sendReminder(cert.id)}
                                      disabled={reminding === cert.id || remindedIds.has(cert.id)}
                                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: '1px solid #FDE68A', background: remindedIds.has(cert.id) ? '#FFFBEB' : '#fff', fontSize: '12px', fontWeight: '600', color: '#92400E', cursor: reminding === cert.id ? 'default' : 'pointer', opacity: reminding === cert.id ? 0.6 : 1 }}
                                    >
                                      <Bell size={11} /> {reminding === cert.id ? '…' : remindedIds.has(cert.id) ? 'Reminded' : 'Remind'}
                                    </button>
                                  )}

                                  {cert.status === 'pending' && (
                                    <>
                                      <button
                                        onClick={() => verify(cert.id)}
                                        disabled={saving === cert.id}
                                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', borderRadius: '7px', border: 'none', background: '#22C55E', fontSize: '12px', fontWeight: '700', color: '#fff', cursor: 'pointer', opacity: saving === cert.id ? 0.6 : 1 }}
                                      >
                                        <CheckCircle size={12} /> {saving === cert.id ? '…' : 'Verify'}
                                      </button>
                                      <button
                                        onClick={() => { setRejecting(cert.id); setRejectNote(''); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', border: '1px solid #FECACA', background: '#FEF2F2', fontSize: '12px', fontWeight: '600', color: '#EF4444', cursor: 'pointer' }}
                                      >
                                        <XCircle size={12} /> Reject
                                      </button>
                                    </>
                                  )}

                                  {cert.status === 'verified' && (
                                    <button
                                      onClick={() => { if (confirm('Revoke this verification?')) verify(cert.id); }}
                                      style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12px', fontWeight: '600', color: '#94A3B8', cursor: 'pointer' }}
                                    >
                                      Revoke
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Rejection note form */}
                              {rejecting === cert.id && (
                                <div style={{ marginTop: '12px', padding: '14px', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FECACA' }}>
                                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#991B1B', marginBottom: '8px' }}>Rejection reason (shown to coach)</div>
                                  <textarea
                                    value={rejectNote}
                                    onChange={e => setRejectNote(e.target.value)}
                                    placeholder="e.g. Document is unreadable, please re-upload a clearer photo"
                                    style={{ width: '100%', minHeight: '72px', padding: '10px', borderRadius: '6px', border: '1px solid #FECACA', fontSize: '13px', color: '#0F172A', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                                    autoFocus
                                  />
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                    <button onClick={() => reject(cert.id)} disabled={!rejectNote.trim() || saving === cert.id} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: '#EF4444', fontSize: '12.5px', fontWeight: '700', color: '#fff', cursor: 'pointer', opacity: !rejectNote.trim() || saving === cert.id ? 0.5 : 1 }}>
                                      {saving === cert.id ? 'Saving…' : 'Send rejection'}
                                    </button>
                                    <button onClick={() => setRejecting(null)} style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '12.5px', fontWeight: '600', color: '#64748B', cursor: 'pointer' }}>
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddCert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={() => setShowAddCert(false)}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#0F172A' }}>Log a certification</div>
              <button onClick={() => setShowAddCert(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex' }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: '12.5px', color: '#94A3B8', margin: '0 0 16px' }}>
              For a document a coach already gave you directly — saved straight as verified.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>Coach</label>
                <select value={addForm.profile_id} onChange={e => setAddForm(f => ({ ...f, profile_id: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1.5px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                  <option value="">Select a coach…</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>Certification type</label>
                <select value={addForm.cert_type} onChange={e => setAddForm(f => ({ ...f, cert_type: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1.5px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                  {Object.entries(CERT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {addForm.cert_type === 'coaching_license' && (
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>License level</label>
                  <input value={addForm.license_level} onChange={e => setAddForm(f => ({ ...f, license_level: e.target.value }))} placeholder="e.g. D License"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1.5px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              )}
              {addForm.cert_type === 'custom' && (
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>Label</label>
                  <input value={addForm.custom_label} onChange={e => setAddForm(f => ({ ...f, custom_label: e.target.value }))} placeholder="e.g. Concussion Awareness"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1.5px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              )}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '5px' }}>Expiry date (optional)</label>
                <input type="date" value={addForm.expiry_date} onChange={e => setAddForm(f => ({ ...f, expiry_date: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1.5px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowAddCert(false)} style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={addCertForCoach} disabled={addSaving || !addForm.profile_id} style={{ padding: '9px 16px', borderRadius: '9px', border: 'none', background: addForm.profile_id ? primary : '#CBD5E1', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: addForm.profile_id ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                {addSaving ? 'Saving…' : 'Add as verified'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
