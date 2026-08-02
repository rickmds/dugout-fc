'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Mail, Clock, Shield, ChevronDown, ChevronUp,
  Trash2, Download, Search, CreditCard, ExternalLink, CheckCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import {
  RegForm, EmailTemplate, LateInvite, Submission,
  EMAIL_TRIGGER_LABELS,
  fmtDate, playerName, parentEmail,
  labelSt, inputSt,
} from './shared';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

type Tab = 'email' | 'late_invites' | 'privacy' | 'stripe';

interface EditingTemplate {
  trigger_name: string;
  subject:      string;
  body_html:    string;
  active:       boolean;
}

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'email',        label: 'Email templates', icon: <Mail size={13} />        },
  { id: 'late_invites', label: 'Late invites',     icon: <Clock size={13} />       },
  { id: 'stripe',       label: 'Stripe',           icon: <CreditCard size={13} /> },
  { id: 'privacy',      label: 'Data & Privacy',  icon: <Shield size={13} />      },
];

const RETENTION_OPTIONS = [
  { value: '1y', label: '1 year' },
  { value: '2y', label: '2 years' },
  { value: '3y', label: '3 years' },
  { value: 'never', label: 'Never (keep indefinitely)' },
];

const MERGE_TAGS = ['{{player_name}}', '{{parent_name}}', '{{form_title}}', '{{club_name}}', '{{status}}', '{{link}}'];

// ── Style helpers ─────────────────────────────────────────────────────────────

const BTN = (bg: string, color = '#fff', disabled = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '8px 16px', borderRadius: '8px', border: 'none',
  background: disabled ? '#E2E8F0' : bg, color: disabled ? '#94A3B8' : color,
  fontSize: '13px', fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
  opacity: disabled ? 0.8 : 1,
});

