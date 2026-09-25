'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  ArrowLeft, CheckCircle,
  AlertTriangle, UserPlus, Copy, CreditCard, Trash2, X, RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import {
  RegForm, Submission, PaymentStatus, OfflineMethod,
  PAY_STATUS_STYLES,
  fmtMoney, fmtDate, formFields, playerName,
  labelSt, inputSt, backBtnSt,
  normalizeRequiredDocs, requiredDocDataKey,
} from './shared';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  sub: Submission;
  form: RegForm;
  onClose: () => void;
  onUpdated: () => void;
}

type Tab = 'details' | 'payment' | 'notes' | 'roster';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'payment', label: 'Payment' },
  { id: 'notes',   label: 'Notes' },
  { id: 'roster',  label: 'Roster' },
];

const OFFLINE_METHODS: Array<{ value: OfflineMethod; label: string }> = [
  { value: 'cash',          label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'other',         label: 'Other' },
];

const PAY_STATUSES: PaymentStatus[] = ['paid', 'partial', 'unpaid', 'refunded'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SubmissionDetail({ sub, form, onClose, onUpdated }: Props) {
  const { club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000'
    ? club.primary_color : '#22C55E';

  // ── State ───────────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab]               = useState<Tab>('details');
  const [currentSub, setCurrentSub]             = useState<Submission>(sub);
  const [toast, setToast]                       = useState<string | null>(null);
  // Real team from the Tryout module's Team Builder, via tryout_assignment_id
  // — only set for a submission linked to an accepted tryout offer. See
  // 20260925000006_registration_tryout_link.sql.
  const [tryoutTeam, setTryoutTeam]             = useState<string | null>(null);

  // Payment tab
  const [offlineMethod, setOfflineMethod]       = useState<OfflineMethod>('cash');
  const [offlineAmount, setOfflineAmount]       = useState('');
  const [offlineDate, setOfflineDate]           = useState('');
  const [offlineRef, setOfflineRef]             = useState('');
  const [offlineSaving, setOfflineSaving]       = useState(false);
  const [installments, setInstallments]         = useState<{ id: string; amount: number; due_date: string; paid_at: string | null; payment_token: string; charge_attempts: number; last_charge_error: string | null; refunded_amount: number; payment_method: string | null }[]>([]);
  const [copiedId, setCopiedId]                 = useState<string | null>(null);
  const [autopayOn, setAutopayOn]               = useState(false);
  const [stoppingAutopay, setStoppingAutopay]   = useState(false);
  const [refundTarget, setRefundTarget]         = useState<{ id: string; amount: number; refunded_amount: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting]                 = useState(false);

  async function loadInstallments() {
    const { data } = await supabase
      .from('registration_installments')
      .select('id, amount, due_date, paid_at, payment_token, charge_attempts, last_charge_error, refunded_amount, payment_method')
      .eq('submission_id', sub.id)
      .order('due_date', { ascending: true });
    setInstallments(data ?? []);
  }

  useEffect(() => {
    (async () => {
      await loadInstallments();

      const { data: submissionRow } = await supabase
        .from('registration_submissions')
        .select('autopay_consent')
        .eq('id', sub.id)
        .single();
      setAutopayOn(!!submissionRow?.autopay_consent);

      if (sub.tryout_assignment_id) {
        const { data: assignment } = await supabase
          .from('tryout_assignments').select('team').eq('id', sub.tryout_assignment_id).single();
        setTryoutTeam(assignment?.team ?? null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount effect; loadInstallments is a plain function redefined each render, sub.id is the real reactive input
  }, [sub.id]);

  function copyPayLink(inst: { id: string; payment_token: string }) {
    const url = `${window.location.origin}/pay-registration/${inst.payment_token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(inst.id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  }

  async function stopAutopay() {
    setStoppingAutopay(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/registration/stop-autopay', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: sub.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not stop autopay.');
      setAutopayOn(false);
      showToast('Automatic payments stopped');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setStoppingAutopay(false);
    }
  }

  // Deleting a submission with real money collected would hide a Stripe
  // charge with no trace of who paid what — force a refund first rather
  // than letting the row (and the payment history behind it) just vanish.
  async function handleDeleteSubmission() {
    if (currentSub.amount_paid > 0) {
      showToast('Refund all payments on this submission before deleting it.');
      setShowDeleteConfirm(false);
      return;
    }
    setDeleting(true);
    try {
      const { error } = await supabase.from('registration_submissions').delete().eq('id', currentSub.id);
      if (error) throw error;
      onUpdated();
      onClose();
    } catch (e) {
      showToast((e as Error).message);
      setDeleting(false);
    }
  }

  // Financial aid
  const [aidAmount, setAidAmount]               = useState('');
  const [aidSaving, setAidSaving]               = useState(false);

  // Notes
  const [notes, setNotes]                       = useState(sub.internal_notes ?? '');
  const [notesSaving, setNotesSaving]           = useState(false);

  // Roster
  const [rosterTeamId, setRosterTeamId]         = useState(form.team_id ?? '');
  const [rosterName, setRosterName]             = useState(playerName(sub.data));
  const [rosterPosition, setRosterPosition]     = useState(sub.data['position'] ?? '');
  const [rosterJersey, setRosterJersey]         = useState(
    sub.data['jersey_number'] ?? sub.data['jersey'] ?? '',
  );
  const [rosterAdding, setRosterAdding]         = useState(false);
  const [rosterError, setRosterError]           = useState<string | null>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const patch = useCallback(async (update: Partial<Submission>) => {
    const { error } = await supabase
      .from('registration_submissions')
      .update(update)
      .eq('id', currentSub.id);
    if (error) throw error;
    setCurrentSub(prev => ({ ...prev, ...update }));
    onUpdated();
  }, [currentSub.id, onUpdated]);


  // ── Offline payment ──────────────────────────────────────────────────────────

  // Marking a submission "paid" (here or via the quick-status override below)
  // only ever touched registration_submissions — the registration_installments
  // rows behind the "Online payment schedule" card stayed marked unpaid
  // forever, so the daily reminder cron kept nagging (and, for anyone on
  // autopay, kept trying to auto-charge) a family who'd already paid in
  // cash. This claims installments paid in due-date order up to the amount
  // actually recorded, same idempotent paid_at-IS-NULL gate the real
  // payment webhook uses.
  async function markInstallmentsPaid(upToAmount: number, method: string, reference: string | null) {
    let remaining = upToAmount;
    for (const inst of installments) {
      if (inst.paid_at) continue;
      if (remaining < inst.amount - 0.005) break;
      const { error } = await supabase
        .from('registration_installments')
        .update({ paid_at: new Date().toISOString(), payment_method: method, reference })
        .eq('id', inst.id)
        .is('paid_at', null);
      if (error) throw error;
      remaining -= inst.amount;
    }
    await loadInstallments();
  }

  // Symmetric to markInstallmentsPaid — an admin correcting the status back
  // to unpaid/refunded should reopen the installments too, or they stay
  // stuck showing "Paid" with no way to collect the money again.
  async function reopenInstallments() {
    const paidIds = installments.filter(i => i.paid_at).map(i => i.id);
    if (!paidIds.length) return;
    const { error } = await supabase
      .from('registration_installments')
      .update({ paid_at: null, payment_method: null, reference: null })
      .in('id', paidIds);
    if (error) throw error;
    await loadInstallments();
  }

  const handleOfflineSave = async () => {
    const amt = parseFloat(offlineAmount);
    if (isNaN(amt) || amt <= 0) return;
    setOfflineSaving(true);
    try {
      const newPaid     = currentSub.amount_paid + amt;
      const amtDue      = currentSub.amount_due ?? 0;
      const newPayStatus: PaymentStatus = newPaid >= amtDue ? 'paid' : 'partial';
      await patch({
        amount_paid:            newPaid,
        payment_status:         newPayStatus,
        offline_payment_method: offlineMethod,
        offline_payment_ref:    offlineRef || null,
        offline_payment_date:   offlineDate || null,
      });
      await markInstallmentsPaid(amt, offlineMethod, offlineRef || null);
      setOfflineAmount('');
      setOfflineRef('');
      setOfflineDate('');
      showToast('Payment recorded');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setOfflineSaving(false);
    }
  };

  // ── Financial aid ────────────────────────────────────────────────────────────

  const handleAidApprove = async (full: boolean) => {
    setAidSaving(true);
    try {
      const partial    = parseFloat(aidAmount);
      const hasPartial = !isNaN(partial) && partial > 0;
      if (full || !hasPartial) {
        await patch({
          financial_aid_approved: true,
          fee_waived:             true,
          amount_due:             0,
          payment_status:         'paid',
        });
        showToast('Fee fully waived');
      } else {
        await patch({
          financial_aid_approved: true,
          financial_aid_amount:   partial,
          amount_due:             Math.max(0, (currentSub.amount_due ?? 0) - partial),
        });
        showToast('Partial assistance approved');
      }
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setAidSaving(false);
    }
  };

  const handleAidDeny = async () => {
    setAidSaving(true);
    try {
      await patch({ financial_aid_approved: false });
      showToast('Financial assistance denied');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setAidSaving(false);
    }
  };

  // ── Payment status override ──────────────────────────────────────────────────

  const handlePayStatusOverride = async (status: PaymentStatus) => {
    try {
      const extra: Partial<Submission> = status === 'paid'
        ? { amount_paid: currentSub.amount_due ?? currentSub.amount_paid }
        : {};
      await patch({ payment_status: status, ...extra });
      // Same reconciliation as recording an offline payment — an admin
      // manually marking this "Paid" means every remaining installment is
      // covered, not just the submission-level label. "Unpaid"/"Refunded"
      // go the other way and reopen whatever's currently marked paid.
      if (status === 'paid') {
        const remainingTotal = installments.filter(i => !i.paid_at).reduce((s, i) => s + i.amount, 0);
        if (remainingTotal > 0) await markInstallmentsPaid(remainingTotal, 'other', null);
      } else if (status === 'unpaid' || status === 'refunded') {
        await reopenInstallments();
      }
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  // ── Notes ────────────────────────────────────────────────────────────────────

  const handleNotesSave = async () => {
    setNotesSaving(true);
    try {
      await patch({ internal_notes: notes });
      showToast('Notes saved');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setNotesSaving(false);
    }
  };

  // ── Roster ───────────────────────────────────────────────────────────────────

  const handleAddToRoster = async () => {
    if (!rosterTeamId || !rosterName.trim()) {
      setRosterError('Team and player name are required');
      return;
    }
    setRosterAdding(true);
    setRosterError(null);
    try {
      const { data: playerRow, error: playerErr } = await supabase
        .from('players')
        .insert({
          team_id:      rosterTeamId,
          full_name:    rosterName.trim(),
          position:     rosterPosition.trim() || null,
          jersey_number: rosterJersey ? parseInt(rosterJersey, 10) : null,
          profile_id:   null,
        })
        .select('id')
        .single();

      if (playerErr) throw playerErr;

      const playerId = (playerRow as { id: string }).id;
      const now      = new Date().toISOString();

      await patch({ roster_added_at: now, roster_player_id: playerId });
      showToast('Added to roster');
    } catch (e) {
      setRosterError((e as Error).message);
    } finally {
      setRosterAdding(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const fields       = formFields(form);
  const balance      = (currentSub.amount_due ?? 0) - currentSub.amount_paid;
  const currency     = form.currency;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Dark backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.52)', backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1001,
          width: '720px', maxWidth: '100vw',
          background: '#F8FAFC', display: 'flex', flexDirection: 'column',
          boxShadow: '-6px 0 40px rgba(0,0,0,0.18)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          background: '#fff', borderBottom: '1px solid #E2E8F0',
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          gap: '12px', flexShrink: 0,
        }}>
          <button onClick={onClose} style={backBtnSt}>
            <ArrowLeft size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            Back
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontSize: '17px', fontWeight: 700, color: '#0F172A',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {playerName(currentSub.data)}
            </h2>
            <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8' }}>
              {form.title} · Submitted {fmtDate(currentSub.submitted_at)}
            </p>
          </div>

          {/* Team — from the Tryout module's Team Builder, when this
              submission is linked to an accepted tryout offer */}
          {tryoutTeam && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              fontSize: '12px', fontWeight: 700, padding: '5px 12px',
              borderRadius: '20px', border: `1.5px solid ${primary}`,
              color: primary, background: `${primary}12`, whiteSpace: 'nowrap',
            }}>
              {tryoutTeam}
            </span>
          )}

          <button onClick={() => setShowDeleteConfirm(true)} title="Delete submission"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}>
            <Trash2 size={13} />
          </button>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div style={{
          background: '#fff', borderBottom: '1px solid #E2E8F0',
          padding: '0 24px', display: 'flex', flexShrink: 0,
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '12px 16px', border: 'none', background: 'none',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                color: activeTab === t.id ? primary : '#64748B',
                borderBottom: activeTab === t.id
                  ? `2.5px solid ${primary}` : '2.5px solid transparent',
                fontFamily: 'inherit', transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab body ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* ── Details ─────────────────────────────────────────────────── */}
          {activeTab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {currentSub.financial_aid_requested && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: '#F5F3FF', border: '1px solid #C4B5FD',
                  borderRadius: '10px', padding: '12px 16px',
                }}>
                  <AlertTriangle size={15} color="#7C3AED" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: '#5B21B6', fontWeight: 600 }}>
                    Financial assistance requested
                  </span>
                </div>
              )}

              {currentSub.is_duplicate_flagged && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: '#FFFBEB', border: '1px solid #F59E0B',
                  borderRadius: '10px', padding: '12px 16px',
                }}>
                  <AlertTriangle size={15} color="#D97706" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: '#92400E', fontWeight: 600 }}>
                    Possible duplicate submission flagged
                  </span>
                </div>
              )}

              {currentSub.is_returning !== null && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start',
                  fontSize: '12px', fontWeight: 700, padding: '4px 12px',
                  borderRadius: '20px',
                  background: currentSub.is_returning ? '#DCFCE7' : '#EFF6FF',
                  color: currentSub.is_returning ? '#16A34A' : '#2563EB',
                }}>
                  {currentSub.is_returning ? 'Returning player' : 'New player'}
                </span>
              )}

              <div style={{
                background: '#fff', border: '1px solid #E2E8F0',
                borderRadius: '12px', overflow: 'hidden',
              }}>
                {fields.filter(f => f.type !== 'section').length === 0 ? (
                  <div style={{ padding: '20px', color: '#94A3B8', fontSize: '13px' }}>
                    No fields recorded.
                  </div>
                ) : (
                  fields.filter(f => f.type !== 'section').map((field, idx, arr) => (
                    <div
                      key={field.label}
                      style={{
                        padding: '14px 20px',
                        borderBottom: idx < arr.length - 1 ? '1px solid #F1F5F9' : 'none',
                      }}
                    >
                      <div style={labelSt}>{field.label}</div>
                      <div style={{ fontSize: '14px', color: '#0F172A', wordBreak: 'break-word' }}>
                        {!currentSub.data[field.label]
                          ? <span style={{ color: '#CBD5E1' }}>—</span>
                          : field.type === 'file'
                            ? <ViewUploadedFileLink url={currentSub.data[field.label]} />
                            : currentSub.data[field.label]}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Required documents ─────────────────────────────────────── */}
          {normalizeRequiredDocs(form.required_docs).length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={labelSt}>Required documents</div>
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', marginTop: '6px' }}>
                {normalizeRequiredDocs(form.required_docs).map((doc, idx, arr) => {
                  const url = currentSub.data[requiredDocDataKey(doc.name)];
                  return (
                    <div key={doc.name} style={{ padding: '14px 20px', borderBottom: idx < arr.length - 1 ? '1px solid #F1F5F9' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <span style={{ fontSize: '14px', color: '#0F172A', fontWeight: 600 }}>{doc.name}</span>
                      {url ? (
                        <ViewUploadedFileLink url={url} />
                      ) : (
                        <span style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600 }}>Not uploaded</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Payment ─────────────────────────────────────────────────── */}
          {activeTab === 'payment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {currentSub.fee_waived && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: '#DCFCE7', border: '1px solid #86EFAC',
                  borderRadius: '10px', padding: '12px 16px',
                }}>
                  <CheckCircle size={15} color="#16A34A" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: '#15803D', fontWeight: 600 }}>
                    Fee waived — no payment required
                  </span>
                </div>
              )}

              {/* Amounts */}
              <div style={{
                background: '#fff', border: '1px solid #E2E8F0',
                borderRadius: '12px', padding: '20px',
                display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px',
              }}>
                {([
                  { label: 'Amount due',  val: fmtMoney(currentSub.amount_due, currency),  clr: undefined },
                  { label: 'Amount paid', val: fmtMoney(currentSub.amount_paid, currency), clr: '#16A34A'  },
                  { label: 'Balance',     val: fmtMoney(balance, currency),                clr: balance > 0 ? '#DC2626' : '#16A34A' },
                ] as Array<{ label: string; val: string; clr: string | undefined }>).map(item => (
                  <div key={item.label} style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '10px', fontWeight: 700, color: '#94A3B8',
                      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px',
                    }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: item.clr ?? '#0F172A' }}>
                      {item.val}
                    </div>
                  </div>
                ))}
              </div>

              {/* Online payment schedule — real Stripe links, distinct from the
                  manual "Record offline payment" fallback below */}
              {installments.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CreditCard size={15} color="#64748B" />
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Online payment schedule</div>
                    </div>
                    {autopayOn && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A' }}>Autopay on</span>
                        <button onClick={stopAutopay} disabled={stoppingAutopay}
                          style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}>
                          {stoppingAutopay ? 'Stopping…' : 'Stop autopay'}
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {installments.map(inst => {
                      const isPaid = !!inst.paid_at;
                      const refunded = inst.refunded_amount ?? 0;
                      const fullyRefunded = isPaid && refunded >= inst.amount - 0.005;
                      const partiallyRefunded = isPaid && refunded > 0 && !fullyRefunded;
                      return (
                        <div key={inst.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                          padding: '10px 14px', borderRadius: '9px',
                          background: isPaid ? '#F0FDF4' : '#FAFAFA', border: `1px solid ${isPaid ? '#BBF7D0' : '#E2E8F0'}`,
                        }}>
                          <div>
                            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>{fmtMoney(inst.amount, currency)}</div>
                            <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>{isPaid ? `Paid ${fmtDate(inst.paid_at!)}` : `Due ${fmtDate(inst.due_date)}`}</div>
                            {!isPaid && inst.charge_attempts > 0 && (
                              <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>
                                {inst.charge_attempts} failed auto-charge attempt{inst.charge_attempts === 1 ? '' : 's'}
                                {inst.last_charge_error ? ` — ${inst.last_charge_error}` : ''}
                              </div>
                            )}
                            {partiallyRefunded && (
                              <div style={{ fontSize: '11px', color: '#D97706', marginTop: '2px', fontWeight: 600 }}>
                                {fmtMoney(refunded, currency)} refunded
                              </div>
                            )}
                          </div>
                          {fullyRefunded ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 700, color: '#D97706' }}>
                              <RotateCcw size={13} /> Refunded
                            </span>
                          ) : isPaid ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 700, color: '#16A34A' }}>
                                <CheckCircle size={13} /> Paid
                              </span>
                              <button onClick={() => setRefundTarget({ id: inst.id, amount: inst.amount, refunded_amount: refunded })}
                                style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid #FECACA', background: '#fff', color: '#DC2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                                Refund
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => copyPayLink(inst)}
                              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', background: '#fff', border: '1px solid #E2E8F0', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#374151' }}>
                              <Copy size={12} /> {copiedId === inst.id ? 'Copied!' : 'Copy link'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Payment status quick override */}
              <div style={{
                background: '#fff', border: '1px solid #E2E8F0',
                borderRadius: '12px', padding: '16px 20px',
              }}>
                <div style={labelSt}>Quick payment status override</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                  {PAY_STATUSES.map(ps => {
                    const st       = PAY_STATUS_STYLES[ps];
                    const isActive = currentSub.payment_status === ps;
                    return (
                      <button
                        key={ps}
                        onClick={() => handlePayStatusOverride(ps)}
                        style={{
                          padding: '6px 14px', borderRadius: '8px',
                          border: isActive ? `2px solid ${st.color}` : '1.5px solid #E2E8F0',
                          background: isActive ? st.bg : '#F8FAFC',
                          color: isActive ? st.color : '#64748B',
                          fontSize: '12px', fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {st.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Offline payment */}
              {!currentSub.fee_waived && (
                <div style={{
                  background: '#fff', border: '1px solid #E2E8F0',
                  borderRadius: '12px', padding: '20px',
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>
                    Record offline payment
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelSt}>Method</label>
                      <select
                        value={offlineMethod}
                        onChange={e => setOfflineMethod(e.target.value as OfflineMethod)}
                        style={{ ...inputSt, cursor: 'pointer' }}
                      >
                        {OFFLINE_METHODS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelSt}>Amount ({currency})</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={offlineAmount}
                        onChange={e => setOfflineAmount(e.target.value)}
                        placeholder="0.00"
                        style={inputSt}
                      />
                    </div>
                    <div>
                      <label style={labelSt}>Date</label>
                      <input
                        type="date"
                        value={offlineDate}
                        onChange={e => setOfflineDate(e.target.value)}
                        style={inputSt}
                      />
                    </div>
                    <div>
                      <label style={labelSt}>Reference (optional)</label>
                      <input
                        type="text"
                        value={offlineRef}
                        onChange={e => setOfflineRef(e.target.value)}
                        placeholder="Cheque no. / bank ref…"
                        style={inputSt}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleOfflineSave}
                    disabled={offlineSaving || !offlineAmount}
                    style={{
                      marginTop: '14px', padding: '9px 20px',
                      borderRadius: '8px', border: 'none',
                      background: primary, color: '#fff',
                      fontSize: '13px', fontWeight: 600,
                      cursor: offlineSaving || !offlineAmount ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', opacity: offlineSaving ? 0.7 : 1,
                    }}
                  >
                    {offlineSaving ? 'Saving…' : 'Save payment'}
                  </button>
                </div>
              )}

              {/* Financial aid */}
              {(form.financial_aid_enabled || currentSub.financial_aid_requested) && (
                <div style={{
                  background: '#fff', border: '1px solid #E2E8F0',
                  borderRadius: '12px', padding: '20px',
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                    Financial assistance
                  </div>

                  {currentSub.financial_aid_approved === true && (
                    <div style={{
                      background: '#DCFCE7', borderRadius: '8px', padding: '10px 14px',
                      fontSize: '13px', color: '#15803D', fontWeight: 600,
                    }}>
                      Approved{currentSub.financial_aid_amount
                        ? ` — ${fmtMoney(currentSub.financial_aid_amount, currency)} discount applied`
                        : ' — full fee waived'}
                    </div>
                  )}
                  {currentSub.financial_aid_approved === false && (
                    <div style={{
                      background: '#FEE2E2', borderRadius: '8px', padding: '10px 14px',
                      fontSize: '13px', color: '#DC2626', fontWeight: 600,
                    }}>
                      Assistance request declined
                    </div>
                  )}
                  {currentSub.financial_aid_approved === null && (
                    <>
                      <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748B' }}>
                        {currentSub.financial_aid_requested
                          ? 'This family has requested financial assistance.'
                          : 'You can grant financial assistance for this registration.'}
                      </p>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div>
                          <label style={labelSt}>
                            Partial waiver amount — leave blank to waive full fee
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={aidAmount}
                            onChange={e => setAidAmount(e.target.value)}
                            placeholder={`0.00 (${currency})`}
                            style={{ ...inputSt, width: '180px' }}
                          />
                        </div>
                        <button
                          onClick={() => handleAidApprove(aidAmount.trim() === '')}
                          disabled={aidSaving}
                          style={{
                            padding: '10px 16px', borderRadius: '8px', border: 'none',
                            background: '#16A34A', color: '#fff', fontSize: '13px',
                            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            opacity: aidSaving ? 0.7 : 1,
                          }}
                        >
                          {aidAmount.trim() ? 'Approve partial' : 'Approve full waiver'}
                        </button>
                        <button
                          onClick={handleAidDeny}
                          disabled={aidSaving}
                          style={{
                            padding: '10px 16px', borderRadius: '8px',
                            border: '1.5px solid #E2E8F0',
                            background: '#fff', color: '#DC2626', fontSize: '13px',
                            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            opacity: aidSaving ? 0.7 : 1,
                          }}
                        >
                          Deny
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Promo / discount info */}
              {currentSub.promo_code_used && (
                <div style={{
                  background: '#F0FDF4', border: '1px solid #86EFAC',
                  borderRadius: '10px', padding: '12px 16px', fontSize: '13px',
                  color: '#15803D',
                }}>
                  Promo code applied: <strong>{currentSub.promo_code_used}</strong>
                  {currentSub.discount_applied > 0
                    ? ` — ${fmtMoney(currentSub.discount_applied, currency)} discount`
                    : ''}
                </div>
              )}
            </div>
          )}

          {/* ── Notes ───────────────────────────────────────────────────── */}
          {activeTab === 'notes' && (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#94A3B8' }}>
                Coaches only — not visible to parents.
              </p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={handleNotesSave}
                placeholder="Add private notes about this submission…"
                rows={10}
                style={{
                  ...inputSt, resize: 'vertical', lineHeight: '1.6', minHeight: '180px',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                <button
                  onClick={handleNotesSave}
                  disabled={notesSaving}
                  style={{
                    padding: '8px 18px', borderRadius: '8px', border: 'none',
                    background: primary, color: '#fff', fontSize: '13px',
                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    opacity: notesSaving ? 0.7 : 1,
                  }}
                >
                  {notesSaving ? 'Saving…' : 'Save notes'}
                </button>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>Auto-saves on blur</span>
              </div>
            </div>
          )}

          {/* ── Roster ──────────────────────────────────────────────────── */}
          {activeTab === 'roster' && (
            <div>
              {currentSub.roster_added_at ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  background: '#DCFCE7', border: '1px solid #86EFAC',
                  borderRadius: '12px', padding: '18px 20px',
                }}>
                  <CheckCircle size={22} color="#16A34A" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#15803D' }}>
                      Added to roster
                    </div>
                    <div style={{ fontSize: '12px', color: '#16A34A', marginTop: '3px' }}>
                      {playerName(currentSub.data)} · {fmtDate(currentSub.roster_added_at)}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: '#fff', border: '1px solid #E2E8F0',
                  borderRadius: '12px', padding: '20px',
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                    Add to team roster
                  </div>
                  <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748B' }}>
                    This will create a player entry in the selected team.
                  </p>

                  {rosterError && (
                    <div style={{
                      background: '#FEF2F2', border: '1px solid #FECACA',
                      borderRadius: '8px', padding: '10px 14px',
                      fontSize: '13px', color: '#DC2626', marginBottom: '14px',
                    }}>
                      {rosterError}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelSt}>Team</label>
                      <select
                        value={rosterTeamId}
                        onChange={e => setRosterTeamId(e.target.value)}
                        style={{ ...inputSt, cursor: 'pointer' }}
                      >
                        <option value="">Select team…</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelSt}>Player name</label>
                      <input
                        type="text"
                        value={rosterName}
                        onChange={e => setRosterName(e.target.value)}
                        style={inputSt}
                      />
                    </div>
                    <div>
                      <label style={labelSt}>Position</label>
                      <input
                        type="text"
                        value={rosterPosition}
                        onChange={e => setRosterPosition(e.target.value)}
                        placeholder="e.g. Midfielder"
                        style={inputSt}
                      />
                    </div>
                    <div>
                      <label style={labelSt}>Jersey number</label>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={rosterJersey}
                        onChange={e => setRosterJersey(e.target.value)}
                        placeholder="e.g. 7"
                        style={inputSt}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleAddToRoster}
                    disabled={rosterAdding || !rosterTeamId || !rosterName.trim()}
                    style={{
                      marginTop: '16px',
                      display: 'inline-flex', alignItems: 'center', gap: '7px',
                      padding: '10px 20px', borderRadius: '8px', border: 'none',
                      background: primary, color: '#fff', fontSize: '13px',
                      fontWeight: 600,
                      cursor: rosterAdding || !rosterTeamId || !rosterName.trim()
                        ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', opacity: rosterAdding ? 0.7 : 1,
                    }}
                  >
                    <UserPlus size={14} />
                    {rosterAdding ? 'Adding…' : 'Add to team roster'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }} onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: '15px', color: '#0F172A', marginBottom: '8px' }}>Delete this submission?</div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 18px', lineHeight: 1.5 }}>
              {currentSub.amount_paid > 0
                ? `This submission has ${fmtMoney(currentSub.amount_paid, currency)} paid. Refund every payment on it first — the delete button won't work until then.`
                : 'This permanently removes the submission and its payment schedule. This can\'t be undone.'}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              {currentSub.amount_paid <= 0 && (
                <button onClick={handleDeleteSubmission} disabled={deleting} style={{ padding: '9px 16px', borderRadius: '9px', border: 'none', background: '#DC2626', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: deleting ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                  {deleting ? 'Deleting…' : 'Delete submission'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {refundTarget && (
        <RegistrationRefundModal
          target={refundTarget}
          currency={currency}
          onClose={() => setRefundTarget(null)}
          onDone={async () => { setRefundTarget(null); await loadInstallments(); onUpdated(); showToast('Refund issued'); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
          background: '#1E293B', color: '#fff', fontSize: '13px', fontWeight: 600,
          padding: '10px 20px', borderRadius: '10px', zIndex: 2000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.22)', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}
    </>
  );
}

// registration-docs is a private bucket (family-uploaded documents —
// birth certificates, medical forms, etc — deliberately not publicly
// fetchable, see migration 20260816000003). getPublicUrl() was still used
// at upload time (it's the only URL-shaped identifier we have to store),
// but that URL 404s for anyone without a signed URL — this mints one
// on demand, scoped by RLS to the viewing staff member's own club.
const PRIVATE_DOC_BUCKET = 'registration-docs';

function ViewUploadedFileLink({ url }: { url: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    const marker = `/storage/v1/object/public/${PRIVATE_DOC_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
    const path = decodeURIComponent(url.slice(idx + marker.length));

    setLoading(true);
    const { data, error } = await supabase.storage.from(PRIVATE_DOC_BUCKET).createSignedUrl(path, 300);
    setLoading(false);

    if (error || !data?.signedUrl) {
      window.alert(`Could not open this file: ${error?.message ?? 'unknown error'}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <button onClick={handleClick} disabled={loading}
      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', fontWeight: 700, color: loading ? '#94A3B8' : '#16A34A', background: 'none', border: 'none', padding: 0, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit' }}>
      <CheckCircle size={13} /> {loading ? 'Opening…' : 'View file'}
    </button>
  );
}

function RegistrationRefundModal({ target, currency, onClose, onDone }: {
  target: { id: string; amount: number; refunded_amount: number };
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const refundable = Math.max(0, target.amount - target.refunded_amount);
  const [mode, setMode] = useState<'full' | 'amount'>('full');
  const [amount, setAmount] = useState(refundable.toFixed(2));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSaving(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/registration/refund-installment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installment_id: target.id, mode,
          value: mode === 'amount' ? parseFloat(amount) : undefined,
          reason: reason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not process refund.');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontWeight: 800, fontSize: '15px', color: '#0F172A' }}>Refund payment</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex' }}><X size={16} /></button>
        </div>

        <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px' }}>
          {fmtMoney(refundable, currency)} refundable of {fmtMoney(target.amount, currency)} paid.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {(['full', 'amount'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ flex: 1, padding: '9px', borderRadius: '9px', border: `2px solid ${mode === m ? '#DC2626' : '#E2E8F0'}`, background: mode === m ? '#FEF2F2' : '#fff', color: mode === m ? '#DC2626' : '#374151', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {m === 'full' ? 'Full refund' : 'Partial amount'}
            </button>
          ))}
        </div>

        {mode === 'amount' && (
          <div style={{ marginBottom: '14px' }}>
            <label style={labelSt}>Amount</label>
            <input type="number" min="0" step="0.01" max={refundable} value={amount} onChange={e => setAmount(e.target.value)} style={inputSt} />
          </div>
        )}

        <div style={{ marginBottom: '18px' }}>
          <label style={labelSt}>Reason (optional)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. duplicate registration" style={inputSt} />
        </div>

        {error && <p style={{ fontSize: '12.5px', color: '#DC2626', margin: '0 0 14px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={submit} disabled={saving || refundable <= 0} style={{ padding: '9px 16px', borderRadius: '9px', border: 'none', background: '#DC2626', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Processing…' : 'Issue refund'}
          </button>
        </div>
      </div>
    </div>
  );
}
