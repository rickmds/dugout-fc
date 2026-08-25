'use client';

import { useState, useCallback } from 'react';
import {
  ArrowLeft, ChevronDown, CheckCircle, XCircle, Clock,
  AlertTriangle, UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import {
  RegForm, Submission, SubStatus, PaymentStatus, OfflineMethod,
  SUB_STATUS_STYLES, PAY_STATUS_STYLES,
  fmtMoney, fmtDate, formFields, playerName,
  labelSt, inputSt, backBtnSt,
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

const STATUS_OPTIONS: SubStatus[] = ['pending', 'approved', 'waitlisted', 'declined'];

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
  const [showStatusDrop, setShowStatusDrop]     = useState(false);
  const [statusSaving, setStatusSaving]         = useState(false);
  const [toast, setToast]                       = useState<string | null>(null);

  // Payment tab
  const [offlineMethod, setOfflineMethod]       = useState<OfflineMethod>('cash');
  const [offlineAmount, setOfflineAmount]       = useState('');
  const [offlineDate, setOfflineDate]           = useState('');
  const [offlineRef, setOfflineRef]             = useState('');
  const [offlineSaving, setOfflineSaving]       = useState(false);

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

  // ── Status change ────────────────────────────────────────────────────────────

  const handleStatusChange = useCallback(async (newStatus: SubStatus) => {
    setStatusSaving(true);
    setShowStatusDrop(false);
    try {
      // Promoting someone off the waitlist needs the "a spot opened up"
      // email and resequencing everyone else's waitlist_position — a plain
      // status update here silently skips both, so route this one
      // transition through the API instead of the generic patch().
      if (currentSub.status === 'waitlisted' && newStatus === 'approved') {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/registrations/promote-waitlist', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission_id: currentSub.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Could not promote from waitlist.');
        setCurrentSub(prev => ({ ...prev, status: 'approved', waitlist_position: null }));
        onUpdated();
        return;
      }
      const update: Partial<Submission> = {
        status: newStatus,
        waitlist_position: newStatus === 'waitlisted' ? currentSub.waitlist_position : null,
      };
      await patch(update);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setStatusSaving(false);
    }
  }, [currentSub.id, currentSub.status, currentSub.waitlist_position, patch, onUpdated]);

  // ── Offline payment ──────────────────────────────────────────────────────────

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
  const statusStyle  = SUB_STATUS_STYLES[currentSub.status];
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

          {/* Status badge + dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowStatusDrop(v => !v)}
              disabled={statusSaving}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                fontSize: '12px', fontWeight: 700, padding: '5px 12px',
                borderRadius: '20px', border: `1.5px solid ${statusStyle.color}`,
                color: statusStyle.color, background: statusStyle.bg,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {statusStyle.label}
              <ChevronDown size={11} />
            </button>
            {showStatusDrop && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                background: '#fff', border: '1px solid #E2E8F0',
                borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                zIndex: 10, minWidth: '145px', overflow: 'hidden',
              }}>
                {STATUS_OPTIONS.map(s => {
                  const st = SUB_STATUS_STYLES[s];
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '9px 14px', border: 'none', background: 'none',
                        fontSize: '13px', fontWeight: 600, color: st.color,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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
                      key={field.id}
                      style={{
                        padding: '14px 20px',
                        borderBottom: idx < arr.length - 1 ? '1px solid #F1F5F9' : 'none',
                      }}
                    >
                      <div style={labelSt}>{field.label}</div>
                      <div style={{ fontSize: '14px', color: '#0F172A', wordBreak: 'break-word' }}>
                        {currentSub.data[field.id]
                          ? currentSub.data[field.id]
                          : <span style={{ color: '#CBD5E1' }}>—</span>}
                      </div>
                    </div>
                  ))
                )}
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

        {/* ── Bottom action bar ────────────────────────────────────────────── */}
        <div style={{
          background: '#fff', borderTop: '1px solid #E2E8F0',
          padding: '14px 24px', display: 'flex', gap: '10px', flexShrink: 0,
        }}>
          <button
            onClick={() => handleStatusChange('approved')}
            disabled={statusSaving || currentSub.status === 'approved'}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '7px', padding: '10px', borderRadius: '8px', border: 'none',
              background: '#22C55E', color: '#fff', fontSize: '13px', fontWeight: 700,
              cursor: statusSaving || currentSub.status === 'approved' ? 'not-allowed' : 'pointer',
              opacity: currentSub.status === 'approved' ? 0.45 : 1,
              fontFamily: 'inherit',
            }}
          >
            <CheckCircle size={14} />
            Approve
          </button>
          <button
            onClick={() => handleStatusChange('waitlisted')}
            disabled={statusSaving || currentSub.status === 'waitlisted'}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '7px', padding: '10px', borderRadius: '8px', border: 'none',
              background: '#7C3AED', color: '#fff', fontSize: '13px', fontWeight: 700,
              cursor: statusSaving || currentSub.status === 'waitlisted' ? 'not-allowed' : 'pointer',
              opacity: currentSub.status === 'waitlisted' ? 0.45 : 1,
              fontFamily: 'inherit',
            }}
          >
            <Clock size={14} />
            Waitlist
          </button>
          <button
            onClick={() => handleStatusChange('declined')}
            disabled={statusSaving || currentSub.status === 'declined'}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '7px', padding: '10px', borderRadius: '8px', border: 'none',
              background: '#EF4444', color: '#fff', fontSize: '13px', fontWeight: 700,
              cursor: statusSaving || currentSub.status === 'declined' ? 'not-allowed' : 'pointer',
              opacity: currentSub.status === 'declined' ? 0.45 : 1,
              fontFamily: 'inherit',
            }}
          >
            <XCircle size={14} />
            Decline
          </button>
        </div>
      </div>

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
