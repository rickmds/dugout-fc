'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Receipt, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { formatCurrency } from '@/lib/formatCurrency';

type Fee = {
  id: string; description: string;
  amount_due: number; amount_paid: number; discount: number;
  due_date: string | null; status: string;
  installment_number: number | null; installment_total: number | null;
  events: { title: string } | null;
};
type Payment = { id: string; player_fee_id: string; amount: number; paid_at: string; method: string | null };

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  outstanding: { label: 'Outstanding', color: '#F59E0B', bg: '#FFFBEB' },
  partial:     { label: 'Partial',     color: '#3B82F6', bg: '#EFF6FF' },
  paid:        { label: 'Paid',        color: '#22C55E', bg: '#F0FDF4' },
  waived:      { label: 'Waived',      color: '#8B5CF6', bg: '#F5F3FF' },
  overdue:     { label: 'Overdue',     color: '#EF4444', bg: '#FEF2F2' },
};

export default function FinancialsPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const currency = club?.currency ?? 'USD';

  const [fees, setFees] = useState<Fee[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('player_fees')
      .select('id,description,amount_due,amount_paid,discount,due_date,status,installment_number,installment_total,events(title)')
      .eq('player_id', playerId)
      .order('due_date', { ascending: true, nullsFirst: false });
    const rows = ((data ?? []) as unknown as Fee[]).map((f) => ({
      ...f,
      status: f.status !== 'paid' && f.status !== 'waived' && f.due_date && f.due_date < today ? 'overdue' : f.status,
    }));
    setFees(rows);

    if (rows.length) {
      const { data: pmts } = await supabase.from('fee_payments')
        .select('id,player_fee_id,amount,paid_at,method')
        .in('player_fee_id', rows.map((f) => f.id))
        .order('paid_at', { ascending: false });
      setPayments((pmts ?? []) as Payment[]);
    } else {
      setPayments([]);
    }
    setLoading(false);
  }, [playerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from real network calls, not derivable at render time
  useEffect(() => { load(); }, [load]);

  const totalOwed = fees.reduce((s, f) => s + Math.max(f.amount_due - f.discount - f.amount_paid, 0), 0);

  return (
    <div style={{ maxWidth: '620px' }}>
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Fees</div>
          <Link href="/dashboard/fees" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '600', color: primary, textDecoration: 'none' }}>
            Manage fees <ExternalLink size={11} />
          </Link>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <div style={{ width: '18px', height: '18px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : fees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Receipt size={22} color="#CBD5E1" style={{ display: 'block', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No fees on file</p>
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: totalOwed > 0 ? '#FFFBEB' : '#F0FDF4', marginBottom: '14px' }}>
              <div style={{ fontSize: '18px', fontWeight: '900', color: totalOwed > 0 ? '#D97706' : '#16A34A' }}>
                {totalOwed > 0 ? formatCurrency(totalOwed, currency) : 'All paid up'}
              </div>
              {totalOwed > 0 && <div style={{ fontSize: '11.5px', color: '#92400E', marginTop: '2px' }}>Outstanding</div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {fees.map((fee) => {
                const owed = Math.max(fee.amount_due - fee.discount - fee.amount_paid, 0);
                const cfg = STATUS_CONFIG[fee.status] ?? STATUS_CONFIG.outstanding;
                const feePayments = payments.filter((p) => p.player_fee_id === fee.id);
                return (
                  <div key={fee.id} style={{ background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}>{fee.description}</div>
                        {fee.installment_number && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Installment {fee.installment_number}/{fee.installment_total}</div>}
                        {fee.due_date && <div style={{ fontSize: '11px', color: fee.status === 'overdue' ? '#EF4444' : '#94A3B8', marginTop: '2px' }}>Due {fee.due_date}</div>}
                        {fee.events?.title && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{fee.events.title}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: cfg.bg, color: cfg.color, marginBottom: '6px' }}>{cfg.label}</span>
                        <div style={{ fontSize: '14px', fontWeight: '800', color: owed > 0 ? cfg.color : '#22C55E' }}>
                          {owed > 0 ? `${formatCurrency(owed, currency)} owed` : 'Paid'}
                        </div>
                      </div>
                    </div>
                    {feePayments.length > 0 && (
                      <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '8px', paddingTop: '8px' }}>
                        {feePayments.map((p) => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B', paddingBottom: '3px' }}>
                            <span>{formatCurrency(p.amount, currency)}{p.method ? ` via ${p.method}` : ''}</span>
                            <span>{p.paid_at.slice(0, 10)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
