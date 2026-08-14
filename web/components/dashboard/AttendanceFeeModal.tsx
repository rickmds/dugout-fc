'use client';

import { useState } from 'react';
import { DollarSign, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { syncPaymentInstructions } from '@/lib/feePayee';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import PayeeTypeField from '@/components/dashboard/PayeeTypeField';

// ── Types ─────────────────────────────────────────────────────────────────────

type AttendeePlayer = { id: string; full_name: string };

interface Props {
  teamId: string;
  eventId: string;
  eventTitle: string;
  primary: string;
  players: AttendeePlayer[];
  attStatusByPlayer: Record<string, 'present' | 'absent' | 'late' | undefined>;
}

// ── Component ─────────────────────────────────────────────────────────────────

// Bulk-charge a fee to everyone who attended an event (e.g. a tournament),
// instead of assigning it to each player one at a time. Pre-checks players
// marked present/late from the event's already-loaded attendance state —
// the coach can still add/remove anyone before confirming.
export default function AttendanceFeeModal({ teamId, eventId, eventTitle, primary, players, attStatusByPlayer }: Props) {
  const { profile } = useDashboard();

  const [showModal, setShowModal] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payeeType, setPayeeType] = useState<'club' | 'coach'>('club');
  const [payeeInstructions, setPayeeInstructions] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; total: number } | null>(null);

  const attendedCount = players.filter(p => {
    const s = attStatusByPlayer[p.id];
    return s === 'present' || s === 'late';
  }).length;

  function openModal() {
    setDescription(''); setAmount(''); setDueDate(''); setResult(null); setError(null);
    setPayeeType('club'); setPayeeInstructions('');
    setSelected(new Set(players.filter(p => {
      const s = attStatusByPlayer[p.id];
      return s === 'present' || s === 'late';
    }).map(p => p.id)));
    setShowModal(true);
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }

  async function submit() {
    if (!profile || selected.size === 0 || !description.trim() || !amount) return;
    setSending(true);
    setError(null);

    const { data: rpcData, error: rpcError } = await supabase.rpc('assign_fee_to_attendees', {
      p_team_id: teamId,
      p_player_ids: Array.from(selected),
      p_description: description.trim(),
      p_amount_due: parseFloat(amount),
      p_due_date: dueDate || null,
      p_payee_type: payeeType,
      p_payment_instructions: payeeType === 'coach' ? (payeeInstructions.trim() || null) : null,
      p_event_id: eventId,
    });
    const data = rpcData as { id: string; amount_due: number }[] | null;

    if (rpcError || !data) {
      setSending(false);
      setError(rpcError?.message ?? 'Could not assign fees.');
      return;
    }

    if (payeeType === 'coach' && payeeInstructions.trim() && profile) {
      await syncPaymentInstructions(profile.id, payeeInstructions);
    }

    const headers = await authHeaders();
    await Promise.allSettled(data.map(row =>
      fetch('/api/send-fee-notification', { method: 'POST', headers, body: JSON.stringify({ player_fee_id: row.id }) })
    ));

    setResult({ count: data.length, total: data.reduce((s, r) => s + Number(r.amount_due), 0) });
    setSending(false);
  }

  const canSubmit = selected.size > 0 && !!description.trim() && !!amount && parseFloat(amount) > 0;

  return (
    <>
      <button
        onClick={openModal}
        disabled={players.length === 0}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          fontSize: '11px', fontWeight: '700',
          color: players.length === 0 ? '#94A3B8' : primary,
          background: players.length === 0 ? '#F8FAFC' : `${primary}12`,
          border: `1px solid ${players.length === 0 ? '#E2E8F0' : `${primary}30`}`,
          borderRadius: '7px', padding: '5px 12px',
          cursor: players.length === 0 ? 'default' : 'pointer', fontFamily: 'inherit',
        }}
      >
        <DollarSign size={12} /> Charge attendees{attendedCount > 0 ? ` (${attendedCount})` : ''}
      </button>

      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '24px' }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Charge attendees</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{eventTitle}</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <X size={16} color="#94A3B8" />
              </button>
            </div>

            {result ? (
              <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Check size={24} color="#16A34A" />
                </div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>
                  Charged ${result.total.toFixed(2)} across {result.count} player{result.count !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>Parents have been notified.</div>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ marginTop: '18px', padding: '10px 24px', borderRadius: '8px', border: 'none', background: primary, color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
                  {error && (
                    <div style={{ fontSize: '12px', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 12px' }}>
                      {error}
                    </div>
                  )}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</label>
                    <input
                      value={description} onChange={e => setDescription(e.target.value)}
                      placeholder="e.g. Summer Kickoff Tournament"
                      style={{ width: '100%', marginTop: '5px', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '9px 11px', fontSize: '14px', color: '#0F172A', fontFamily: 'inherit', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount ($)</label>
                      <input
                        type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                        style={{ width: '100%', marginTop: '5px', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '9px 11px', fontSize: '14px', color: '#0F172A', fontFamily: 'inherit', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due date (optional)</label>
                      <input
                        type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                        style={{ width: '100%', marginTop: '5px', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '9px 11px', fontSize: '14px', color: '#0F172A', fontFamily: 'inherit', outline: 'none' }}
                      />
                    </div>
                  </div>

                  <PayeeTypeField
                    value={payeeType}
                    onChange={v => { setPayeeType(v); if (v === 'coach' && !payeeInstructions) setPayeeInstructions(profile?.payment_instructions ?? ''); }}
                    instructions={payeeInstructions}
                    onInstructionsChange={setPayeeInstructions}
                    primary={primary}
                  />

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                      Players ({selected.size} selected)
                    </label>
                    <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                      {players.map(p => {
                        const status = attStatusByPlayer[p.id];
                        const checked = selected.has(p.id);
                        return (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontSize: '13px' }}>
                            <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} />
                            <span style={{ flex: 1, color: '#0F172A', fontWeight: 500 }}>{p.full_name}</span>
                            {status && (
                              <span style={{
                                fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
                                color: status === 'present' ? '#16A34A' : status === 'late' ? '#D97706' : '#DC2626',
                              }}>
                                {status}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ padding: '14px 20px', borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
                  <button
                    onClick={submit}
                    disabled={sending || !canSubmit}
                    style={{
                      width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                      background: (sending || !canSubmit) ? '#E2E8F0' : primary,
                      color: (sending || !canSubmit) ? '#94A3B8' : '#fff',
                      fontSize: '14px', fontWeight: '800', cursor: (sending || !canSubmit) ? 'default' : 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {sending ? 'Charging…' : `Charge ${selected.size} player${selected.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
