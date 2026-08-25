import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';
import { applyRefund } from '@/lib/refunds';

type RefundMode = 'full' | 'percent' | 'amount';

type PaymentForRefund = {
  id: string; player_fee_id: string; amount: number; method: string;
  stripe_payment_intent_id: string | null; refunded_amount: number;
  fee_charged: number | null; surcharge_passed_to_payer: boolean; refunded_surcharge: number;
  player_fees: {
    id: string;
    teams: { clubs: { id: string; stripe_connect_account_id: string | null; stripe_connect_onboarded: boolean | null } | null } | null;
  } | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin', 'coach']);
  if (!auth.ok) return auth.response;

  const { fee_payment_id, mode, value, reason } = await req.json() as {
    fee_payment_id?: string; mode?: RefundMode; value?: number; reason?: string;
  };
  if (!fee_payment_id) return NextResponse.json({ error: 'fee_payment_id required' }, { status: 400 });
  if (mode !== 'full' && mode !== 'percent' && mode !== 'amount') {
    return NextResponse.json({ error: 'mode must be full, percent, or amount' }, { status: 400 });
  }
  if (mode !== 'full' && (!value || value <= 0)) {
    return NextResponse.json({ error: 'value required for percent/amount refunds' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: payment, error: payErr } = await supabase
    .from('fee_payments')
    .select(`
      id, player_fee_id, amount, method, stripe_payment_intent_id, refunded_amount,
      fee_charged, surcharge_passed_to_payer, refunded_surcharge,
      player_fees!inner(id, teams!inner(clubs!inner(id, stripe_connect_account_id, stripe_connect_onboarded)))
    `)
    .eq('id', fee_payment_id)
    .single<PaymentForRefund>();
  if (payErr || !payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  const club = payment.player_fees?.teams?.clubs;
  if (auth.role !== 'app_admin' && club?.id !== auth.clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const refundable = round2(Number(payment.amount) - Number(payment.refunded_amount ?? 0));
  if (refundable <= 0) return NextResponse.json({ error: 'Nothing left to refund on this payment.' }, { status: 400 });

  let refundAmount: number;
  if (mode === 'full') {
    refundAmount = refundable;
  } else if (mode === 'percent') {
    if (value! > 100) return NextResponse.json({ error: 'Percent cannot exceed 100.' }, { status: 400 });
    refundAmount = round2(Number(payment.amount) * (value! / 100));
  } else {
    refundAmount = round2(value!);
  }
  refundAmount = Math.min(refundAmount, refundable);
  if (refundAmount <= 0) return NextResponse.json({ error: 'Refund amount must be greater than zero.' }, { status: 400 });

  // Card network rules require the surcharge to be returned too — in full
  // on a full refund, prorated on a partial one — whenever it was actually
  // charged to the payer (pass_on). Proportional to this refund's share of
  // the original base fee, capped to whatever surcharge is still left.
  let surchargeAmount = 0;
  if (payment.surcharge_passed_to_payer && payment.fee_charged) {
    const remainingSurcharge = round2(Number(payment.fee_charged) - Number(payment.refunded_surcharge ?? 0));
    surchargeAmount = round2(Math.min(Number(payment.fee_charged) * (refundAmount / Number(payment.amount)), remainingSurcharge));
  }

  let stripeRefundId: string | null = null;

  if (payment.method === 'stripe') {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return NextResponse.json({ error: 'Payments are not configured on this server.' }, { status: 500 });
    if (!payment.stripe_payment_intent_id) return NextResponse.json({ error: 'This payment has no Stripe reference to refund.' }, { status: 400 });

    const body = new URLSearchParams({
      payment_intent: payment.stripe_payment_intent_id,
      amount: String(Math.round((refundAmount + surchargeAmount) * 100)),
    });
    // Pull the refunded amount back out of the connected account's balance
    // (rather than leaving the club to fund it) — only valid when the
    // original charge actually transferred to a connected account.
    //
    // refund_application_fee returns our platform cut too, prorated by
    // Stripe to match the refund amount (full refund -> full fee back,
    // partial -> proportional). Without it, Stripe defaults to keeping the
    // application fee, so the club's balance absorbed the entire refund
    // including our cut, on every refund ever issued.
    if (club?.stripe_connect_onboarded && club?.stripe_connect_account_id) {
      body.set('reverse_transfer', 'true');
      body.set('refund_application_fee', 'true');
    }

    const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    let refund: { id?: string; error?: { message?: string } } | null;
    try { refund = await refundRes.json(); } catch { refund = null; }

    if (!refundRes.ok || !refund?.id) {
      console.error('Stripe refund error:', refundRes.status, refund);
      return NextResponse.json({ error: refund?.error?.message ?? 'Could not process refund. Please try again.' }, { status: 502 });
    }
    stripeRefundId = refund.id;
  }
  // Cash/cheque/bank_transfer/other payments have no gateway to call — the
  // refund is a manual, outside-the-app reversal the admin is recording;
  // we just walk the ledger back.

  const result = await applyRefund({
    feePaymentId: payment.id,
    amount: refundAmount,
    surchargeAmount,
    mode,
    stripeRefundId,
    reason: reason?.trim() || null,
    refundedBy: auth.userId,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    refunded_amount: refundAmount,
    surcharge_refunded: surchargeAmount,
    total_refunded: round2(refundAmount + surchargeAmount),
    stripe_refund_id: stripeRefundId,
  });
}
