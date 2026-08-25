import { NextRequest, NextResponse } from 'next/server';
import { handlePaymentComplete } from '../webhook/route';

// The parent-facing "Payment received" screen used to be driven entirely by
// the client's own Stripe confirmation response, with no server round trip
// at all — if the payment_intent.succeeded webhook that's the *only* other
// path to `handlePaymentComplete` was ever silently dropped (endpoint down
// during Stripe's retry window, secret rotated, a non-2xx that never got
// noticed), the parent would see success while the fee sat unpaid in the
// database forever. This route is the backstop: once the client sees
// Stripe report success, it calls here, which re-fetches the PaymentIntent
// from Stripe itself (never trusts client-supplied status) and runs the
// exact same crediting path the webhook uses. handlePaymentComplete is
// idempotent on stripe_payment_intent_id, so calling it from both this
// route and the webhook (whichever arrives first, or both) is safe by
// construction — this is not a duplicate-charge risk, it's a "make sure
// at least one of the two paths actually runs" backstop.
export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Payments not configured' }, { status: 500 });

  const { payment_intent_id } = await req.json();
  if (!payment_intent_id) return NextResponse.json({ error: 'payment_intent_id required' }, { status: 400 });

  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  let pi: {
    id?: string; status?: string; amount_received?: number;
    metadata?: Record<string, string>;
  } | null;
  try { pi = await res.json(); } catch { pi = null; }

  if (!res.ok || !pi?.id) {
    return NextResponse.json({ error: 'Could not verify payment with Stripe.' }, { status: 502 });
  }

  if (pi.status !== 'succeeded') {
    // Not an error — this is the normal shape for ACH ("processing") or a
    // payment still requiring action. Tell the client the real status
    // instead of claiming success.
    return NextResponse.json({ ok: true, status: pi.status });
  }

  const {
    player_fee_id, pay_amount, club_slug, club_id, donation_amount,
    payment_rail, fee_charged, platform_cost, surcharge_passed_to_payer, platform_fee_collected,
  } = pi.metadata ?? {};

  if (!player_fee_id) {
    return NextResponse.json({ ok: true, status: pi.status });
  }

  const { credited } = await handlePaymentComplete({
    player_fee_id,
    pay_amount: pay_amount ? parseFloat(pay_amount) : (pi.amount_received ?? 0) / 100,
    club_slug,
    reference: pi.id,
    payment_intent_id: pi.id,
    payment_rail: payment_rail === 'card' || payment_rail === 'ach' ? payment_rail : null,
    fee_charged:   fee_charged   ? parseFloat(fee_charged)   : null,
    platform_cost: platform_cost ? parseFloat(platform_cost) : null,
    surcharge_passed_to_payer: surcharge_passed_to_payer === 'true',
    platform_fee_collected: platform_fee_collected ? parseFloat(platform_fee_collected) : null,
  });

  if (credited && club_id && donation_amount && parseFloat(donation_amount) > 0) {
    const { supabaseAdmin } = await import('@/lib/supabase');
    const db = supabaseAdmin();
    const { error: donationErr } = await db.from('hardship_contributions').insert({
      club_id, player_fee_id, amount: parseFloat(donation_amount), stripe_payment_intent_id: pi.id,
    });
    // Unique violation on stripe_payment_intent_id means the webhook (or a
    // prior call to this same route) already recorded this donation —
    // exactly the idempotency guarantee that column exists for.
    if (donationErr && donationErr.code !== '23505') {
      console.error('confirm-payment: hardship_contributions insert failed', donationErr);
    }
  }

  return NextResponse.json({ ok: true, status: 'succeeded' });
}
