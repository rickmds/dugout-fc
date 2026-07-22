'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { DollarSign, Plus, X, ChevronDown, Send, Download, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import UpgradePrompt from '@/components/dashboard/UpgradePrompt';

type FeeCategory = { id: string; name: string; amount: number; description: string | null };
type Player = { id: string; full_name: string; jersey_number: number | null; position: string | null };
type PlayerFee = {
  id: string; player_id: string; player_name: string;
  description: string; amount_due: number; amount_paid: number;
  discount: number; discount_reason: string | null;
  due_date: string | null; status: string; notes: string | null;
  category_id: string | null;
  plan_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
};
type Payment = { id: string; player_fee_id: string; amount: number; method: string; reference: string | null; notes: string | null; paid_at: string };

const STATUS_CONFIG: Record<string,{label:string;color:string;bg:string}> = {
  outstanding: { label: 'Outstanding', color: '#F59E0B', bg: '#FFFBEB' },
  partial:     { label: 'Partial',     color: '#3B82F6', bg: '#EFF6FF' },
  paid:        { label: 'Paid',        color: '#22C55E', bg: '#F0FDF4' },
  waived:      { label: 'Waived',      color: '#8B5CF6', bg: '#F5F3FF' },
  overdue:     { label: 'Overdue',     color: '#EF4444', bg: '#FEF2F2' },
};

const METHODS = ['cash','bank_transfer','card','cheque','stripe','other'];

