'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Copy, ExternalLink, Trash2, Pencil, Archive, ArchiveRestore,
  Calendar, Users, Clock, CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  RefreshCw, Mail, Lock, Unlock, Star, Tag, X, TrendingUp, RotateCcw,
  DollarSign, Percent,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { STATUS_STYLES, PAY_STATUS_STYLES, fmtMoney, fmtDate, formFields, uid, labelSt, inputSt, playerName, parentEmail } from './shared';
import type { RegForm, PromoCode, DiscountType, PaymentStatus } from './shared';
import FormBuilder from './FormBuilder';
import SeasonRolloverWizard from './SeasonRolloverWizard';

// ── Local types ───────────────────────────────────────────────────────────────
type SubmissionRow = {
  id: string;
  data: Record<string, string>;
  status: string;
  payment_status: PaymentStatus;
  amount_due: number | null;
  amount_paid: number;
  refunded_amount: number;
  refund_notes: string | null;
  submitted_at: string;
  promo_code_used: string | null;
  discount_applied: number;
  financial_aid_amount: number | null;
};
type RefundMode = 'full' | 'partial' | 'percent';

export default function FormsTab() {
  const { profile, club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const isOrgAdmin = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  type SubView = 'list' | 'create' | 'archive' | 'rollover';
  const [subView, setSubView]       = useState<SubView>('list');
  const [editingForm, setEditingForm] = useState<RegForm | null>(null);
  const [forms, setForms]           = useState<RegForm[]>([]);
  const [loading, setLoading]       = useState(true);
  const [copied, setCopied]         = useState<string | null>(null);
  const [delConfirm, setDelConfirm] = useState<RegForm | null>(null);
  const [lateInviteForm, setLateInviteForm] = useState<RegForm | null>(null);
  const [lateEmails, setLateEmails] = useState('');
  const [lateSending, setLateSending] = useState(false);
  const [lateError, setLateError]   = useState('');
  const [schedulingForm, setSchedulingForm] = useState<RegForm | null>(null);
  const [schedOpenAt, setSchedOpenAt] = useState('');
  const [schedCloseAt, setSchedCloseAt] = useState('');
  const [schedSaving, setSchedSaving] = useState(false);
  const [earlyForm, setEarlyForm]   = useState<RegForm | null>(null);
  const [earlyDate, setEarlyDate]   = useState('');
  const [earlySaving, setEarlySaving] = useState(false);
  const [setupChecklist, setSetupChecklist] = useState<RegForm | null>(null);
  const [promoForm, setPromoForm]           = useState<RegForm | null>(null);

  // ── Expand / stats ────────────────────────────────────────────────────────────
  const [expandedId,       setExpandedId]       = useState<string | null>(null);
  const [formSubs,         setFormSubs]         = useState<Record<string, SubmissionRow[]>>({});
  const [formSubsLoading,  setFormSubsLoading]  = useState<string | null>(null);

  // ── Refund modal ──────────────────────────────────────────────────────────────
  const [showRefund,   setShowRefund]   = useState<{ sub: SubmissionRow; form: RegForm } | null>(null);
  const [refundMode,   setRefundMode]   = useState<RefundMode>('full');
  const [refundInput,  setRefundInput]  = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);

  async function toggleExpand(formId: string) {
    if (expandedId === formId) { setExpandedId(null); return; }
    setExpandedId(formId);
    if (formSubs[formId]) return;
    setFormSubsLoading(formId);
    const { data } = await supabase
      .from('registration_submissions')
      .select('id,data,status,payment_status,amount_due,amount_paid,refunded_amount,refund_notes,submitted_at,promo_code_used,discount_applied,financial_aid_amount')
      .eq('form_id', formId)
      .order('submitted_at', { ascending: false });
    setFormSubs(prev => ({ ...prev, [formId]: (data ?? []) as SubmissionRow[] }));
    setFormSubsLoading(null);
  }

  function openRefund(sub: SubmissionRow, form: RegForm) {
    setShowRefund({ sub, form });
    setRefundMode('full');
    setRefundInput('');
    setRefundReason('');
  }

  function calcRefundAmount(sub: SubmissionRow): number {
    const maxRefundable = (sub.amount_paid ?? 0) - (sub.refunded_amount ?? 0);
    if (refundMode === 'full') return maxRefundable;
    if (refundMode === 'partial') return Math.min(parseFloat(refundInput) || 0, maxRefundable);
    if (refundMode === 'percent') return Math.round((parseFloat(refundInput) || 0) / 100 * maxRefundable * 100) / 100;
    return 0;
  }

  async function processRefund() {
    if (!showRefund) return;
    const { sub, form } = showRefund;
    const amount = calcRefundAmount(sub);
    if (amount <= 0) return;
    setRefundSaving(true);
    try {
      const newRefunded = (sub.refunded_amount ?? 0) + amount;
      const netPaid     = (sub.amount_paid ?? 0) - newRefunded;
      const newStatus: PaymentStatus = netPaid <= 0 ? 'refunded' : sub.payment_status;
      const { error } = await supabase.from('registration_submissions')
        .update({ refunded_amount: newRefunded, refund_notes: refundReason || null, payment_status: newStatus })
        .eq('id', sub.id);
      if (error) { alert(`Refund failed: ${error.message}`); return; }
      setFormSubs(prev => ({
        ...prev,
        [form.id]: (prev[form.id] ?? []).map(s =>
          s.id === sub.id ? { ...s, refunded_amount: newRefunded, refund_notes: refundReason || null, payment_status: newStatus } : s
        ),
      }));
      setShowRefund(null);
    } finally {
      setRefundSaving(false);
    }
  }

  function formStats(subs: SubmissionRow[]) {
    const active    = subs.filter(s => s.status !== 'declined');
    const income    = subs.reduce((t, s) => t + (s.amount_paid ?? 0), 0);
    const refunded  = subs.reduce((t, s) => t + (s.refunded_amount ?? 0), 0);
    const outstanding = subs.reduce((t, s) => {
      if (s.payment_status === 'refunded' || s.payment_status === 'paid') return t;
      return t + Math.max((s.amount_due ?? 0) - (s.amount_paid ?? 0), 0);
    }, 0);
    return { registered: active.length, income, refunded, outstanding };
  }

  const loadForms = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    const { data } = await supabase
      .from('registration_forms')
      .select('*')
      .eq('club_id', club.id)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    const withCounts = await Promise.all(data.map(async (f) => {
      const { count } = await supabase
        .from('registration_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('form_id', f.id);
      return { ...f, submission_count: count ?? 0 };
    }));
    setForms(withCounts as RegForm[]);
    setLoading(false);
  }, [club]);

  useEffect(() => { loadForms(); }, [loadForms]);

  function copy(token: string) {
    const url = `${window.location.origin}/register/${token}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(token); setTimeout(() => setCopied(null), 2000); });
  }

  async function updateStatus(id: string, status: RegForm['status']) {
    await supabase.from('registration_forms').update({ status }).eq('id', id);
    setForms((p) => p.map((f) => f.id === id ? { ...f, status } : f));
  }

  async function archiveForm(id: string) {
    await supabase.from('registration_forms').update({ archived: true, status: 'closed' }).eq('id', id);
    setForms((p) => p.filter((f) => f.id !== id));
  }

  async function deleteForm(id: string) {
    await supabase.from('registration_submissions').delete().eq('form_id', id);
    await supabase.from('registration_forms').delete().eq('id', id);
    setForms((p) => p.filter((f) => f.id !== id));
    setDelConfirm(null);
  }

  async function duplicateForm(form: RegForm) {
    if (!club) return;
    const year = new Date().getFullYear();
    const { data } = await supabase.from('registration_forms').insert({
      club_id: club.id,
      team_id: form.team_id,
      title: `${form.title} (copy)`,
      description: form.description,
      fields: form.fields,
      status: 'draft',
      max_spots: form.max_spots,
      confirmation_message: form.confirmation_message,
      send_confirmation_email: form.send_confirmation_email,
      price: form.price,
      currency: form.currency,
      payment_options: form.payment_options,
      plan_installments: form.plan_installments,
      plan_frequency: form.plan_frequency,
      plan_deposit: form.plan_deposit,
      price_mode: form.price_mode,
      price_tiers: form.price_tiers,
      financial_aid_enabled: form.financial_aid_enabled,
      field_logic: form.field_logic,
      volunteer_slots: form.volunteer_slots,
      required_docs: form.required_docs,
      season_label: String(year),
      created_by: profile?.id,
    }).select('*').single();
    if (data) setForms((p) => [{ ...data, submission_count: 0 } as RegForm, ...p]);
  }

  async function saveLateInvites() {
    if (!lateInviteForm || !club) return;
    const emails = lateEmails.split(/[\n,;]/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'));
    if (!emails.length) { setLateError('Enter at least one email address.'); return; }
    setLateSending(true); setLateError('');
    const rows = emails.map((email) => ({
      form_id: lateInviteForm.id,
      email,
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    }));
    const { error } = await supabase.from('registration_late_invites').insert(rows);
    if (error) { setLateError(error.message); setLateSending(false); return; }
    // Send emails via API
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/registrations/late-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ form_id: lateInviteForm.id, emails }),
      });
    } catch {/* non-fatal */}
    setLateSending(false);
    setLateInviteForm(null);
    setLateEmails('');
  }

  async function saveScheduling() {
    if (!schedulingForm) return;
    setSchedSaving(true);
    await supabase.from('registration_forms').update({
      open_at: schedOpenAt || null,
      close_at: schedCloseAt || null,
    }).eq('id', schedulingForm.id);
    setForms((p) => p.map((f) => f.id === schedulingForm.id ? { ...f, open_at: schedOpenAt || null, close_at: schedCloseAt || null } : f));
    setSchedSaving(false);
    setSchedulingForm(null);
  }

  async function saveEarlyAccess() {
    if (!earlyForm) return;
    setEarlySaving(true);
    await supabase.from('registration_forms').update({ early_access_ends_at: earlyDate || null }).eq('id', earlyForm.id);
    setForms((p) => p.map((f) => f.id === earlyForm.id ? { ...f, early_access_ends_at: earlyDate || null } : f));
    setEarlySaving(false);
    setEarlyForm(null);
  }

  const teamName = (id: string | null) => id ? teams.find((t) => t.id === id)?.name ?? '—' : 'All teams';

  if (subView === 'create' || editingForm) {
    return (
      <FormBuilder
        editingForm={editingForm}
        onDone={() => { setEditingForm(null); setSubView('list'); loadForms(); }}
        onCancel={() => { setEditingForm(null); setSubView('list'); }}
      />
    );
  }

  if (subView === 'archive') {
    return <ArchiveView onBack={() => setSubView('list')} />;
  }

  if (subView === 'rollover') {
    return <SeasonRolloverWizard forms={forms} onDone={() => { setSubView('list'); loadForms(); }} onCancel={() => setSubView('list')} />;
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1000px' }}>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .reg-sub-row:hover { background: #F8FAFC !important; }
      `}</style>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Registration forms</h2>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 0' }}>{forms.length} active form{forms.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setSubView('archive')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Archive size={13} /> Archive
        </button>
        {isOrgAdmin && forms.length > 0 && (
          <button onClick={() => setSubView('rollover')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
            <RefreshCw size={13} /> Season rollover
          </button>
        )}
        <button onClick={() => setSubView('create')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '11px 18px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={15} /> New form
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>Loading…</div>
      ) : forms.length === 0 ? (
        <EmptyState onNew={() => setSubView('create')} primary={primary} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {forms.map((form) => {
            const s = STATUS_STYLES[form.status];
            const isNearCapacity = form.max_spots && form.submission_count ? (form.submission_count / form.max_spots) >= 0.8 : false;
            const isFull         = form.max_spots && form.submission_count ? form.submission_count >= form.max_spots : false;
            const hasSchedule    = form.open_at || form.close_at;
            const hasEarlyAccess = form.early_access_ends_at && new Date(form.early_access_ends_at) > new Date();

            const isExpanded    = expandedId === form.id;
            const subs          = formSubs[form.id] ?? [];
            const subsLoading   = formSubsLoading === form.id;
            const stats         = isExpanded && subs.length > 0 ? formStats(subs) : null;
            const currency      = form.currency ?? 'USD';
            const sym           = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';

            return (
              <div key={form.id} style={{ background: '#fff', border: `1.5px solid ${isFull ? '#FECACA' : '#E2E8F0'}`, borderRadius: '14px', overflow: 'hidden', transition: 'border-color 0.15s', boxShadow: isExpanded ? `0 0 0 2px ${primary}30` : 'none' }}>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>{form.title}</span>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: s.color, background: s.bg, borderRadius: '20px', padding: '2px 9px' }}>{s.label}</span>
                        {hasEarlyAccess && <span style={{ fontSize: '11px', fontWeight: '700', color: '#0891B2', background: '#ECFEFF', borderRadius: '20px', padding: '2px 9px', display: 'flex', alignItems: 'center', gap: '3px' }}><Star size={9} /> Early access</span>}
                        {isFull     && <span style={{ fontSize: '11px', fontWeight: '700', color: '#DC2626', background: '#FEE2E2', borderRadius: '20px', padding: '2px 9px' }}>Full</span>}
                        {isNearCapacity && !isFull && <span style={{ fontSize: '11px', fontWeight: '700', color: '#D97706', background: '#FEF3C7', borderRadius: '20px', padding: '2px 9px' }}>Nearly full</span>}
                        {form.price && <span style={{ fontSize: '11px', fontWeight: '700', color: '#16A34A', background: '#DCFCE7', borderRadius: '20px', padding: '2px 9px' }}>{fmtMoney(form.price, form.currency)}</span>}
                      </div>
                      {/* Meta */}
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#94A3B8', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={11} /> {form.submission_count ?? 0}{form.max_spots ? ` / ${form.max_spots}` : ''} registrations</span>
                        <span>{teamName(form.team_id)}</span>
                        {form.deadline && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> Deadline {fmtDate(form.deadline)}</span>}
                        {hasSchedule && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={11} /> Scheduled</span>}
                        {form.season_label && <span>{form.season_label}</span>}
                      </div>
                      {/* Capacity bar */}
                      {form.max_spots && (form.submission_count ?? 0) > 0 && (
                        <div style={{ marginTop: '8px' }}>
                          <div style={{ height: '4px', background: '#F1F5F9', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, Math.round(((form.submission_count ?? 0) / form.max_spots) * 100))}%`, background: isFull ? '#DC2626' : isNearCapacity ? '#D97706' : primary, borderRadius: '2px', transition: 'width 0.3s' }} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                      {/* Status toggle */}
                      {form.status === 'open' ? (
                        <button onClick={() => updateStatus(form.id, 'closed')} title="Close form" style={{ padding: '7px', background: '#FEE2E2', border: 'none', borderRadius: '7px', cursor: 'pointer', color: '#DC2626', display: 'flex' }}>
                          <Lock size={13} />
                        </button>
                      ) : form.status === 'closed' ? (
                        <button onClick={() => updateStatus(form.id, 'open')} title="Open form" style={{ padding: '7px', background: '#DCFCE7', border: 'none', borderRadius: '7px', cursor: 'pointer', color: '#16A34A', display: 'flex' }}>
                          <Unlock size={13} />
                        </button>
                      ) : (
                        <button onClick={() => updateStatus(form.id, 'open')} title="Publish" style={{ padding: '7px', background: '#DCFCE7', border: 'none', borderRadius: '7px', cursor: 'pointer', color: '#16A34A', display: 'flex' }}>
                          <Unlock size={13} />
                        </button>
                      )}
                      <button onClick={() => copy(form.token)} title="Copy link" style={{ padding: '7px', background: copied === form.token ? '#DCFCE7' : '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '7px', cursor: 'pointer', color: copied === form.token ? '#16A34A' : '#64748B', display: 'flex' }}>
                        {copied === form.token ? <CheckCircle size={13} /> : <Copy size={13} />}
                      </button>
                      <button onClick={() => window.open(`/register/${form.token}`, '_blank')} title="Preview" style={{ padding: '7px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '7px', cursor: 'pointer', color: '#64748B', display: 'flex' }}>
                        <ExternalLink size={13} />
                      </button>
                      <button onClick={() => duplicateForm(form)} title="Duplicate" style={{ padding: '7px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '7px', cursor: 'pointer', color: '#64748B', display: 'flex' }}>
                        <Copy size={13} />
                      </button>
                      {/* Dropdown actions */}
                      <FormActionsMenu
                        form={form}
                        onEdit={() => setEditingForm(form)}
                        onSchedule={() => { setSchedulingForm(form); setSchedOpenAt(form.open_at?.slice(0,16) ?? ''); setSchedCloseAt(form.close_at?.slice(0,16) ?? ''); }}
                        onEarlyAccess={() => { setEarlyForm(form); setEarlyDate(form.early_access_ends_at?.slice(0,16) ?? ''); }}
                        onLateInvite={() => setLateInviteForm(form)}
                        onSetupChecklist={() => setSetupChecklist(form)}
                        onPromoCodes={() => setPromoForm(form)}
                        onArchive={() => archiveForm(form.id)}
                        onDelete={() => setDelConfirm(form)}
                        primary={primary}
                      />
                      {/* Expand toggle */}
                      <button onClick={() => toggleExpand(form.id)} title={isExpanded ? 'Collapse' : 'Expand details'}
                        style={{ padding: '7px', background: isExpanded ? `${primary}15` : '#F8FAFC', border: `1px solid ${isExpanded ? primary : '#E2E8F0'}`, borderRadius: '7px', cursor: 'pointer', color: isExpanded ? primary : '#64748B', display: 'flex' }}>
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Expanded panel ─────────────────────────────────────────── */}
                {isExpanded && (
                  <div style={{ borderTop: `2px solid ${primary}18`, background: 'linear-gradient(to bottom, #F8FAFC, #F4F6F9)' }}>
                    {subsLoading ? (
                      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                          {[1,2,3,4].map(i => <div key={i} style={{ height: '76px', borderRadius: '10px', background: 'linear-gradient(90deg,#E2E8F0 25%,#EEF2F7 50%,#E2E8F0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />)}
                        </div>
                        <div style={{ height: '120px', borderRadius: '10px', background: 'linear-gradient(90deg,#E2E8F0 25%,#EEF2F7 50%,#E2E8F0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />
                      </div>
                    ) : (
                      <div style={{ padding: '16px 20px 20px' }}>
                        {/* Stat strip */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                          {(() => {
                            const reg  = stats?.registered ?? subs.filter(s => s.status !== 'declined').length;
                            const inc  = stats?.income ?? 0;
                            const out  = stats?.outstanding ?? 0;
                            const ref  = stats?.refunded ?? 0;
                            return [
                              { label: 'Registered',  value: String(reg),              sub: `of ${subs.length} submitted`,  accent: '#3B82F6', accentBg: '#EFF6FF', numColor: reg   > 0 ? '#1D4ED8' : '#94A3B8' },
                              { label: 'Income',       value: `${sym}${inc.toFixed(2)}`, sub: `net collected`,               accent: '#22C55E', accentBg: '#F0FDF4', numColor: inc   > 0 ? '#15803D' : '#94A3B8' },
                              { label: 'Outstanding',  value: `${sym}${out.toFixed(2)}`, sub: `balance due`,                 accent: '#F59E0B', accentBg: '#FFFBEB', numColor: out   > 0 ? '#B45309' : '#94A3B8' },
                              { label: 'Refunded',     value: `${sym}${ref.toFixed(2)}`, sub: `issued to families`,          accent: '#64748B', accentBg: '#F1F5F9', numColor: ref   > 0 ? '#475569' : '#94A3B8' },
                            ].map(({ label, value, sub: subLabel, accent, accentBg, numColor }) => (
                              <div key={label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '13px 15px', borderTop: `3px solid ${accent}` }}>
                                <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{label}</div>
                                <div style={{ fontSize: '20px', fontWeight: '900', color: numColor, letterSpacing: '-0.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', marginBottom: '4px' }}>{value}</div>
                                <div style={{ fontSize: '10.5px', color: '#CBD5E1', fontWeight: '500' }}>{subLabel}</div>
                              </div>
                            ));
                          })()}
                        </div>

                        {/* Submissions list */}
                        {subs.length === 0 ? (
                          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '40px 24px', textAlign: 'center' }}>
                            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                              <Users size={20} color="#CBD5E1" />
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>No submissions yet</div>
                            <div style={{ fontSize: '12.5px', color: '#94A3B8' }}>{form.status === 'open' ? 'Share the registration link to start collecting.' : 'Open the form to start accepting registrations.'}</div>
                          </div>
                        ) : (
                          <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 95px 78px 78px 78px 84px', padding: '7px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', gap: '8px', alignItems: 'center' }}>
                              {[['Player', 'left'], ['Payment', 'left'], ['Invoice', 'right'], ['Net paid', 'right'], ['Refunded', 'right'], ['', 'right']] as [string, string][]}
                              {[['Player', 'left'], ['Payment', 'left'], ['Invoice', 'right'], ['Net paid', 'right'], ['Refunded', 'right'], ['', 'right']].map(([h, align]) => (
                                <span key={h} style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: align as 'left' | 'right' }}>{h}</span>
                              ))}
                            </div>
                            {subs.map((sub, i) => {
                              const ps        = PAY_STATUS_STYLES[sub.payment_status] ?? PAY_STATUS_STYLES.unpaid;
                              const name      = playerName(sub.data);
                              const net       = (sub.amount_paid ?? 0) - (sub.refunded_amount ?? 0);
                              const refAmt    = sub.refunded_amount ?? 0;
                              const canRefund = sub.payment_status !== 'refunded' && (sub.amount_paid ?? 0) > refAmt;
                              return (
                                <div key={sub.id} className="reg-sub-row" style={{ display: 'grid', gridTemplateColumns: '1fr 95px 78px 78px 78px 84px', padding: '9px 16px', borderTop: i > 0 ? '1px solid #F8FAFC' : 'none', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(sub.submitted_at)}</div>
                                  </div>
                                  <div>
                                    <span style={{ fontSize: '10.5px', fontWeight: '700', color: ps.color, background: ps.bg, borderRadius: '4px', padding: '2px 7px', whiteSpace: 'nowrap' }}>{ps.label}</span>
                                  </div>
                                  <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#64748B', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sub.amount_due != null ? `${sym}${sub.amount_due.toFixed(2)}` : '—'}</div>
                                  <div style={{ fontSize: '12.5px', fontWeight: '700', color: net > 0 ? '#15803D' : '#94A3B8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{net > 0 ? `${sym}${net.toFixed(2)}` : '—'}</div>
                                  <div style={{ fontSize: '12px', fontWeight: '600', color: refAmt > 0 ? '#DC2626' : '#E2E8F0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                    {refAmt > 0 ? `-${sym}${refAmt.toFixed(2)}` : '—'}
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    {canRefund ? (
                                      <button onClick={() => openRefund(sub, form)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                        <RotateCcw size={10} /> Refund
                                      </button>
                                    ) : sub.payment_status === 'refunded' ? (
                                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', background: '#F1F5F9', borderRadius: '4px', padding: '3px 7px' }}>Done</span>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                            {/* Footer summary */}
                            {subs.length > 0 && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 95px 78px 78px 78px 84px', padding: '8px 16px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748B' }}>{subs.length} submission{subs.length !== 1 ? 's' : ''}</span>
                                <span />
                                <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#374151', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sym}{subs.reduce((t, s) => t + (s.amount_due ?? 0), 0).toFixed(2)}</span>
                                <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#15803D', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sym}{subs.reduce((t, s) => t + Math.max((s.amount_paid ?? 0) - (s.refunded_amount ?? 0), 0), 0).toFixed(2)}</span>
                                <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#DC2626', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{subs.some(s => (s.refunded_amount ?? 0) > 0) ? `-${sym}${subs.reduce((t, s) => t + (s.refunded_amount ?? 0), 0).toFixed(2)}` : '—'}</span>
                                <span />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Refund modal ── */}
      {showRefund && (() => {
        const { sub, form } = showRefund;
        const maxRefundable = (sub.amount_paid ?? 0) - (sub.refunded_amount ?? 0);
        const refundAmount  = calcRefundAmount(sub);
        const sym2 = (form.currency === 'GBP' ? '£' : form.currency === 'EUR' ? '€' : '$');
        const valid = refundAmount > 0 && refundAmount <= maxRefundable;
        return (
          <Modal onClose={() => setShowRefund(null)}>
            <div style={{ padding: '24px' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <RotateCcw size={18} color="#DC2626" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Issue Refund</h3>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>{playerName(sub.data)} · {form.title}</p>
                </div>
              </div>

              {/* Payment summary */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', display: 'flex', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Total paid</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A' }}>{sym2}{(sub.amount_paid ?? 0).toFixed(2)}</div>
                </div>
                {(sub.refunded_amount ?? 0) > 0 && (
                  <div>
                    <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Already refunded</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#DC2626' }}>{sym2}{sub.refunded_amount.toFixed(2)}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Refundable</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#15803D' }}>{sym2}{maxRefundable.toFixed(2)}</div>
                </div>
              </div>

              {/* Refund type tabs */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ ...labelSt, marginBottom: '8px' }}>Refund type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {([
                    { mode: 'full' as RefundMode,    label: 'Full refund',    sub: `${sym2}${maxRefundable.toFixed(2)}` },
                    { mode: 'partial' as RefundMode, label: 'Fixed amount',   sub: 'Enter $ amount' },
                    { mode: 'percent' as RefundMode, label: 'Percentage',     sub: 'Enter % of paid' },
                  ]).map(({ mode, label, sub: subLabel }) => (
                    <button key={mode} onClick={() => { setRefundMode(mode); setRefundInput(''); }}
                      style={{ padding: '10px 8px', borderRadius: '8px', border: `1.5px solid ${refundMode === mode ? '#DC2626' : '#E2E8F0'}`, background: refundMode === mode ? '#FEF2F2' : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: '700', color: refundMode === mode ? '#DC2626' : '#374151' }}>{label}</div>
                      <div style={{ fontSize: '11px', color: refundMode === mode ? '#EF4444' : '#94A3B8', marginTop: '2px' }}>{subLabel}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount input */}
              {refundMode !== 'full' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelSt}>{refundMode === 'partial' ? `Amount (max ${sym2}${maxRefundable.toFixed(2)})` : 'Percentage (%)'}</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#64748B', fontWeight: '600' }}>
                      {refundMode === 'partial' ? sym2 : '%'}
                    </span>
                    <input type="number" min="0" max={refundMode === 'partial' ? maxRefundable : 100} step="0.01"
                      value={refundInput} onChange={e => setRefundInput(e.target.value)} placeholder={refundMode === 'partial' ? '0.00' : '0'}
                      style={{ ...inputSt, paddingLeft: '30px' }} autoFocus />
                  </div>
                  {refundMode === 'percent' && parseFloat(refundInput) > 0 && (
                    <div style={{ fontSize: '12px', color: '#DC2626', fontWeight: '600', marginTop: '4px' }}>
                      = {sym2}{(parseFloat(refundInput) / 100 * maxRefundable).toFixed(2)} refunded
                    </div>
                  )}
                </div>
              )}

              {/* Reason */}
              <div style={{ marginBottom: '20px' }}>
                <label style={labelSt}>Reason (optional)</label>
                <input value={refundReason} onChange={e => setRefundReason(e.target.value)}
                  placeholder="e.g. Withdrawal, duplicate payment, overpayment…"
                  style={inputSt} />
              </div>

              {/* Refund preview */}
              {valid && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#DC2626' }}>Refund amount</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#DC2626' }}>{sym2}{refundAmount.toFixed(2)}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowRefund(null)} style={{ padding: '11px 16px', background: '#F1F5F9', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={processRefund} disabled={refundSaving || !valid}
                  style={{ flex: 1, padding: '11px', background: refundSaving || !valid ? '#CBD5E1' : '#DC2626', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: refundSaving || !valid ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <RotateCcw size={13} /> {refundSaving ? 'Processing…' : `Refund ${valid ? `${sym2}${refundAmount.toFixed(2)}` : ''}`}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ── Delete confirm ── */}
      {delConfirm && (
        <Modal onClose={() => setDelConfirm(null)}>
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Trash2 size={22} color="#EF4444" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '8px' }}>Delete "{delConfirm.title}"?</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px', lineHeight: '1.5' }}>All submissions will be permanently deleted. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setDelConfirm(null)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => deleteForm(delConfirm.id)} style={{ flex: 1, padding: '11px', background: '#EF4444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Late invite modal ── */}
      {lateInviteForm && (
        <Modal onClose={() => { setLateInviteForm(null); setLateEmails(''); setLateError(''); }}>
          <div style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', margin: '0 0 6px' }}>Send late-registration invite</h3>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px' }}>A private 48-hour link will be emailed to each address. The form stays closed for everyone else.</p>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>Email addresses (one per line or comma-separated)</label>
            <textarea value={lateEmails} onChange={(e) => setLateEmails(e.target.value)} rows={5} style={{ width: '100%', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: lateError ? '8px' : '16px' }} />
            {lateError && <p style={{ fontSize: '12px', color: '#DC2626', margin: '0 0 12px' }}>{lateError}</p>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setLateInviteForm(null); setLateEmails(''); }} style={{ padding: '11px 16px', background: '#F1F5F9', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={saveLateInvites} disabled={lateSending} style={{ flex: 1, padding: '11px', background: lateSending ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: lateSending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                <Mail size={13} /> {lateSending ? 'Sending…' : 'Send invites'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Scheduling modal ── */}
      {schedulingForm && (
        <Modal onClose={() => setSchedulingForm(null)}>
          <div style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', margin: '0 0 6px' }}>Auto-schedule form</h3>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 20px' }}>The form will open and close automatically at these times.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>Auto-open at</label>
                <input type="datetime-local" value={schedOpenAt} onChange={(e) => setSchedOpenAt(e.target.value)} style={{ width: '100%', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>Auto-close at</label>
                <input type="datetime-local" value={schedCloseAt} onChange={(e) => setSchedCloseAt(e.target.value)} style={{ width: '100%', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setSchedulingForm(null)} style={{ padding: '11px 16px', background: '#F1F5F9', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={saveScheduling} disabled={schedSaving} style={{ flex: 1, padding: '11px', background: schedSaving ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: schedSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {schedSaving ? 'Saving…' : 'Save schedule'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Early access modal ── */}
      {earlyForm && (
        <Modal onClose={() => setEarlyForm(null)}>
          <div style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', margin: '0 0 6px' }}>Early access window</h3>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px' }}>Existing roster players get priority registration before the form opens publicly. Set when the early-access window ends and the form opens to everyone.</p>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>Early access ends (public open date)</label>
            <input type="datetime-local" value={earlyDate} onChange={(e) => setEarlyDate(e.target.value)} style={{ width: '100%', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: '20px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setEarlyForm(null)} style={{ padding: '11px 16px', background: '#F1F5F9', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={saveEarlyAccess} disabled={earlySaving} style={{ flex: 1, padding: '11px', background: earlySaving ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: earlySaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {earlySaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Setup checklist ── */}
      {setupChecklist && (
        <SetupChecklistModal form={setupChecklist} primary={primary} onClose={() => setSetupChecklist(null)} />
      )}

      {/* ── Promo codes ── */}
      {promoForm && (
        <PromoCodesModal form={promoForm} primary={primary} onClose={() => setPromoForm(null)} />
      )}
    </div>
  );
}

// ── Archive view ──────────────────────────────────────────────────────────────

function ArchiveView({ onBack }: { onBack: () => void }) {
  const { club } = useDashboard();
  const [forms, setForms] = useState<RegForm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!club) return;
    supabase.from('registration_forms').select('*').eq('club_id', club.id).eq('archived', true).order('created_at', { ascending: false })
      .then(({ data }) => { setForms((data ?? []) as RegForm[]); setLoading(false); });
  }, [club?.id]);

  async function restore(id: string) {
    await supabase.from('registration_forms').update({ archived: false, status: 'draft' }).eq('id', id);
    setForms((p) => p.filter((f) => f.id !== id));
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1000px' }}>
      <button onClick={onBack} style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '20px' }}>← Back to forms</button>
      <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', margin: '0 0 4px' }}>Archived forms</h2>
      <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 24px' }}>Read-only. Restore a form to make it editable again.</p>
      {loading ? <div style={{ color: '#94A3B8' }}>Loading…</div> : forms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>No archived forms</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {forms.map((f) => (
            <div key={f.id} style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#64748B' }}>{f.title}</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Archived · {fmtDate(f.created_at)}</div>
              </div>
              <button onClick={() => restore(f.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                <ArchiveRestore size={12} /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FormActionsMenu ───────────────────────────────────────────────────────────

function FormActionsMenu({ form, onEdit, onSchedule, onEarlyAccess, onLateInvite, onSetupChecklist, onPromoCodes, onArchive, onDelete, primary }: {
  form: RegForm;
  onEdit: () => void; onSchedule: () => void; onEarlyAccess: () => void;
  onLateInvite: () => void; onSetupChecklist: () => void; onPromoCodes: () => void;
  onArchive: () => void; onDelete: () => void; primary: string;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    { label: 'Edit form',          icon: <Pencil size={12} />,         action: onEdit },
    { label: 'Promo codes',        icon: <Tag size={12} />,            action: onPromoCodes },
    { label: 'Auto-schedule',      icon: <Calendar size={12} />,       action: onSchedule },
    { label: 'Early access',       icon: <Star size={12} />,           action: onEarlyAccess },
    { label: 'Late-reg invite',    icon: <Mail size={12} />,           action: onLateInvite },
    { label: 'Setup checklist',    icon: <CheckCircle size={12} />,    action: onSetupChecklist },
    { label: 'Archive',            icon: <Archive size={12} />,        action: onArchive },
    { label: 'Delete',             icon: <Trash2 size={12} />,         action: onDelete, danger: true },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ padding: '7px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '7px', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center' }}>
        <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '4px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '6px', zIndex: 999, minWidth: '180px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
            {items.map((item) => (
              <button key={item.label} onClick={() => { setOpen(false); item.action(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 12px', background: 'none', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: item.danger ? '#DC2626' : '#374151', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? '#FEF2F2' : '#F8FAFC'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                <span style={{ color: item.danger ? '#DC2626' : '#64748B' }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Setup checklist modal ─────────────────────────────────────────────────────

function SetupChecklistModal({ form, primary, onClose }: { form: RegForm; primary: string; onClose: () => void }) {
  const checks = [
    { label: 'Form title and description set',        done: !!form.title },
    { label: 'Fields added',                          done: Array.isArray(form.fields) && (form.fields as unknown[]).length > 0 },
    { label: 'Registration link shared with parents', done: false },
    { label: 'Confirmation email configured',         done: form.send_confirmation_email },
    { label: 'Deadline set',                          done: !!form.deadline },
    { label: 'Capacity limit set',                    done: !!form.max_spots },
    { label: 'Payment configured',                    done: !!form.price || form.price_mode === 'field' },
    { label: 'Form published (status: Open)',         done: form.status === 'open' },
  ];
  const done = checks.filter((c) => c.done).length;

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', margin: '0 0 4px' }}>Setup checklist</h3>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px' }}>{done} of {checks.length} steps complete</p>
        <div style={{ height: '4px', background: '#F1F5F9', borderRadius: '2px', marginBottom: '20px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round((done / checks.length) * 100)}%`, background: primary, borderRadius: '2px' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {checks.map((c) => (
            <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: c.done ? '#DCFCE7' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {c.done ? <CheckCircle size={12} color="#16A34A" /> : <AlertCircle size={12} color="#CBD5E1" />}
              </div>
              <span style={{ fontSize: '13px', color: c.done ? '#374151' : '#94A3B8', fontWeight: c.done ? '500' : '400', textDecoration: c.done ? 'none' : 'none' }}>{c.label}</span>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ width: '100%', marginTop: '24px', padding: '12px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>Got it</button>
      </div>
    </Modal>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onNew, primary }: { onNew: () => void; primary: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '64px', textAlign: 'center' }}>
      <div style={{ fontSize: '40px', marginBottom: '16px' }}>📋</div>
      <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No registration forms yet</div>
      <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px' }}>Create your first form — season sign-ups, camps, tryouts, anything</div>
      <button onClick={onNew} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 22px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
        <Plus size={15} /> Create first form
      </button>
    </div>
  );
}

// ── Promo codes modal ─────────────────────────────────────────────────────────

function PromoCodesModal({ form, primary, onClose }: { form: RegForm; primary: string; onClose: () => void }) {
  const { club } = useDashboard();
  const [codes, setCodes]     = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving]   = useState(false);

  const [newCode, setNewCode]               = useState('');
  const [newType, setNewType]               = useState<DiscountType>('percent');
  const [newValue, setNewValue]             = useState('');
  const [newMaxUses, setNewMaxUses]         = useState('');
  const [newExpires, setNewExpires]         = useState('');

  useEffect(() => {
    if (!club) return;
    supabase.from('registration_promo_codes').select('*')
      .eq('club_id', club.id).eq('form_id', form.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setCodes((data ?? []) as PromoCode[]); setLoading(false); });
  }, [club?.id, form.id]);

  function generateCode() {
    setNewCode(Math.random().toString(36).slice(2, 8).toUpperCase());
  }

  async function handleCreate() {
    if (!club || !newCode.trim() || !newValue) return;
    setSaving(true);
    const { data } = await supabase.from('registration_promo_codes').insert({
      club_id:        club.id,
      form_id:        form.id,
      code:           newCode.trim().toUpperCase(),
      discount_type:  newType,
      discount_value: parseFloat(newValue),
      max_uses:       newMaxUses ? parseInt(newMaxUses) : null,
      expires_at:     newExpires || null,
      active:         true,
    }).select('*').single();
    if (data) setCodes((p) => [data as PromoCode, ...p]);
    setCreating(false); setNewCode(''); setNewType('percent'); setNewValue(''); setNewMaxUses(''); setNewExpires('');
    setSaving(false);
  }

  async function toggleActive(code: PromoCode) {
    await supabase.from('registration_promo_codes').update({ active: !code.active }).eq('id', code.id);
    setCodes((p) => p.map((c) => c.id === code.id ? { ...c, active: !c.active } : c));
  }

  async function deleteCode(id: string) {
    await supabase.from('registration_promo_codes').delete().eq('id', id);
    setCodes((p) => p.filter((c) => c.id !== id));
  }

  const sym = form.currency === 'USD' ? '$' : form.currency === 'EUR' ? '€' : '£';

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <Tag size={18} color={primary} />
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Promo codes</h3>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0' }}>{form.title}</p>
          </div>
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: '32px', color: '#94A3B8' }}>Loading…</div> : (
          <>
            {codes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {codes.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: c.active ? '#F8FAFC' : '#F1F5F9', border: `1px solid ${c.active ? '#E2E8F0' : '#CBD5E1'}`, borderRadius: '10px', padding: '10px 12px' }}>
                    <code style={{ fontSize: '13px', fontWeight: '800', color: c.active ? '#0F172A' : '#94A3B8', fontFamily: 'monospace', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '3px 8px' }}>{c.code}</code>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                      {c.discount_type === 'percent' ? `${c.discount_value}% off` : `${sym}${c.discount_value} off`}
                    </span>
                    {c.max_uses && <span style={{ fontSize: '11px', color: '#94A3B8' }}>{c.uses_count}/{c.max_uses} uses</span>}
                    {c.expires_at && <span style={{ fontSize: '11px', color: '#94A3B8' }}>Exp {new Date(c.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                      <button onClick={() => toggleActive(c)}
                        style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: c.active ? '#DCFCE7' : '#F1F5F9', color: c.active ? '#16A34A' : '#94A3B8', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {c.active ? 'Active' : 'Off'}
                      </button>
                      <button onClick={() => deleteCode(c.id)} style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', display: 'flex' }}><X size={11} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!creating ? (
              <button onClick={() => { setCreating(true); generateCode(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '11px', background: '#F8FAFC', border: '1.5px dashed #CBD5E1', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', justifyContent: 'center' }}>
                <Plus size={14} /> Add promo code
              </button>
            ) : (
              <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'end' }}>
                  <div>
                    <label style={labelSt}>Code</label>
                    <input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="SUMMER10" style={{ ...inputSt, fontFamily: 'monospace', fontWeight: '700', letterSpacing: '0.08em' }} />
                  </div>
                  <button onClick={generateCode} style={{ padding: '10px 14px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '12px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Generate</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={labelSt}>Discount type</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {([['percent', '% off'], ['flat', `${sym} off`]] as [DiscountType, string][]).map(([val, lbl]) => (
                        <button key={val} onClick={() => setNewType(val)}
                          style={{ flex: 1, padding: '9px', borderRadius: '8px', border: `1.5px solid ${newType === val ? primary : '#E2E8F0'}`, background: newType === val ? `${primary}10` : '#fff', color: newType === val ? primary : '#64748B', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={labelSt}>Value</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#64748B', fontWeight: '600' }}>{newType === 'percent' ? '%' : sym}</span>
                      <input type="number" min="0" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="10" style={{ ...inputSt, paddingLeft: '28px' }} />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={labelSt}>Max uses (blank = unlimited)</label>
                    <input type="number" min="1" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} placeholder="∞" style={inputSt} />
                  </div>
                  <div>
                    <label style={labelSt}>Expires</label>
                    <input type="date" value={newExpires} onChange={(e) => setNewExpires(e.target.value)} style={inputSt} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setCreating(false)} style={{ padding: '10px 16px', background: '#F1F5F9', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={handleCreate} disabled={saving || !newCode.trim() || !newValue}
                    style={{ flex: 1, padding: '10px', background: saving || !newCode.trim() || !newValue ? '#CBD5E1' : primary, color: '#fff', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', cursor: saving || !newCode.trim() || !newValue ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {saving ? 'Saving…' : 'Create code'}
                  </button>
                </div>
              </div>
            )}

            {codes.length === 0 && !creating && (
              <p style={{ textAlign: 'center', fontSize: '12px', color: '#CBD5E1', marginTop: '8px' }}>No promo codes yet for this form</p>
            )}
          </>
        )}

        <button onClick={onClose} style={{ width: '100%', marginTop: '20px', padding: '11px', background: '#F1F5F9', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
      </div>
    </Modal>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.24)' }}>
        {children}
      </div>
    </div>
  );
}
