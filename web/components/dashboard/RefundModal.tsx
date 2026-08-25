'use client';

import { useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/formatCurrency';
import { symbolForCurrency } from '@/lib/countries';

type RefundMode = 'full' | 'percent' | 'amount';

export type RefundablePayment = {
  id: string;
  amount: number;
  method: string | null;
  refunded_amount?: number | null;
  payment_rail?: 'card' | 'ach' | null;
  fee_charged?: number | null;
  surcharge_passed_to_payer?: boolean | null;
  refunded_surcharge?: number | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '9px 12px',
  fontSize: '13.5px', outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box',
};

export default function RefundModal({ payment, feeDescription, currency, onClose, onDone }: {
  payment: RefundablePayment;
  feeDescription: string;
  currency?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode]           = useState<RefundMode>('full');
  const [value, setValue]         = useState('');
  const [reason, setReason]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fmt = (n: number) => formatCurrency(n, currency);
  const refundable = Math.max(0, payment.amount - (payment.refunded_amount ?? 0));
  const surchargePassed  = !!payment.surcharge_passed_to_payer && !!payment.fee_charged;
  const remainingSurcharge = surchargePassed ? Math.max(0, (payment.fee_charged ?? 0) - (payment.refunded_surcharge ?? 0)) : 0;

  const previewAmount = (() => {
    if (mode === 'full') return refundable;
    const v = parseFloat(value) || 0;
    if (mode === 'percent') return Math.min(refundable, Math.round(payment.amount * (v / 100) * 100) / 100);
    return Math.min(refundable, v);
  })();

  // Card network rules require the surcharge to be returned proportionally
  // to whatever fraction of the base fee is being refunded — mirrors the
  // server-side calculation in /api/stripe/refund exactly, so this preview
  // matches what actually gets charged back.
  const previewSurcharge = surchargePassed && payment.amount > 0
    ? round2(Math.min((payment.fee_charged ?? 0) * (previewAmount / payment.amount), remainingSurcharge))
    : 0;
  const previewTotal = round2(previewAmount + previewSurcharge);

  const isValid = mode === 'full' ? refundable > 0 : previewAmount > 0 && previewAmount <= refundable;

  async function handleSubmit() {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/stripe/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          fee_payment_id: payment.id,
          mode,
          value: mode === 'full' ? undefined : parseFloat(value),
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not process refund.');
        setSubmitting(false);
        return;
      }
      onDone();
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RotateCcw size={16} color="#DC2626" /> Refund payment
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{feeDescription}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={18} color="#94A3B8" /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '12.5px', color: '#64748B' }}>
            {fmt(payment.amount)} paid{payment.payment_rail ? ` via ${payment.payment_rail === 'ach' ? 'bank account' : 'card'}` : ''}
            {(payment.refunded_amount ?? 0) > 0 && ` · ${fmt(payment.refunded_amount ?? 0)} already refunded`}
            {' · '}<strong style={{ color: '#374151' }}>{fmt(refundable)} refundable</strong>
          </div>

          {refundable <= 0 ? (
            <div style={{ fontSize: '13px', color: '#94A3B8', padding: '12px 0' }}>This payment has already been fully refunded.</div>
          ) : (
            <>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>How much?</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {([
                    { key: 'full',    label: 'Full refund' },
                    { key: 'percent', label: '%' },
                    { key: 'amount',  label: symbolForCurrency(currency) },
                  ] as const).map(opt => (
                    <button key={opt.key} type="button" onClick={() => { setMode(opt.key); setValue(''); }}
                      style={{
                        flex: 1, padding: '8px 10px', borderRadius: '7px',
                        border: `1.5px solid ${mode === opt.key ? '#DC2626' : '#E2E8F0'}`,
                        background: mode === opt.key ? '#FEF2F2' : '#fff',
                        color: mode === opt.key ? '#DC2626' : '#374151',
                        fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {mode !== 'full' && (
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {mode === 'percent' ? 'Percent of original payment' : 'Amount to refund'}
                  <input
                    type="number" min="0" step="0.01"
                    max={mode === 'percent' ? 100 : refundable}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder={mode === 'percent' ? 'e.g. 50' : refundable.toFixed(2)}
                    style={inputStyle}
                  />
                </label>
              )}

              <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                Reason <span style={{ fontWeight: '400', textTransform: 'none', color: '#94A3B8' }}>(optional, for your records)</span>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Player withdrew from team" style={inputStyle} />
              </label>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {previewSurcharge > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#94A3B8' }}>
                      <span>Fee refund</span><span>{fmt(previewAmount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#94A3B8' }}>
                      <span>Surcharge returned</span><span>{fmt(previewSurcharge)}</span>
                    </div>
                    <div style={{ height: '1px', background: '#E2E8F0' }} />
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '600' }}>Total refund</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#DC2626' }}>{fmt(previewTotal)}</span>
                </div>
              </div>

              {payment.method === 'stripe' ? (
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                  Refunded back to the original card or bank account · appears in 5–10 business days.{' '}
                  {surchargePassed
                    ? 'This was a surcharged payment — the card processing surcharge is returned proportionally along with the fee, as required by card network rules.'
                    : "Pulse FC's processing fee isn't refunded."}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>This payment was recorded manually ({payment.method}) — refunding here only updates the ledger. Return the money to the family outside the app.</div>
              )}

              {error && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '10px 12px', fontSize: '12.5px', color: '#B91C1C' }}>{error}</div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!isValid || submitting}
                style={{
                  padding: '11px 16px', borderRadius: '9px', border: 'none',
                  background: !isValid || submitting ? '#F3A9A9' : '#DC2626',
                  color: '#fff', fontSize: '13.5px', fontWeight: '700',
                  cursor: !isValid || submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {submitting ? 'Processing…' : `Refund ${fmt(previewTotal)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
