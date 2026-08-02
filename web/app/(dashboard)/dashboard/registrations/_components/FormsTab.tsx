'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Copy, ExternalLink, Trash2, Pencil, Archive, ArchiveRestore,
  Calendar, Users, Clock, CheckCircle, AlertCircle, ChevronDown,
  RefreshCw, Mail, Lock, Unlock, Star,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { STATUS_STYLES, fmtMoney, fmtDate, formFields, uid } from './shared';
import type { RegForm } from './shared';
import FormBuilder from './FormBuilder';
import SeasonRolloverWizard from './SeasonRolloverWizard';

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

            return (
              <div key={form.id} style={{ background: '#fff', border: `1.5px solid ${isFull ? '#FECACA' : '#E2E8F0'}`, borderRadius: '14px', padding: '16px 20px' }}>
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
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
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
                      onArchive={() => archiveForm(form.id)}
                      onDelete={() => setDelConfirm(form)}
                      primary={primary}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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

function FormActionsMenu({ form, onEdit, onSchedule, onEarlyAccess, onLateInvite, onSetupChecklist, onArchive, onDelete, primary }: {
  form: RegForm;
  onEdit: () => void; onSchedule: () => void; onEarlyAccess: () => void;
  onLateInvite: () => void; onSetupChecklist: () => void;
  onArchive: () => void; onDelete: () => void; primary: string;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    { label: 'Edit form',          icon: <Pencil size={12} />,         action: onEdit },
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
