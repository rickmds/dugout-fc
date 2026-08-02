'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, DollarSign, AlertCircle, CheckCircle, Clock,
  TrendingUp, Mail, Trash2, Plus, RefreshCw, Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import {
  RegForm, Submission, Installment, PromoCode, PaymentStatus, DiscountType,
  PAY_STATUS_STYLES,
  fmtMoney, fmtDate, playerName, uid,
  labelSt, inputSt,
} from './shared';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubTab = 'all' | 'installments' | 'promo' | 'stripe';

interface RowWithForm extends Submission {
  form_title: string;
  form_currency: string;
}

interface InstallmentGroup {
  sub:          RowWithForm;
  installments: Installment[];
}

interface NewPromo {
  code:          string;
  discount_type: DiscountType;
  discount_value: string;
  max_uses:       string;
  expires_at:     string;
  form_id:        string;
}

// ── Style constants ───────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
  color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em',
  whiteSpace: 'nowrap', background: '#1E293B',
};

const TD: React.CSSProperties = {
  padding: '11px 14px', fontSize: '13px', color: '#334155',
};

const SELECT_ST: React.CSSProperties = {
  fontSize: '13px', padding: '7px 12px', borderRadius: '10px',
  border: '1px solid #E2E8F0', background: '#F8FAFC',
  color: '#334155', outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
};

