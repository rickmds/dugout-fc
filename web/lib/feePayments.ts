import { supabase } from '@/lib/supabase';

// Single source of truth for "record/undo a manual payment against a
// player_fee row" — this exact insert-then-update pair (and the paid vs
// partial threshold) used to be reimplemented independently in three
// places (club-wide Fees page, per-team Fees page, and the Stripe
// webhook), each with subtly different rounding tolerance. The webhook
// stays separate (service role, idempotency, notifications/receipts are
// genuinely different concerns) — this covers the two client-side
// dashboard call sites.

export function computeFeeStatus(newPaid: number, amountDue: number, discount: number): 'paid' | 'partial' | 'outstanding' {
  if (newPaid <= 0) return 'outstanding';
  const balance = amountDue - discount;
  return newPaid >= balance - 0.01 ? 'paid' : 'partial';
}

export async function recordFeePayment(opts: {
  feeId: string; amountDue: number; discount: number; currentPaid: number;
  amount: number; method: string; reference?: string | null; notes?: string | null; recordedBy: string;
}): Promise<{ ok: true; newPaid: number; newStatus: string } | { ok: false; error: string }> {
  const { feeId, amountDue, discount, currentPaid, amount, method, reference, notes, recordedBy } = opts;

  const { error: insertErr } = await supabase.from('fee_payments').insert({
    player_fee_id: feeId, amount, method,
    reference: reference || null, notes: notes || null, recorded_by: recordedBy,
  });
  if (insertErr) return { ok: false, error: `Could not record payment: ${insertErr.message}` };

  const newPaid   = currentPaid + amount;
  const newStatus = computeFeeStatus(newPaid, amountDue, discount);
  const { error: updateErr } = await supabase.from('player_fees').update({ amount_paid: newPaid, status: newStatus }).eq('id', feeId);
  if (updateErr) return { ok: false, error: `Payment was recorded but the fee balance could not be updated: ${updateErr.message}. Please check the ledger.` };

  return { ok: true, newPaid, newStatus };
}

export async function undoFeePayment(opts: {
  paymentId: string; feeId: string; currentPaid: number; paymentAmount: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { paymentId, feeId, currentPaid, paymentAmount } = opts;

  const { error: delErr } = await supabase.from('fee_payments').delete().eq('id', paymentId);
  if (delErr) return { ok: false, error: `Could not undo payment: ${delErr.message}` };

  const newPaid   = Math.max(currentPaid - paymentAmount, 0);
  const newStatus = newPaid <= 0 ? 'outstanding' : 'partial';
  const { error: updateErr } = await supabase.from('player_fees').update({ amount_paid: newPaid, status: newStatus }).eq('id', feeId);
  if (updateErr) return { ok: false, error: `Payment was removed but the fee balance could not be updated: ${updateErr.message}. Please check the ledger.` };

  return { ok: true };
}