const BTN_OUTLINE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '7px 14px', borderRadius: '8px',
  border: '1.5px solid #E2E8F0', background: '#fff',
  color: '#64748B', fontSize: '12px', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsPanel({ onClose }: Props) {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000'
    ? club.primary_color : '#22C55E';

  const [tab, setTab]           = useState<Tab>('email');
  const [toast, setToast]       = useState<string | null>(null);

  // Email templates
  const [templates, setTemplates]           = useState<Record<string, EmailTemplate>>({});
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [editingKey, setEditingKey]         = useState<string | null>(null);
  const [editForm, setEditForm]             = useState<EditingTemplate | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  // Late invites
  const [invites, setInvites]               = useState<(LateInvite & { form_title: string })[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [forms, setForms]                   = useState<RegForm[]>([]);

  // Privacy
  const [retention, setRetention]           = useState('never');
  const [gdprQuery, setGdprQuery]           = useState('');
  const [gdprMatches, setGdprMatches]       = useState<Array<{ id: string; player: string; email: string; form_title: string; submitted: string }>>([]);
  const [gdprSearching, setGdprSearching]   = useState(false);
  const [gdprDeleting, setGdprDeleting]     = useState(false);
  const [gdprDone, setGdprDone]             = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [exporting, setExporting]           = useState(false);

  // ── Toast ────────────────────────────────────────────────────────────────────

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  // ── Load email templates ──────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    if (!club) return;
    setTemplatesLoading(true);
    const { data } = await supabase
      .from('registration_email_templates')
      .select('*')
      .eq('club_id', club.id);

    const map: Record<string, EmailTemplate> = {};
    for (const row of (data ?? []) as EmailTemplate[]) {
      map[row.trigger_name] = row;
    }
    setTemplates(map);
    setTemplatesLoading(false);
  }, [club]);

  // ── Load late invites + forms ─────────────────────────────────────────────────

  const loadLateInvites = useCallback(async () => {
    if (!club) return;
    setInvitesLoading(true);
    try {
      const { data: formsData } = await supabase
        .from('registration_forms')
        .select('id, title')
        .eq('club_id', club.id);

      const loadedForms = (formsData ?? []) as RegForm[];
      setForms(loadedForms);

      const formMap = new Map<string, string>();
      for (const f of loadedForms) formMap.set(f.id, f.title);

      const formIds = loadedForms.map(f => f.id);
      if (formIds.length === 0) { setInvites([]); setInvitesLoading(false); return; }

      const { data: inviteData } = await supabase
        .from('registration_late_invites')
        .select('*')
        .in('form_id', formIds)
        .order('sent_at', { ascending: false });

      const mapped = ((inviteData ?? []) as LateInvite[]).map(inv => ({
        ...inv,
        form_title: formMap.get(inv.form_id) ?? '—',
      }));
      setInvites(mapped);
    } catch {
      // ignore
    } finally {
      setInvitesLoading(false);
    }
  }, [club]);

  useEffect(() => {
    loadTemplates();
    loadLateInvites();
  }, [loadTemplates, loadLateInvites]);

  // ── Template helpers ─────────────────────────────────────────────────────────

  const handleEditOpen = (triggerName: string) => {
    const existing = templates[triggerName];
    setEditForm({
      trigger_name: triggerName,
      subject:      existing?.subject ?? '',
      body_html:    existing?.body_html ?? '',
      active:       existing?.active ?? true,
    });
    setEditingKey(triggerName);
  };

  const handleTemplateSave = async () => {
    if (!editForm || !club) return;
    setTemplateSaving(true);
    try {
      const existing = templates[editForm.trigger_name];

      if (existing) {
        await supabase
          .from('registration_email_templates')
          .update({
            subject:   editForm.subject,
            body_html: editForm.body_html,
            active:    editForm.active,
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('registration_email_templates')
          .insert({
            club_id:      club.id,
            trigger_name: editForm.trigger_name,
            subject:      editForm.subject,
            body_html:    editForm.body_html,
            active:       editForm.active,
          });
      }

      await loadTemplates();
      setEditingKey(null);
      setEditForm(null);
      showToast('Template saved');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  };

  // ── Late invite helpers ──────────────────────────────────────────────────────

  const handleRevokeInvite = async (inviteId: string) => {
    const { error } = await supabase
      .from('registration_late_invites')
      .delete()
      .eq('id', inviteId);

    if (error) { showToast(error.message); return; }
    await loadLateInvites();
    showToast('Invite revoked');
  };

  // ── GDPR helpers ─────────────────────────────────────────────────────────────

  const handleGdprSearch = async () => {
    if (!gdprQuery.trim() || !club) return;
    setGdprSearching(true);
    setGdprMatches([]);
    setGdprDone(false);
    try {
      const { data: formsData } = await supabase
        .from('registration_forms')
        .select('id, title')
        .eq('club_id', club.id);

      const allForms = (formsData ?? []) as RegForm[];
      const formIds  = allForms.map(f => f.id);
      const formMap  = new Map<string, string>(allForms.map(f => [f.id, f.title]));

      if (formIds.length === 0) { setGdprSearching(false); return; }

      const { data } = await supabase
        .from('registration_submissions')
        .select('*')
        .in('form_id', formIds);

      const subs = (data ?? []) as Submission[];
      const q    = gdprQuery.toLowerCase().trim();

      const matched = subs
        .filter(s => Object.values(s.data).join(' ').toLowerCase().includes(q))
        .map(s => ({
          id:         s.id,
          player:     playerName(s.data),
          email:      parentEmail(s.data),
          form_title: formMap.get(s.form_id) ?? '—',
          submitted:  s.submitted_at,
        }));

      setGdprMatches(matched);
      if (matched.length === 0) showToast('No matching records found');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setGdprSearching(false);
    }
  };

  const handleGdprDelete = async () => {
    const ids = gdprMatches.map(m => m.id);
    if (ids.length === 0) return;
    setGdprDeleting(true);
    try {
      const { error } = await supabase
        .from('registration_submissions')
        .delete()
        .in('id', ids);
      if (error) throw error;
      setGdprMatches([]);
      setShowConfirm(false);
      setGdprDone(true);
      showToast('Records deleted');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setGdprDeleting(false);
    }
  };

  // ── Export all data ──────────────────────────────────────────────────────────

  const handleExportAll = async () => {
    if (!club) return;
    setExporting(true);
    try {
      const { data: formsData } = await supabase
        .from('registration_forms')
        .select('*')
        .eq('club_id', club.id);
      const allForms = (formsData ?? []) as RegForm[];
      const formIds  = allForms.map(f => f.id);
      const formMap  = new Map<string, RegForm>(allForms.map(f => [f.id, f]));

      if (formIds.length === 0) { showToast('No data to export'); return; }

      const { data } = await supabase
        .from('registration_submissions')
        .select('*')
        .in('form_id', formIds)
        .order('submitted_at', { ascending: false });

      const subs = (data ?? []) as Submission[];

      const headers = [
        'Form', 'Player name', 'Parent email', 'Status', 'Payment status',
        'Amount due', 'Amount paid', 'Submitted',
      ];

      const rows = subs.map(s => {
        const form = formMap.get(s.form_id);
        return [
          form?.title ?? '—',
          playerName(s.data),
          parentEmail(s.data),
          s.status,
          s.payment_status,
          s.amount_due?.toFixed(2) ?? '0.00',
          s.amount_paid.toFixed(2),
          fmtDate(s.submitted_at),
        ];
      });

      const csv = [headers, ...rows]
        .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `all-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export downloaded');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', zIndex: 1001,
          width: '560px', maxWidth: '100vw',
          background: '#F8FAFC', display: 'flex', flexDirection: 'column',
          boxShadow: '-6px 0 40px rgba(0,0,0,0.15)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: '#fff', borderBottom: '1px solid #E2E8F0',
          padding: '18px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
            Registration settings
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: '#F1F5F9', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#64748B',
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          background: '#fff', borderBottom: '1px solid #E2E8F0',
          padding: '0 24px', display: 'flex', flexShrink: 0,
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '12px 14px', border: 'none', background: 'none',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                color: tab === t.id ? primary : '#64748B',
                borderBottom: tab === t.id ? `2.5px solid ${primary}` : '2.5px solid transparent',
                fontFamily: 'inherit', transition: 'color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* ── EMAIL TEMPLATES ──────────────────────────────────────────── */}
          {tab === 'email' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {templatesLoading ? (
                <div style={{ color: '#94A3B8', fontSize: '13px' }}>Loading templates…</div>
              ) : (
                Object.entries(EMAIL_TRIGGER_LABELS).map(([key, meta]) => {
                  const existing  = templates[key];
                  const isEditing = editingKey === key;
                  const isCustom  = Boolean(existing);

                  return (
                    <div
                      key={key}
                      style={{
                        background: '#fff', border: `1px solid ${isEditing ? primary : '#E2E8F0'}`,
                        borderRadius: '12px', overflow: 'hidden',
                        transition: 'border-color 0.15s',
                      }}
                    >
                      {/* Row header */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '14px 18px',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                              {meta.label}
                            </span>
                            {isCustom ? (
                              <span style={{
                                fontSize: '10px', fontWeight: 700, padding: '2px 8px',
                                borderRadius: '20px', background: `${primary}18`,
                                color: primary,
                              }}>
                                Custom
                              </span>
                            ) : (
                              <span style={{
                                fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                                borderRadius: '20px', background: '#F1F5F9',
                                color: '#64748B',
                              }}>
                                Default template
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                            {meta.desc}
                          </div>
                        </div>

                        {/* Active toggle */}
                        {isCustom && (
                          <button
                            onClick={async () => {
                              await supabase
                                .from('registration_email_templates')
                                .update({ active: !existing.active })
                                .eq('id', existing.id);
                              await loadTemplates();
                            }}
                            style={{
                              fontSize: '11px', fontWeight: 700, padding: '3px 10px',
                              borderRadius: '20px', border: 'none', cursor: 'pointer',
                              background: existing.active ? '#DCFCE7' : '#FEE2E2',
                              color: existing.active ? '#16A34A' : '#DC2626',
                              fontFamily: 'inherit',
                            }}
                          >
                            {existing.active ? 'Active' : 'Paused'}
                          </button>
                        )}

                        <button
                          onClick={() => {
                            if (isEditing) { setEditingKey(null); setEditForm(null); }
                            else handleEditOpen(key);
                          }}
                          style={BTN_OUTLINE}
                          aria-label={isEditing ? 'Collapse' : 'Edit'}
                        >
                          {isEditing ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          {isEditing ? 'Close' : 'Edit'}
                        </button>
                      </div>

                      {/* Inline edit form */}
                      {isEditing && editForm && (
                        <div style={{
                          borderTop: '1px solid #E2E8F0', padding: '16px 18px',
                          background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '12px',
                        }}>
                          <div>
                            <label style={labelSt}>Subject line</label>
                            <input
                              type="text"
                              value={editForm.subject}
                              onChange={e => setEditForm(f => f ? { ...f, subject: e.target.value } : f)}
                              placeholder="e.g. Your registration has been approved"
                              style={inputSt}
                            />
                          </div>
                          <div>
                            <label style={labelSt}>Email body</label>
                            <textarea
                              value={editForm.body_html}
                              onChange={e => setEditForm(f => f ? { ...f, body_html: e.target.value } : f)}
                              placeholder="Enter your email content here…"
                              rows={8}
                              style={{ ...inputSt, resize: 'vertical', lineHeight: '1.6', minHeight: '140px' }}
                            />
                          </div>
                          <div>
                            <div style={{ ...labelSt, marginBottom: '6px' }}>
                              Available merge tags
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {MERGE_TAGS.map(tag => (
                                <button
                                  key={tag}
                                  onClick={() => setEditForm(f =>
                                    f ? { ...f, body_html: f.body_html + tag } : f
                                  )}
                                  style={{
                                    padding: '3px 10px', borderRadius: '6px',
                                    border: '1px solid #E2E8F0', background: '#fff',
                                    fontSize: '11px', fontFamily: 'monospace',
                                    color: '#334155', cursor: 'pointer',
                                  }}
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={handleTemplateSave}
                              disabled={templateSaving || !editForm.subject.trim()}
                              style={BTN(primary, '#fff', templateSaving || !editForm.subject.trim())}
                            >
                              {templateSaving ? 'Saving…' : 'Save template'}
                            </button>
                            <button
                              onClick={() => { setEditingKey(null); setEditForm(null); }}
                              style={BTN_OUTLINE}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── LATE INVITES ─────────────────────────────────────────────── */}
          {tab === 'late_invites' && (
            <div>
              <div style={{
                background: '#EFF6FF', border: '1px solid #BFDBFE',
                borderRadius: '10px', padding: '12px 16px',
                fontSize: '13px', color: '#1D4ED8', marginBottom: '18px', lineHeight: '1.5',
              }}>
                Late invites are sent from the Forms tab when a form is closed.
                Revoke any invite here to cancel access.
              </div>

              {invitesLoading ? (
                <div style={{ color: '#94A3B8', fontSize: '13px' }}>Loading…</div>
              ) : invites.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '40px 20px',
                  color: '#94A3B8', fontSize: '13px',
                }}>
                  No late invites have been sent yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        {['Email', 'Form', 'Sent', 'Expires', 'Used', ''].map(h => (
                          <th key={h} style={{
                            padding: '10px 12px', textAlign: 'left',
                            fontSize: '11px', fontWeight: 700,
                            color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em',
                            whiteSpace: 'nowrap',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invites.map((inv, idx) => (
                        <tr
                          key={inv.id}
                          style={{
                            background: idx % 2 === 0 ? '#fff' : '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                          }}
                        >
                          <td style={{ padding: '11px 12px', fontSize: '13px', color: '#0F172A' }}>
                            {inv.email}
                          </td>
                          <td style={{ padding: '11px 12px', fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap' }}>
                            {inv.form_title}
                          </td>
                          <td style={{ padding: '11px 12px', fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap' }}>
                            {fmtDate(inv.sent_at)}
                          </td>
                          <td style={{ padding: '11px 12px', fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap' }}>
                            {fmtDate(inv.expires_at)}
                          </td>
                          <td style={{ padding: '11px 12px' }}>
                            <span style={{
                              fontSize: '11px', fontWeight: 700, padding: '2px 8px',
                              borderRadius: '20px',
                              background: inv.used_at ? '#DCFCE7' : '#F1F5F9',
                              color: inv.used_at ? '#16A34A' : '#64748B',
                            }}>
                              {inv.used_at ? '✓ Used' : 'Unused'}
                            </span>
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                            {!inv.used_at && (
                              <button
                                onClick={() => handleRevokeInvite(inv.id)}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: '#DC2626', padding: '3px',
                                }}
                                aria-label="Revoke"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── STRIPE ───────────────────────────────────────────────────── */}
          {tab === 'stripe' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CreditCard size={22} color="#5850EC" />
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>Stripe</div>
                    <div style={{ fontSize: '13px', color: '#64748B' }}>Accept card payments and payment plans online</div>
                  </div>
                </div>
                <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '15px', flexShrink: 0 }}>⚠️</span>
                  <div style={{ fontSize: '13px', color: '#92400E', lineHeight: '1.5' }}>
                    Stripe is not yet connected. Registration payments are tracked manually in Submissions. Connect Stripe to enable online card payments.
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { icon: <CheckCircle size={15} color="#16A34A" />, text: 'One-time and recurring payment plans' },
                    { icon: <CheckCircle size={15} color="#16A34A" />, text: 'Automatic receipts emailed to parents' },
                    { icon: <CheckCircle size={15} color="#16A34A" />, text: 'Refunds processed directly from dashboard' },
                    { icon: <CheckCircle size={15} color="#16A34A" />, text: 'Stripe fees: 1.4% + 20p (EU cards), 2.9% + 30¢ (US cards)' },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#374151' }}>
                      {item.icon} {item.text}
                    </div>
                  ))}
                </div>
                <a href="https://dashboard.stripe.com/register" target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 22px', background: '#5850EC', color: '#fff', borderRadius: '10px', fontSize: '14px', fontWeight: '700', textDecoration: 'none' }}>
                  <ExternalLink size={14} /> Connect Stripe account
                </a>
              </div>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px 20px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Manual payments in the meantime</div>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: '1.6' }}>
                  Until Stripe is connected, record cash, bank transfer, cheque, or other offline payments on individual submissions in the Submissions tab. All payment tracking is fully functional without Stripe.
                </p>
              </div>
            </div>
          )}

          {/* ── DATA & PRIVACY ───────────────────────────────────────────── */}
          {tab === 'privacy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

              {/* Retention setting */}
              <div style={{
                background: '#fff', border: '1px solid #E2E8F0',
                borderRadius: '12px', padding: '18px 20px',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                  Data retention
                </div>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>
                  Automatically delete submission data after the selected period.
                </p>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={retention}
                    onChange={e => setRetention(e.target.value)}
                    style={{
                      ...inputSt, width: 'auto', minWidth: '200px', cursor: 'pointer',
                    }}
                  >
                    {RETENTION_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => showToast('Retention setting saved')}
                    style={BTN(primary)}
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* GDPR deletion */}
              <div style={{
                background: '#fff', border: '1px solid #E2E8F0',
                borderRadius: '12px', padding: '18px 20px',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                  GDPR erasure request
                </div>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>
                  Search by email or name to locate and permanently delete a person's records.
                </p>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input
                    type="text"
                    value={gdprQuery}
                    onChange={e => setGdprQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleGdprSearch(); }}
                    placeholder="Email or name…"
                    style={{ ...inputSt, flex: 1 }}
                  />
                  <button
                    onClick={handleGdprSearch}
                    disabled={gdprSearching || !gdprQuery.trim()}
                    style={BTN(primary, '#fff', gdprSearching || !gdprQuery.trim())}
                  >
                    <Search size={13} />
                    {gdprSearching ? '…' : 'Find records'}
                  </button>
                </div>

                {gdprDone && (
                  <div style={{
                    background: '#DCFCE7', border: '1px solid #86EFAC',
                    borderRadius: '8px', padding: '10px 14px',
                    fontSize: '13px', color: '#15803D', marginBottom: '10px',
                  }}>
                    Data deleted as requested. We recommend keeping a log of deletion requests for your records.
                  </div>
                )}

                {gdprMatches.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                      {gdprMatches.length} record{gdprMatches.length !== 1 ? 's' : ''} found
                    </div>
                    {gdprMatches.map(m => (
                      <div key={m.id} style={{
                        background: '#FEF2F2', border: '1px solid #FECACA',
                        borderRadius: '8px', padding: '10px 14px',
                        fontSize: '12px', color: '#0F172A',
                      }}>
                        <strong>{m.player}</strong> · {m.email} · {m.form_title} · {fmtDate(m.submitted)}
                      </div>
                    ))}
                    <button
                      onClick={() => setShowConfirm(true)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '7px',
                        padding: '9px 16px', borderRadius: '8px', border: 'none',
                        background: '#DC2626', color: '#fff', fontSize: '13px', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start',
                      }}
                    >
                      <Trash2 size={13} />
                      Delete all records for this person
                    </button>
                  </div>
                )}
              </div>

              {/* Export all data */}
              <div style={{
                background: '#fff', border: '1px solid #E2E8F0',
                borderRadius: '12px', padding: '18px 20px',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                  Export all registration data
                </div>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>
                  Download a comprehensive CSV of all submissions across every form.
                  Required for subject access requests under GDPR.
                </p>
                <button
                  onClick={handleExportAll}
                  disabled={exporting}
                  style={BTN(primary, '#fff', exporting)}
                >
                  <Download size={13} />
                  {exporting ? 'Exporting…' : 'Export all club registration data'}
                </button>
              </div>

              {/* Compliance note */}
              <div style={{
                background: '#EFF6FF', border: '1px solid #BFDBFE',
                borderRadius: '10px', padding: '14px 16px',
              }}>
                <div style={{ fontSize: '13px', color: '#1D4ED8', lineHeight: '1.6' }}>
                  <strong>GDPR / UK GDPR reminder:</strong> Under data protection law you must respond
                  to subject access requests within 30 days, and honour erasure requests without undue
                  delay. Use the tools above to fulfil these obligations. We recommend keeping a
                  log of all deletion requests you have processed.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── GDPR confirm dialog ────────────────────────────────────────────── */}
      {showConfirm && (
        <>
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 1100,
              background: 'rgba(0,0,0,0.5)',
            }}
            onClick={() => setShowConfirm(false)}
          />
          <div
            style={{
              position: 'fixed', top: '50%', left: '50%', zIndex: 1101,
              transform: 'translate(-50%, -50%)',
              background: '#fff', borderRadius: '14px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
              width: '400px', maxWidth: '95vw', padding: '26px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
              Confirm deletion
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>
              This will permanently delete{' '}
              <strong>{gdprMatches.length} record{gdprMatches.length !== 1 ? 's' : ''}</strong>.
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleGdprDelete}
                disabled={gdprDeleting}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                  background: '#DC2626', color: '#fff', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', opacity: gdprDeleting ? 0.7 : 1,
                }}
              >
                {gdprDeleting ? 'Deleting…' : 'Delete records'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px',
                  border: '1.5px solid #E2E8F0', background: '#fff',
                  color: '#334155', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
          background: '#1E293B', color: '#fff', fontSize: '13px', fontWeight: 600,
          padding: '10px 22px', borderRadius: '10px', zIndex: 2000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}
    </>
  );
}