export default function TeamFeesPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { club, profile, canUse } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [fees,       setFees]       = useState<PlayerFee[]>([]);
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [players,    setPlayers]    = useState<Player[]>([]);
  const [payments,   setPayments]   = useState<Payment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<'all'|'outstanding'|'overdue'|'paid'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modals
  const [showAssign,   setShowAssign]   = useState(false);
  const [showPayment,  setShowPayment]  = useState<PlayerFee | null>(null);
  const [showCategory, setShowCategory] = useState(false);
  const [showWaive,    setShowWaive]    = useState<PlayerFee | null>(null);

  // Assign fee form
  const [assignForm, setAssignForm] = useState({ player_id: '', category_id: '', description: '', amount_due: '', discount: '0', discount_reason: '', due_date: '', notes: '', apply_to_all: false });
  // Payment form
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', reference: '', notes: '', pay_plan_full: false });
  // Category form
  const [catForm, setCatForm] = useState({ name: '', amount: '', description: '' });
  // Waive form
  const [waiveReason, setWaiveReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!teamId || !club) return;
    setLoading(true);

    const [catRes, playerRes] = await Promise.all([
      supabase.from('fee_categories').select('id,name,amount,description').eq('club_id', club.id).order('name'),
      supabase.from('players').select('id,full_name,jersey_number,position').eq('team_id', teamId).order('full_name'),
    ]);

    setCategories((catRes.data ?? []) as FeeCategory[]);
    setPlayers((playerRes.data ?? []) as Player[]);

    // Load player fees with player names via join
    const { data: feesData } = await supabase
      .from('player_fees')
      .select('id,player_id,description,amount_due,amount_paid,discount,discount_reason,due_date,status,notes,category_id,plan_group_id,installment_number,installment_total,players(full_name)')
      .eq('team_id', teamId)
      .order('due_date', { ascending: true, nullsFirst: false });

    const mapped: PlayerFee[] = (feesData ?? []).map((f: any) => ({
      ...f,
      player_name: f.players?.full_name ?? 'Unknown',
      plan_group_id: f.plan_group_id ?? null,
      installment_number: f.installment_number ?? null,
      installment_total: f.installment_total ?? null,
    }));
    setFees(mapped);

    if (mapped.length > 0) {
      const feeIds = mapped.map(f => f.id);
      const { data: pmts } = await supabase.from('fee_payments').select('*').in('player_fee_id', feeIds).order('paid_at', { ascending: false });
      setPayments((pmts ?? []) as Payment[]);
    }

    setLoading(false);
  }, [teamId, club]);

  useEffect(() => { load(); }, [load]);

  // Auto-set overdue
  const today = new Date().toISOString().slice(0,10);
  const enriched = fees.map(f => ({
    ...f,
    status: f.status !== 'paid' && f.status !== 'waived' && f.due_date && f.due_date < today ? 'overdue' : f.status,
  }));

  const filtered = filter === 'all' ? enriched : enriched.filter(f => f.status === filter);

  // Summary stats
  const totalDue       = fees.reduce((s,f) => s + f.amount_due - f.discount, 0);
  const totalPaid      = fees.reduce((s,f) => s + f.amount_paid, 0);
  const totalOutstanding = fees.filter(f => !['paid','waived'].includes(f.status)).reduce((s,f) => s + (f.amount_due - f.discount - f.amount_paid), 0);
  const overdueCount   = enriched.filter(f => f.status === 'overdue').length;

  async function handleAssign() {
    if (!profile || !teamId) return;
    setSaving(true);
    const playerIds = assignForm.apply_to_all ? players.map(p => p.id) : [assignForm.player_id];
    const cat = categories.find(c => c.id === assignForm.category_id);
    for (const pid of playerIds) {
      const { data: inserted } = await supabase.from('player_fees').insert({
        player_id: pid, team_id: teamId,
        category_id: assignForm.category_id || null,
        description: assignForm.description || cat?.name || 'Fee',
        amount_due: parseFloat(assignForm.amount_due) || cat?.amount || 0,
        discount: parseFloat(assignForm.discount) || 0,
        discount_reason: assignForm.discount_reason || null,
        due_date: assignForm.due_date || null,
        notes: assignForm.notes || null,
        created_by: profile.id,
      }).select('id').single();
      if (inserted?.id) {
        fetch('/api/send-fee-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_fee_id: inserted.id }),
        }).catch(() => {/* fire and forget */});
      }
    }
    setShowAssign(false);
    setAssignForm({ player_id: '', category_id: '', description: '', amount_due: '', discount: '0', discount_reason: '', due_date: '', notes: '', apply_to_all: false });
    setSaving(false);
    load();
  }

  async function handlePayment() {
    if (!showPayment || !profile) return;
    setSaving(true);

    if (payForm.pay_plan_full && showPayment.plan_group_id) {
      // Pay all outstanding instalments in this plan group
      const planFees = fees.filter(f =>
        f.plan_group_id === showPayment.plan_group_id && !['paid','waived'].includes(f.status)
      );
      let totalPaid = 0;
      for (const pf of planFees) {
        const remaining = pf.amount_due - pf.discount - pf.amount_paid;
        if (remaining <= 0) continue;
        await supabase.from('fee_payments').insert({
          player_fee_id: pf.id, amount: remaining,
          method: payForm.method, reference: payForm.reference || null,
          notes: payForm.notes || null, recorded_by: profile.id,
        });
        await supabase.from('player_fees').update({ amount_paid: pf.amount_paid + remaining, status: 'paid' }).eq('id', pf.id);
        totalPaid += remaining;
      }
      // Send one confirmation for the full plan payment
      fetch('/api/send-payment-confirmation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_fee_id: showPayment.id, amount_paid: totalPaid }),
      }).catch(() => {});
    } else {
      const amt = parseFloat(payForm.amount);
      await supabase.from('fee_payments').insert({
        player_fee_id: showPayment.id, amount: amt,
        method: payForm.method, reference: payForm.reference || null,
        notes: payForm.notes || null, recorded_by: profile.id,
      });
      const newPaid = showPayment.amount_paid + amt;
      const newStatus = newPaid >= (showPayment.amount_due - showPayment.discount) ? 'paid' : 'partial';
      await supabase.from('player_fees').update({ amount_paid: newPaid, status: newStatus }).eq('id', showPayment.id);
      fetch('/api/send-payment-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_fee_id: showPayment.id, amount_paid: amt }),
      }).catch(() => {});
    }

    setShowPayment(null);
    setPayForm({ amount: '', method: 'cash', reference: '', notes: '', pay_plan_full: false });
    setSaving(false);
    load();
  }

  async function handleWaive() {
    if (!showWaive) return;
    setSaving(true);
    await supabase.from('player_fees').update({ status: 'waived', discount_reason: waiveReason || 'Waived by admin' }).eq('id', showWaive.id);
    setShowWaive(null);
    setWaiveReason('');
    setSaving(false);
    load();
  }

  async function handleCreateCategory() {
    if (!club || !profile) return;
    setSaving(true);
    await supabase.from('fee_categories').insert({ club_id: club.id, name: catForm.name, amount: parseFloat(catForm.amount) || 0, description: catForm.description || null, created_by: profile.id });
    setShowCategory(false);
    setCatForm({ name: '', amount: '', description: '' });
    setSaving(false);
    load();
  }

  async function sendReminder(fee: PlayerFee) {
    const res = await fetch('/api/send-fee-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_fee_id: fee.id }),
    });
    const json = await res.json();
    if (json.skipped) {
      alert('No guardian email on file for this player.');
    } else if (!res.ok) {
      alert('Failed to send reminder. Please try again.');
    } else {
      alert(`Reminder sent${json.pushSent > 0 ? ' (email + push notification)' : ' (email only — parent app not set up yet)'}. `);
    }
  }

  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: '12px', fontWeight: '600' as const, color: '#374151', display: 'block' as const, marginBottom: '5px' };

  if (!canUse('fees')) {
    return (
      <div style={{ padding: '48px 0', maxWidth: '560px' }}>
        <UpgradePrompt
          feature="Fee Collection"
          description="Assign fees to players, track payments, record cash and bank transfers, and send automated payment reminders to parents."
          requiredPlan="Team Pro"
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '960px' }}>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total Invoiced',   value: `$${totalDue.toFixed(2)}`,        color: '#64748B' },
          { label: 'Total Collected',  value: `$${totalPaid.toFixed(2)}`,        color: '#22C55E' },
          { label: 'Outstanding',      value: `$${totalOutstanding.toFixed(2)}`, color: '#F59E0B' },
          { label: 'Overdue',          value: overdueCount,                       color: '#EF4444' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ height: '3px', background: color }} />
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: '24px', fontWeight: '800', color, letterSpacing: '-0.5px' }}>{value}</div>
              <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '4px' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Collection bar */}
      {totalDue > 0 && (
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '14px 18px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: '#64748B' }}>
            <span>Collection progress</span>
            <span style={{ fontWeight: '700', color: primary }}>{Math.round((totalPaid / totalDue) * 100)}% collected</span>
          </div>
          <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min((totalPaid / totalDue) * 100, 100)}%`, height: '100%', background: primary, borderRadius: '4px', transition: 'width 0.4s' }} />
          </div>
        </div>
      )}

      {/* Actions bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '3px' }}>
          {(['all','outstanding','overdue','paid'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: '600',
              background: filter === f ? '#fff' : 'transparent',
              color: filter === f ? '#0F172A' : '#64748B',
              boxShadow: filter === f ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'overdue' && overdueCount > 0 && <span style={{ marginLeft: '5px', background: '#EF4444', color: '#fff', borderRadius: '10px', padding: '0 5px', fontSize: '10px' }}>{overdueCount}</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowCategory(true)} style={{ padding: '7px 14px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Fee Type
          </button>
          <button onClick={() => setShowAssign(true)} style={{ padding: '7px 16px', borderRadius: '6px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Assign Fee
          </button>
        </div>
      </div>

      {/* Fees table */}
      {loading ? (
        <>
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1,2,3].map(i => <div key={i} style={{ height: '64px', borderRadius: '8px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />)}
          </div>
        </>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '56px 40px', textAlign: 'center' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '8px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <DollarSign size={24} color="#94A3B8" />
          </div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>
            {filter === 'all' ? 'No fees assigned yet' : `No ${filter} fees`}
          </div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: filter === 'all' ? '20px' : '0' }}>
            {filter === 'all' ? 'Assign your first fee to start tracking player payments.' : `No fees are currently ${filter}.`}
          </div>
          {filter === 'all' && (
            <button onClick={() => setShowAssign(true)} style={{ padding: '9px 22px', borderRadius: '6px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              Assign Fee
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          {filtered.map((fee, i) => {
            const owed    = fee.amount_due - fee.discount - fee.amount_paid;
            const cfg     = STATUS_CONFIG[fee.status] ?? STATUS_CONFIG.outstanding;
            const feePayments = payments.filter(p => p.player_fee_id === fee.id);
            const isExpanded  = expandedId === fee.id;
            return (
              <div key={fee.id}>
                <div
                  style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => !isExpanded && ((e.currentTarget as HTMLElement).style.background = '#F8FAFC')}
                  onMouseLeave={e => !isExpanded && ((e.currentTarget as HTMLElement).style.background = '#fff')}
                  onClick={() => setExpandedId(isExpanded ? null : fee.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A' }}>{fee.player_name}</span>
                        <span style={{ fontSize: '12px', color: '#94A3B8' }}>·</span>
                        <span style={{ fontSize: '13px', color: '#64748B' }}>{fee.description}</span>
                        {fee.installment_number && fee.installment_total && (
                          <span style={{ fontSize: '10px', color: '#94A3B8', background: '#F1F5F9', borderRadius: '4px', padding: '1px 6px', fontWeight: '600' }}>
                            Instalment {fee.installment_number}/{fee.installment_total}
                          </span>
                        )}
                        {fee.due_date && <span style={{ fontSize: '11px', color: fee.status === 'overdue' ? '#EF4444' : '#94A3B8' }}>Due {fee.due_date}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                      <span style={{ fontSize: '13px', color: '#94A3B8' }}>${fee.amount_paid.toFixed(2)} / ${(fee.amount_due - fee.discount).toFixed(2)}</span>
                      <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                      {!['paid','waived'].includes(fee.status) && (
                        <span style={{ fontSize: '15px', fontWeight: '800', color: cfg.color }}>${Math.max(owed, 0).toFixed(2)}</span>
                      )}
                      <ChevronDown size={14} color="#94A3B8" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ background: '#F8FAFC', borderBottom: i < filtered.length - 1 ? '1px solid #E2E8F0' : 'none', padding: '16px 18px' }}>
                    {/* Payment history */}
                    {feePayments.length > 0 && (
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Payment History</div>
                        {feePayments.map(p => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px', padding: '6px 10px', background: '#fff', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                            <span style={{ color: '#22C55E', fontWeight: '700' }}>+${p.amount.toFixed(2)}</span>
                            <span style={{ color: '#64748B', textTransform: 'capitalize' }}>{p.method.replace('_',' ')}</span>
                            {p.reference && <span style={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: '12px' }}>#{p.reference}</span>}
                            <span style={{ color: '#94A3B8' }}>{new Date(p.paid_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {fee.discount > 0 && (
                      <div style={{ fontSize: '12px', color: '#8B5CF6', marginBottom: '10px' }}>
                        Discount applied: -${fee.discount.toFixed(2)}{fee.discount_reason ? ` (${fee.discount_reason})` : ''}
                      </div>
                    )}
                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {!['paid','waived'].includes(fee.status) && (
                        <>
                          <button onClick={() => { setShowPayment(fee); setPayForm({ amount: Math.max(owed,0).toFixed(2), method: 'cash', reference: '', notes: '', pay_plan_full: false }); }}
                            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#22C55E', color: '#fff', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <CheckCircle size={13} /> Record Payment
                          </button>
                          <button onClick={() => sendReminder(fee)}
                            style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', color: '#374151', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Send size={13} /> Send Reminder
                          </button>
                          <button onClick={() => setShowWaive(fee)}
                            style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', color: '#8B5CF6', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}>
                            Waive
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ── */}

      {/* Assign Fee */}
      {showAssign && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Assign Fee</div>
              <button onClick={() => setShowAssign(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={18} color="#94A3B8" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label style={labelStyle}>
                Fee type (optional)
                <select value={assignForm.category_id} onChange={e => {
                  const cat = categories.find(c => c.id === e.target.value);
                  setAssignForm(f => ({ ...f, category_id: e.target.value, description: cat?.name ?? f.description, amount_due: cat ? String(cat.amount) : f.amount_due }));
                }} style={inputStyle}>
                  <option value="">Custom fee</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name} — ${c.amount}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Description *
                <input value={assignForm.description} onChange={e => setAssignForm(f => ({...f, description: e.target.value}))} placeholder="e.g. Registration Fee 2026" style={inputStyle} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={labelStyle}>
                  Amount due ($) *
                  <input type="number" value={assignForm.amount_due} onChange={e => setAssignForm(f => ({...f, amount_due: e.target.value}))} placeholder="0.00" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Discount ($)
                  <input type="number" value={assignForm.discount} onChange={e => setAssignForm(f => ({...f, discount: e.target.value}))} placeholder="0.00" style={inputStyle} />
                </label>
              </div>
              {parseFloat(assignForm.discount) > 0 && (
                <label style={labelStyle}>
                  Discount reason
                  <input value={assignForm.discount_reason} onChange={e => setAssignForm(f => ({...f, discount_reason: e.target.value}))} placeholder="e.g. Sibling discount" style={inputStyle} />
                </label>
              )}
              <label style={labelStyle}>
                Due date
                <input type="date" value={assignForm.due_date} onChange={e => setAssignForm(f => ({...f, due_date: e.target.value}))} style={inputStyle} />
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" id="applyAll" checked={assignForm.apply_to_all} onChange={e => setAssignForm(f => ({...f, apply_to_all: e.target.checked}))} style={{ width: '16px', height: '16px' }} />
                <label htmlFor="applyAll" style={{ fontSize: '13px', color: '#374151', cursor: 'pointer' }}>Apply to all {players.length} players on this team</label>
              </div>
              {!assignForm.apply_to_all && (
                <label style={labelStyle}>
                  Player *
                  <select value={assignForm.player_id} onChange={e => setAssignForm(f => ({...f, player_id: e.target.value}))} style={inputStyle}>
                    <option value="">Select player…</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.jersey_number ? ` #${p.jersey_number}` : ''}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowAssign(false)} style={{ padding: '8px 18px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAssign} disabled={saving || (!assignForm.apply_to_all && !assignForm.player_id) || !assignForm.amount_due}
                style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: saving ? '#94A3B8' : primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Assign Fee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment */}
      {showPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Record Payment</div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>{showPayment.player_name} · {showPayment.description}</div>
              </div>
              <button onClick={() => setShowPayment(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#94A3B8" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Pay plan in full option */}
              {showPayment?.plan_group_id && (() => {
                const planRemaining = fees
                  .filter(f => f.plan_group_id === showPayment.plan_group_id && !['paid','waived'].includes(f.status))
                  .reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);
                return planRemaining > 0 ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '10px', border: `1.5px solid ${payForm.pay_plan_full ? '#22C55E' : '#E2E8F0'}`, background: payForm.pay_plan_full ? '#F0FDF4' : '#F8FAFC', cursor: 'pointer' }}>
                    <input type="checkbox" checked={payForm.pay_plan_full}
                      onChange={e => setPayForm(f => ({...f, pay_plan_full: e.target.checked, amount: e.target.checked ? planRemaining.toFixed(2) : f.amount}))}
                      style={{ width: '16px', height: '16px', accentColor: '#22C55E' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>Pay plan in full</div>
                      <div style={{ fontSize: '11.5px', color: '#64748B' }}>Clears all {fees.filter(f => f.plan_group_id === showPayment.plan_group_id && !['paid','waived'].includes(f.status)).length} outstanding instalments — ${planRemaining.toFixed(2)} total</div>
                    </div>
                  </label>
                ) : null;
              })()}
              <label style={labelStyle}>
                Amount paid ($) *
                <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({...f, amount: e.target.value, pay_plan_full: false}))} disabled={payForm.pay_plan_full} style={{ ...inputStyle, opacity: payForm.pay_plan_full ? 0.5 : 1 }} />
              </label>
              <label style={labelStyle}>
                Payment method
                <select value={payForm.method} onChange={e => setPayForm(f => ({...f, method: e.target.value}))} style={inputStyle}>
                  {METHODS.map(m => <option key={m} value={m}>{m.replace('_',' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Reference / transaction ID
                <input value={payForm.reference} onChange={e => setPayForm(f => ({...f, reference: e.target.value}))} placeholder="Optional" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Notes
                <input value={payForm.notes} onChange={e => setPayForm(f => ({...f, notes: e.target.value}))} placeholder="Optional" style={inputStyle} />
              </label>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowPayment(null)} style={{ padding: '8px 18px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handlePayment} disabled={saving || !payForm.amount}
                style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: saving ? '#94A3B8' : '#22C55E', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waive */}
      {showWaive && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: '24px' }}>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', marginBottom: '8px' }}>Waive Fee</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>Waive ${(showWaive.amount_due - showWaive.discount).toFixed(2)} for {showWaive.player_name}?</div>
            <label style={labelStyle}>
              Reason
              <input value={waiveReason} onChange={e => setWaiveReason(e.target.value)} placeholder="e.g. Scholarship, hardship exemption" style={inputStyle} />
            </label>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowWaive(null)} style={{ padding: '8px 18px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleWaive} disabled={saving} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#8B5CF6', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer' }}>Waive Fee</button>
            </div>
          </div>
        </div>
      )}

      {/* Fee Category */}
      {showCategory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>New Fee Type</div>
              <button onClick={() => setShowCategory(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#94A3B8" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label style={labelStyle}>Name * <input value={catForm.name} onChange={e => setCatForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Registration Fee" style={inputStyle} /></label>
              <label style={labelStyle}>Default amount ($) * <input type="number" value={catForm.amount} onChange={e => setCatForm(f => ({...f, amount: e.target.value}))} placeholder="0.00" style={inputStyle} /></label>
              <label style={labelStyle}>Description <input value={catForm.description} onChange={e => setCatForm(f => ({...f, description: e.target.value}))} placeholder="Optional" style={inputStyle} /></label>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowCategory(false)} style={{ padding: '8px 18px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreateCategory} disabled={saving || !catForm.name || !catForm.amount} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer' }}>Save Type</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