const STAT_CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px',
  padding: '20px 22px', flex: '1 1 180px',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaymentsTab() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000'
    ? club.primary_color : '#22C55E';

  // ── State ───────────────────────────────────────────────────────────────────

  const [subTab, setSubTab]           = useState<SubTab>('all');
  const [forms, setForms]             = useState<RegForm[]>([]);
  const [rows, setRows]               = useState<RowWithForm[]>([]);
  const [installGroups, setInstallGroups] = useState<InstallmentGroup[]>([]);
  const [promos, setPromos]           = useState<PromoCode[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [toast, setToast]             = useState<string | null>(null);

  // Filters
  const [filterFormId, setFilterFormId]   = useState('');
  const [filterPayStatus, setFilterPayStatus] = useState<PaymentStatus | ''>('');

  // Promo creation form
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [newPromo, setNewPromo]           = useState<NewPromo>({
    code: '', discount_type: 'percent', discount_value: '',
    max_uses: '', expires_at: '', form_id: '',
  });
  const [promoSaving, setPromoSaving]     = useState(false);

  // Marking paid
  const [markingId, setMarkingId]         = useState<string | null>(null);
  const [chasingAll, setChasingAll]       = useState(false);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load data ────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    setError(null);
    try {
      const { data: formsData, error: fe } = await supabase
        .from('registration_forms')
        .select('*')
        .eq('club_id', club.id)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (fe) throw fe;
      const loadedForms = (formsData ?? []) as RegForm[];
      setForms(loadedForms);

      if (loadedForms.length === 0) {
        setRows([]);
        setInstallGroups([]);
        setLoading(false);
        return;
      }

      const formMap = new Map<string, RegForm>();
      for (const f of loadedForms) formMap.set(f.id, f);

      const formIds = loadedForms.map(f => f.id);

      const { data: subsData, error: se } = await supabase
        .from('registration_submissions')
        .select('*')
        .in('form_id', formIds)
        .order('submitted_at', { ascending: false });

      if (se) throw se;
      const subs = (subsData ?? []) as Submission[];

      const mappedRows: RowWithForm[] = subs.map(s => ({
        ...s,
        form_title:    formMap.get(s.form_id)?.title    ?? '—',
        form_currency: formMap.get(s.form_id)?.currency ?? 'GBP',
      }));
      setRows(mappedRows);

      // Load installments for plan submissions
      const planSubs = subs.filter(s => s.payment_choice === 'plan');
      if (planSubs.length > 0) {
        const planSubIds = planSubs.map(s => s.id);
        const { data: installData } = await supabase
          .from('registration_installments')
          .select('*')
          .in('submission_id', planSubIds)
          .order('due_date', { ascending: true });

        const installments = (installData ?? []) as Installment[];

        const groups: InstallmentGroup[] = planSubs.map(s => {
          const mRow = mappedRows.find(r => r.id === s.id);
          return {
            sub:          mRow ?? { ...s, form_title: formMap.get(s.form_id)?.title ?? '—', form_currency: formMap.get(s.form_id)?.currency ?? 'GBP' },
            installments: installments.filter(i => i.submission_id === s.id),
          };
        });
        setInstallGroups(groups);
      } else {
        setInstallGroups([]);
      }

      // Load promo codes
      const { data: promoData } = await supabase
        .from('registration_promo_codes')
        .select('*')
        .eq('club_id', club.id)
        .order('created_at', { ascending: false });

      setPromos((promoData ?? []) as PromoCode[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [club]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived stats ─────────────────────────────────────────────────────────

  const now30DaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const totalExpected   = rows.reduce((a, r) => a + (r.amount_due ?? 0), 0);
  const totalCollected  = rows.reduce((a, r) => a + r.amount_paid, 0);
  const totalOutstanding = rows.reduce((a, r) => a + Math.max(0, (r.amount_due ?? 0) - r.amount_paid), 0);
  const totalOverdue    = rows.filter(r =>
    r.payment_status === 'unpaid'
    && r.amount_due !== null
    && r.amount_due > 0
    && new Date(r.submitted_at).getTime() < now30DaysAgo,
  ).reduce((a, r) => a + (r.amount_due ?? 0), 0);

  const primaryCurrency = forms[0]?.currency ?? 'GBP';

  // Filtered payment rows
  const filteredRows = rows.filter(r => {
    if (r.amount_due === null || r.amount_due === 0) return false;
    if (filterFormId     && r.form_id        !== filterFormId)     return false;
    if (filterPayStatus  && r.payment_status !== filterPayStatus)  return false;
    return true;
  });

  // ── Mark row as paid ──────────────────────────────────────────────────────

  const handleMarkPaid = async (row: RowWithForm) => {
    setMarkingId(row.id);
    try {
      const { error } = await supabase
        .from('registration_submissions')
        .update({
          payment_status: 'paid',
          amount_paid:    row.amount_due ?? row.amount_paid,
        })
        .eq('id', row.id);
      if (error) throw error;
      await loadData();
      showToast('Marked as paid');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setMarkingId(null);
    }
  };

  // ── Chase all unpaid ──────────────────────────────────────────────────────

  const handleChaseAll = async () => {
    const unpaidRows = filteredRows.filter(r =>
      r.payment_status === 'unpaid' || r.payment_status === 'partial',
    );
    if (unpaidRows.length === 0) { showToast('No unpaid rows to chase'); return; }
    setChasingAll(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      await fetch('/api/registrations/bulk-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          submission_ids: unpaidRows.map(r => r.id),
          template:       'payment_reminder',
        }),
      });
      showToast(`Payment reminder sent to ${unpaidRows.length} families`);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setChasingAll(false);
    }
  };

  // ── Generate installment plan ─────────────────────────────────────────────

  const handleGeneratePlan = async (group: InstallmentGroup) => {
    const form = forms.find(f => f.id === group.sub.form_id);
    if (!form) return;

    const n          = form.plan_installments || 3;
    const freq       = form.plan_frequency || 'monthly';
    const deposit    = form.plan_deposit ?? 0;
    const total      = group.sub.amount_due ?? 0;
    const remaining  = total - deposit;
    const perPmt     = remaining > 0 ? +(remaining / n).toFixed(2) : 0;

    const installments: Array<{
      submission_id: string;
      amount:        number;
      due_date:      string;
    }> = [];
    const today = new Date();

    for (let i = 0; i < n; i++) {
      const dueDate = new Date(today);
      if (freq === 'monthly') {
        dueDate.setMonth(dueDate.getMonth() + i + 1);
      } else {
        dueDate.setDate(dueDate.getDate() + (i + 1) * 7);
      }
      installments.push({
        submission_id: group.sub.id,
        amount:        i === 0 && deposit > 0 ? deposit : perPmt,
        due_date:      dueDate.toISOString().slice(0, 10),
      });
    }

    const { error } = await supabase
      .from('registration_installments')
      .insert(installments);

    if (error) {
      showToast(error.message);
    } else {
      await loadData();
      showToast('Installment plan created');
    }
  };

  // ── Mark installment paid ─────────────────────────────────────────────────

  const handleMarkInstallmentPaid = async (inst: Installment) => {
    const { error } = await supabase
      .from('registration_installments')
      .update({ paid_at: new Date().toISOString() })
      .eq('id', inst.id);

    if (error) { showToast(error.message); return; }
    await loadData();
    showToast('Installment marked paid');
  };

  // ── Promo code helpers ────────────────────────────────────────────────────

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const handlePromoSave = async () => {
    if (!newPromo.code.trim() || !newPromo.discount_value) return;
    if (!club) return;
    setPromoSaving(true);
    try {
      const { error } = await supabase
        .from('registration_promo_codes')
        .insert({
          id:             uid(),
          club_id:        club.id,
          form_id:        newPromo.form_id || null,
          code:           newPromo.code.trim().toUpperCase(),
          discount_type:  newPromo.discount_type,
          discount_value: parseFloat(newPromo.discount_value),
          max_uses:       newPromo.max_uses ? parseInt(newPromo.max_uses, 10) : null,
          expires_at:     newPromo.expires_at || null,
          active:         true,
          uses_count:     0,
        });
      if (error) throw error;
      await loadData();
      setShowPromoForm(false);
      setNewPromo({ code: '', discount_type: 'percent', discount_value: '', max_uses: '', expires_at: '', form_id: '' });
      showToast('Promo code created');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setPromoSaving(false);
    }
  };

  const handlePromoToggle = async (promo: PromoCode) => {
    const { error } = await supabase
      .from('registration_promo_codes')
      .update({ active: !promo.active })
      .eq('id', promo.id);
    if (error) { showToast(error.message); return; }
    await loadData();
  };

  const handlePromoDelete = async (promoId: string) => {
    const { error } = await supabase
      .from('registration_promo_codes')
      .delete()
      .eq('id', promoId);
    if (error) { showToast(error.message); return; }
    await loadData();
    showToast('Promo code deleted');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px', color: '#94A3B8', fontSize: '14px',
      }}>
        Loading payments…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        margin: '24px', padding: '14px 18px', borderRadius: '10px',
        background: '#FEF2F2', border: '1px solid #FECACA',
        color: '#DC2626', fontSize: '13px',
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', background: '#F8FAFC', minHeight: '100%' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>
          Payments
        </h1>
        <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
          Track fees, installment plans, and promo codes across all forms.
        </p>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '22px' }}>
        {([
          {
            icon: <DollarSign size={16} color="#2563EB" />,
            label: 'Total expected',
            value: fmtMoney(totalExpected, primaryCurrency),
            bg: '#EFF6FF',
          },
          {
            icon: <CheckCircle size={16} color="#16A34A" />,
            label: 'Total collected',
            value: fmtMoney(totalCollected, primaryCurrency),
            bg: '#DCFCE7',
          },
          {
            icon: <Clock size={16} color="#D97706" />,
            label: 'Outstanding',
            value: fmtMoney(totalOutstanding, primaryCurrency),
            bg: '#FFFBEB',
          },
          {
            icon: <AlertCircle size={16} color="#DC2626" />,
            label: 'Overdue (>30 days)',
            value: fmtMoney(totalOverdue, primaryCurrency),
            bg: '#FEF2F2',
          },
        ] as Array<{ icon: React.ReactNode; label: string; value: string; bg: string }>).map(stat => (
          <div key={stat.label} style={{ ...STAT_CARD, background: stat.bg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
              {stat.icon}
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {stat.label}
              </span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sub-tabs ────────────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px',
        overflow: 'hidden',
      }}>
        <div style={{
          borderBottom: '1px solid #E2E8F0', padding: '0 20px',
          display: 'flex', gap: '2px',
        }}>
          {([
            { id: 'all' as SubTab,          label: 'All payments' },
            { id: 'installments' as SubTab, label: 'Installment plans' },
            { id: 'promo' as SubTab,        label: 'Promo codes' },
            { id: 'stripe' as SubTab,       label: 'Stripe' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              style={{
                padding: '13px 16px', border: 'none', background: 'none',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                color: subTab === t.id ? primary : '#64748B',
                borderBottom: subTab === t.id ? `2.5px solid ${primary}` : '2.5px solid transparent',
                fontFamily: 'inherit', transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '20px' }}>

          {/* ── ALL PAYMENTS ─────────────────────────────────────────────── */}
          {subTab === 'all' && (
            <>
              {/* Filters + chase button */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
                <select value={filterFormId} onChange={e => setFilterFormId(e.target.value)} style={SELECT_ST}>
                  <option value="">All forms</option>
                  {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
                <select
                  value={filterPayStatus}
                  onChange={e => setFilterPayStatus(e.target.value as PaymentStatus | '')}
                  style={SELECT_ST}
                >
                  <option value="">All statuses</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                  <option value="refunded">Refunded</option>
                </select>
                <div style={{ marginLeft: 'auto' }}>
                  <button
                    onClick={handleChaseAll}
                    disabled={chasingAll}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '7px',
                      padding: '8px 16px', borderRadius: '8px',
                      border: '1.5px solid #E2E8F0', background: '#fff',
                      color: '#334155', fontSize: '13px', fontWeight: 600,
                      cursor: chasingAll ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', opacity: chasingAll ? 0.7 : 1,
                    }}
                  >
                    <Mail size={13} />
                    {chasingAll ? 'Sending…' : 'Chase all unpaid'}
                  </button>
                </div>
              </div>

              {filteredRows.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '40px 20px',
                  color: '#94A3B8', fontSize: '13px',
                }}>
                  No payment rows match the current filters.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
                    <thead>
                      <tr>
                        <th style={TH}>Player</th>
                        <th style={TH}>Form</th>
                        <th style={TH}>Amount due</th>
                        <th style={TH}>Amount paid</th>
                        <th style={TH}>Balance</th>
                        <th style={TH}>Status</th>
                        <th style={TH}>Method</th>
                        <th style={TH}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, idx) => {
                        const balance = (row.amount_due ?? 0) - row.amount_paid;
                        const ps      = PAY_STATUS_STYLES[row.payment_status];
                        const now30   = new Date(row.submitted_at).getTime() < now30DaysAgo;
                        const isOverdue = row.payment_status === 'unpaid' && now30;
                        return (
                          <tr
                            key={row.id}
                            style={{
                              background: idx % 2 === 0 ? '#fff' : '#F8FAFC',
                              borderTop: '1px solid #E2E8F0',
                            }}
                          >
                            <td style={TD}>
                              <div style={{ fontWeight: 600, color: '#0F172A' }}>
                                {playerName(row.data)}
                              </div>
                            </td>
                            <td style={TD}>{row.form_title}</td>
                            <td style={TD}>{fmtMoney(row.amount_due, row.form_currency)}</td>
                            <td style={{ ...TD, color: '#16A34A', fontWeight: 600 }}>
                              {fmtMoney(row.amount_paid, row.form_currency)}
                            </td>
                            <td style={{ ...TD, color: balance > 0 ? '#DC2626' : '#16A34A', fontWeight: 600 }}>
                              {fmtMoney(balance, row.form_currency)}
                            </td>
                            <td style={TD}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                                <span style={{
                                  fontSize: '11px', fontWeight: 700, padding: '2px 9px',
                                  borderRadius: '20px', color: ps.color, background: ps.bg,
                                  whiteSpace: 'nowrap',
                                }}>
                                  {ps.label}
                                </span>
                                {isOverdue && (
                                  <span style={{
                                    fontSize: '10px', fontWeight: 700, padding: '2px 8px',
                                    borderRadius: '20px', color: '#DC2626', background: '#FEE2E2',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    Overdue
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={TD}>
                              {row.offline_payment_method ? (
                                <span style={{
                                  fontSize: '11px', fontWeight: 600, padding: '2px 9px',
                                  borderRadius: '20px', color: '#0891B2', background: '#ECFEFF',
                                }}>
                                  {row.offline_payment_method.replace('_', ' ')}
                                </span>
                              ) : row.payment_status === 'paid' ? (
                                <span style={{
                                  fontSize: '11px', fontWeight: 600, padding: '2px 9px',
                                  borderRadius: '20px', color: '#7C3AED', background: '#EDE9FE',
                                }}>
                                  Stripe
                                </span>
                              ) : (
                                <span style={{ color: '#CBD5E1', fontSize: '12px' }}>—</span>
                              )}
                            </td>
                            <td style={{ ...TD, textAlign: 'right' }}>
                              {row.payment_status !== 'paid' && (
                                <button
                                  onClick={() => handleMarkPaid(row)}
                                  disabled={markingId === row.id}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    padding: '5px 12px', borderRadius: '7px', border: 'none',
                                    background: '#22C55E', color: '#fff', fontSize: '12px',
                                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                    opacity: markingId === row.id ? 0.7 : 1,
                                  }}
                                >
                                  <CheckCircle size={11} />
                                  Mark paid
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── INSTALLMENT PLANS ────────────────────────────────────────── */}
          {subTab === 'installments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {installGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8', fontSize: '13px' }}>
                  No installment plan submissions found.
                </div>
              ) : (
                installGroups.map(group => (
                  <div
                    key={group.sub.id}
                    style={{
                      border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden',
                    }}
                  >
                    <div style={{
                      background: '#F8FAFC', padding: '14px 18px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                          {playerName(group.sub.data)}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                          {group.sub.form_title} · Total: {fmtMoney(group.sub.amount_due, group.sub.form_currency)}
                        </div>
                      </div>
                      {group.installments.length === 0 && (
                        <button
                          onClick={() => handleGeneratePlan(group)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '7px 14px', borderRadius: '8px', border: 'none',
                            background: primary, color: '#fff', fontSize: '12px',
                            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          <RefreshCw size={12} />
                          Generate plan
                        </button>
                      )}
                    </div>
                    {group.installments.length > 0 && (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            {['#', 'Amount', 'Due date', 'Status', ''].map(h => (
                              <th key={h} style={{ ...TH, background: '#fff', borderTop: '1px solid #E2E8F0' }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.installments.map((inst, idx) => (
                            <tr
                              key={inst.id}
                              style={{
                                background: idx % 2 === 0 ? '#fff' : '#F8FAFC',
                                borderTop: '1px solid #E2E8F0',
                              }}
                            >
                              <td style={{ ...TD, color: '#94A3B8', width: '40px' }}>
                                {idx + 1}
                              </td>
                              <td style={{ ...TD, fontWeight: 600 }}>
                                {fmtMoney(inst.amount, group.sub.form_currency)}
                              </td>
                              <td style={TD}>{fmtDate(inst.due_date)}</td>
                              <td style={TD}>
                                <span style={{
                                  fontSize: '11px', fontWeight: 700, padding: '2px 9px',
                                  borderRadius: '20px',
                                  color:      inst.paid_at ? '#16A34A' : '#D97706',
                                  background: inst.paid_at ? '#DCFCE7' : '#FEF3C7',
                                }}>
                                  {inst.paid_at ? `Paid ${fmtDate(inst.paid_at)}` : 'Unpaid'}
                                </span>
                              </td>
                              <td style={{ ...TD, textAlign: 'right' }}>
                                {!inst.paid_at && (
                                  <button
                                    onClick={() => handleMarkInstallmentPaid(inst)}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                                      padding: '5px 11px', borderRadius: '7px', border: 'none',
                                      background: '#22C55E', color: '#fff', fontSize: '11px',
                                      fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                    }}
                                  >
                                    <CheckCircle size={11} />
                                    Mark paid
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── PROMO CODES ──────────────────────────────────────────────── */}
          {subTab === 'promo' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                <button
                  onClick={() => setShowPromoForm(v => !v)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '8px', border: 'none',
                    background: primary, color: '#fff', fontSize: '13px',
                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <Plus size={14} />
                  Create code
                </button>
              </div>

              {/* Create form */}
              {showPromoForm && (
                <div style={{
                  background: '#F8FAFC', border: `1.5px solid ${primary}`,
                  borderRadius: '12px', padding: '20px', marginBottom: '20px',
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '14px' }}>
                    New promo code
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelSt}>Code</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          value={newPromo.code}
                          onChange={e => setNewPromo(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                          placeholder="SUMMER25"
                          style={{ ...inputSt, flex: 1 }}
                        />
                        <button
                          onClick={() => setNewPromo(p => ({ ...p, code: generateCode() }))}
                          style={{
                            padding: '10px 12px', borderRadius: '10px',
                            border: '1.5px solid #E2E8F0', background: '#fff',
                            color: '#64748B', fontSize: '12px', cursor: 'pointer',
                            fontFamily: 'inherit', whiteSpace: 'nowrap',
                          }}
                        >
                          Auto
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={labelSt}>Discount type</label>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                        {(['percent', 'flat'] as DiscountType[]).map(dt => (
                          <label key={dt} style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            fontSize: '13px', color: '#334155', cursor: 'pointer',
                          }}>
                            <input
                              type="radio"
                              name="discount_type"
                              value={dt}
                              checked={newPromo.discount_type === dt}
                              onChange={() => setNewPromo(p => ({ ...p, discount_type: dt }))}
                            />
                            {dt === 'percent' ? '% off' : 'Flat £'}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={labelSt}>
                        Value ({newPromo.discount_type === 'percent' ? '%' : primaryCurrency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step={newPromo.discount_type === 'percent' ? '1' : '0.01'}
                        value={newPromo.discount_value}
                        onChange={e => setNewPromo(p => ({ ...p, discount_value: e.target.value }))}
                        placeholder={newPromo.discount_type === 'percent' ? '10' : '25.00'}
                        style={inputSt}
                      />
                    </div>
                    <div>
                      <label style={labelSt}>Max uses (blank = unlimited)</label>
                      <input
                        type="number"
                        min="1"
                        value={newPromo.max_uses}
                        onChange={e => setNewPromo(p => ({ ...p, max_uses: e.target.value }))}
                        placeholder="Unlimited"
                        style={inputSt}
                      />
                    </div>
                    <div>
                      <label style={labelSt}>Expiry date (optional)</label>
                      <input
                        type="date"
                        value={newPromo.expires_at}
                        onChange={e => setNewPromo(p => ({ ...p, expires_at: e.target.value }))}
                        style={inputSt}
                      />
                    </div>
                    <div>
                      <label style={labelSt}>Form scope</label>
                      <select
                        value={newPromo.form_id}
                        onChange={e => setNewPromo(p => ({ ...p, form_id: e.target.value }))}
                        style={{ ...inputSt, cursor: 'pointer' }}
                      >
                        <option value="">All forms</option>
                        {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                    <button
                      onClick={handlePromoSave}
                      disabled={promoSaving || !newPromo.code.trim() || !newPromo.discount_value}
                      style={{
                        padding: '9px 18px', borderRadius: '8px', border: 'none',
                        background: primary, color: '#fff', fontSize: '13px', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                        opacity: promoSaving ? 0.7 : 1,
                      }}
                    >
                      {promoSaving ? 'Saving…' : 'Save code'}
                    </button>
                    <button
                      onClick={() => setShowPromoForm(false)}
                      style={{
                        padding: '9px 18px', borderRadius: '8px',
                        border: '1.5px solid #E2E8F0', background: '#fff',
                        color: '#64748B', fontSize: '13px', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {promos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8', fontSize: '13px' }}>
                  No promo codes yet. Create one above.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
                    <thead>
                      <tr>
                        {['Code', 'Discount', 'Scope', 'Uses', 'Expires', 'Active', ''].map(h => (
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {promos.map((promo, idx) => {
                        const scopeForm = forms.find(f => f.id === promo.form_id);
                        return (
                          <tr
                            key={promo.id}
                            style={{
                              background: idx % 2 === 0 ? '#fff' : '#F8FAFC',
                              borderTop: '1px solid #E2E8F0',
                            }}
                          >
                            <td style={{ ...TD, fontWeight: 700, letterSpacing: '0.05em' }}>
                              {promo.code}
                            </td>
                            <td style={TD}>
                              {promo.discount_type === 'percent'
                                ? `${promo.discount_value}%`
                                : fmtMoney(promo.discount_value, primaryCurrency)}
                              {' '}off
                            </td>
                            <td style={{ ...TD, color: '#64748B' }}>
                              {scopeForm ? scopeForm.title : 'All forms'}
                            </td>
                            <td style={TD}>
                              {promo.uses_count}
                              {promo.max_uses !== null ? ` / ${promo.max_uses}` : ''}
                            </td>
                            <td style={{ ...TD, color: '#64748B' }}>
                              {fmtDate(promo.expires_at)}
                            </td>
                            <td style={TD}>
                              <button
                                onClick={() => handlePromoToggle(promo)}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  padding: '2px', display: 'flex', alignItems: 'center',
                                }}
                                aria-label={promo.active ? 'Deactivate' : 'Activate'}
                              >
                                {promo.active
                                  ? <TrendingUp size={18} color="#16A34A" />
                                  : <TrendingUp size={18} color="#CBD5E1" />}
                              </button>
                            </td>
                            <td style={{ ...TD, textAlign: 'right' }}>
                              <button
                                onClick={() => handlePromoDelete(promo.id)}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: '#DC2626', padding: '4px',
                                }}
                                aria-label="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── STRIPE ───────────────────────────────────────────────────── */}
          {subTab === 'stripe' && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '40px 24px', textAlign: 'center', gap: '16px',
            }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '16px',
                background: '#635BFF', display: 'flex', alignItems: 'center',
                justifyContent: 'center',
              }}>
                <CreditCard size={28} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                  Connect Stripe
                </div>
                <div style={{
                  fontSize: '14px', color: '#64748B', maxWidth: '440px',
                  lineHeight: '1.6',
                }}>
                  Once connected, parents can pay online directly on your registration form.
                  Payments appear here automatically — no manual reconciliation needed.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '20px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {([
                  { label: 'Processed online', value: '£0.00', color: '#CBD5E1' },
                  { label: 'Online transactions', value: '0', color: '#CBD5E1' },
                  { label: 'Refunds issued', value: '£0.00', color: '#CBD5E1' },
                ] as Array<{ label: string; value: string; color: string }>).map(stat => (
                  <div key={stat.label} style={{
                    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px',
                    padding: '16px 24px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                      {stat.label}
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: stat.color }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => showToast('Stripe integration coming soon — contact support to set up early access.')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 28px', borderRadius: '10px', border: 'none',
                  background: '#635BFF', color: '#fff', fontSize: '14px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <Zap size={15} />
                Connect Stripe account
              </button>
              <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
                Stripe integration coming soon — contact support to set up early access.
              </p>
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
}
