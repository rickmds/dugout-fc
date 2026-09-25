import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';
import { applyInstallmentRefund } from '@/lib/installmentRefunds';

// Admin-initiated refund for a registration_installments row — same shape
// as /api/stripe/refund (the fee_payments equivalent): claim, call Stripe
// (or skip it for an offline payment), then run the same ledger/notification
// path the webhook uses on a Stripe-dashboard-issued refund.
type RefundMode = 'full' | 'amount';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type InstallmentForRefund = {
  id: string; amount: number; refunded_amount: number; last_refund_id: string | null;
  payment_method: string | null; reference: string | null; paid_at: string | null; submission_id: string;
  registration_submissions: {
    id: string; form_id: string;
    registration_forms: { id: string; club_id: string; clubs: { id: string; stripe_connect_account_id: string | null; stripe_connect_onboarded: boolean | null } | null } | null;
  } | null;
};

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin', 'coach']);
  if (!auth.ok) return auth.response;

  const { installment_id, mode, value, reason } = await req.json() as {
    installment_id?: string; mode?: RefundMode; value?: number; reason?: string;
  };
  if (!installment_id) return NextResponse.json({ error: 'installment_id required' }, { status: 400 });
  if (mode !== 'full' && mode !== 'amount') {
    return NextResponse.json({ error: 'mode must be full or amount' }, { status: 400 });
  }
  if (mode === 'amount' && (!value || value <= 0)) {
    return NextResponse.json({ error: 'value required for amount refunds' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: inst, error: instErr } = await supabase
    .from('registration_installments')
    .select(`
      id, amount, refunded_amount, last_refund_id, payment_method, reference, paid_at, submission_id,
      registration_submissions!inner(id, form_id, registration_forms!inner(id, club_id, clubs!inner(id, stripe_connect_account_id, stripe_connect_onboarded)))
    `)
    .eq('id', installment_id)
    .single<InstallmentForRefund>();
  if (instErr || !inst) return NextResponse.json({ error: 'Installment not found' }, { status: 404 });

  const form = inst.registration_submissions?.registration_forms;
  const club = form?.clubs;
  if (!form || auth.role !== 'app_admin' && form.club_id !== auth.clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!inst.paid_at) return NextResponse.json({ error: 'This installment has not been paid yet.' }, { status: 400 });

  const refundable = round2(Number(inst.amount) - Number(inst.refunded_amount ?? 0));
  if (refundable <= 0) return NextResponse.json({ error: 'Nothing left to refund on this installment.' }, { status: 400 });

  let refundAmount = mode === 'full' ? refundable : round2(value!);
  refundAmount = Math.min(refundAmount, refundable);
  if (refundAmount <= 0) return NextResponse.json({ error: 'Refund amount must be greater than zero.' }, { status: 400 });

  // Claim exclusive access before calling Stripe — same reasoning as
  // fee_payments.refund_pending: without this, two concurrent refund
  // requests (double-click, two admins) could both pass the balance check
  // above and both hit Stripe for the same installment.
  const { data: claimed } = await supabase.from('registration_installments')
    .update({ refund_pending: true })
    .eq('id', inst.id)
    .eq('refund_pending', false)
    .select('id');
  if (!claimed?.length) {
    return NextResponse.json({ error: 'A refund is already in progress for this installment. Please wait and try again.' }, { status: 409 });
  }

  try {
    let stripeRefundId: string;

    if (inst.payment_method === 'stripe') {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return NextResponse.json({ error: 'Payments are not configured on this server.' }, { status: 500 });
      if (!inst.reference) return NextResponse.json({ error: 'This payment has no Stripe reference to refund.' }, { status: 400 });

      const body = new URLSearchParams({ payment_intent: inst.reference });
      // Full refund: omit `amount` so Stripe refunds whatever was actually
      // charged (base + any pass-on surcharge) — registration_installments
      // only tracks the base amount, so a partial refund can only act on
      // that base figure, not a surcharge we never separately recorded here.
      if (mode !== 'full') body.set('amount', String(Math.round(refundAmount * 100)));
      if (club?.stripe_connect_onboarded && club?.stripe_connect_account_id) {
        body.set('reverse_transfer', 'true');
        body.set('refund_application_fee', 'true');
      }

      const idempotencyKey = `refund_reg_${inst.id}_${refundAmount}_${mode}`;
      const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencyKey },
        body,
      });
      let refund: { id?: string; error?: { message?: string } } | null;
      try { refund = await refundRes.json(); } catch { refund = null; }

      if (!refundRes.ok || !refund?.id) {
        console.error('registration installment Stripe refund error:', refundRes.status, refund);
        return NextResponse.json({ error: refund?.error?.message ?? 'Could not process refund. Please try again.' }, { status: 502 });
      }
      stripeRefundId = refund.id;
    } else {
      // Offline payment (cash/cheque/bank_transfer/other) — no gateway to
      // call; the admin is recording a reversal that happened outside the app.
      stripeRefundId = `manual_${inst.id}_${Date.now()}`;
    }

    const result = await applyInstallmentRefund(
      {
        kind: 'registration', id: inst.id, amount: Number(inst.amount),
        refunded_amount: Number(inst.refunded_amount ?? 0), last_refund_id: inst.last_refund_id,
        submission_id: inst.submission_id,
      },
      { amount: refundAmount, stripeRefundId, reason: reason?.trim() || null },
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

    return NextResponse.json({
      ok: true, refunded_amount: refundAmount,
      stripe_refund_id: stripeRefundId.startsWith('manual_') ? null : stripeRefundId,
    });
  } finally {
    await supabase.from('registration_installments').update({ refund_pending: false }).eq('id', inst.id);
  }
}
