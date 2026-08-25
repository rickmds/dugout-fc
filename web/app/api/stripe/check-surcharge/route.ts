import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { calculateFee, LEGACY_BLENDED_FEE_MODEL } from '@/lib/feeCalculator';

// Stripe's native surcharge API (preview) — needs a payment method actually
// attached to tell us the card's funding type (credit vs debit; debit can
// never legally be surcharged) and the technically-permitted maximum for
// this specific transaction. create-payment-intent creates the
// PaymentIntent at the base amount only for card+pass_on fees; this route
// fills in the real, validated surcharge right before confirmation —
// called once a card has been entered but before the parent commits to pay.
const STRIPE_PREVIEW_VERSION = '2026-03-25.preview';

type FeeForCheck = {
  id: string; payee_type: 'club' | 'coach'; fee_model_version: string;
  teams: {
    clubs: {
      stripe_fee_handling: string | null; currency: string | null;
      stripe_connect_account_id: string | null; stripe_connect_onboarded: boolean | null;
    } | null;
  } | null;
};

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Payments not configured for this club yet.' }, { status: 500 });

  const { payment_token, payment_intent_id, payment_method_id } = await req.json();
  if (!payment_token || !payment_intent_id || !payment_method_id) {
    return NextResponse.json({ error: 'payment_token, payment_intent_id, and payment_method_id are required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: fee, error: feeErr } = await supabase
    .from('player_fees')
    .select(`
      id, payee_type, fee_model_version,
      teams!inner(clubs!inner(stripe_fee_handling, currency, stripe_connect_account_id, stripe_connect_onboarded))
    `)
    .eq('payment_token', payment_token)
    .single<FeeForCheck>();
  if (feeErr || !fee) return NextResponse.json({ error: 'Fee not found' }, { status: 404 });

  const club = fee.teams?.clubs;
  if (fee.payee_type === 'coach' || fee.fee_model_version === LEGACY_BLENDED_FEE_MODEL || club?.stripe_fee_handling !== 'pass_on') {
    return NextResponse.json({ error: 'This payment is not eligible for a card surcharge.' }, { status: 400 });
  }

  const authHeader = { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' };

  // The base amount is whatever create-payment-intent already set and
  // hasn't been touched since — Stripe's own record of it is the source of
  // truth here, rather than re-deriving payAmount/partial/donation logic a
  // second time.
  const getRes = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
    headers: { Authorization: `Bearer ${stripeKey}`, 'Stripe-Version': STRIPE_PREVIEW_VERSION },
  });
  let currentPi: { amount?: number; status?: string; error?: { message?: string } } | null;
  try { currentPi = await getRes.json(); } catch { currentPi = null; }
  if (!getRes.ok || currentPi?.amount == null) {
    return NextResponse.json({ error: currentPi?.error?.message ?? 'Could not load payment.' }, { status: 502 });
  }
  if (currentPi.status && !['requires_payment_method', 'requires_confirmation'].includes(currentPi.status)) {
    return NextResponse.json({ error: 'This payment has already been processed or is no longer awaiting a card.' }, { status: 400 });
  }

  const baseAmountMinor = currentPi.amount;
  const baseAmountDollars = baseAmountMinor / 100;

  // Step 1 — attach the payment method and ask Stripe whether this specific
  // card is even eligible (credit vs debit) and what the technical ceiling
  // is, without yet committing to a final amount.
  const eligibilityRes = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
    method: 'POST',
    headers: { ...authHeader, 'Stripe-Version': STRIPE_PREVIEW_VERSION },
    body: new URLSearchParams({
      payment_method: payment_method_id,
      'amount_details[surcharge][enforce_validation]': 'enabled',
    }),
  });
  let eligibility: { amount_details?: { surcharge?: { status?: string; maximum_amount?: number } }; error?: { message?: string } } | null;
  try { eligibility = await eligibilityRes.json(); } catch { eligibility = null; }
  if (!eligibilityRes.ok) {
    console.error('Surcharge eligibility check failed:', eligibilityRes.status, eligibility);
    return NextResponse.json({ error: eligibility?.error?.message ?? 'Could not validate this card for surcharging.' }, { status: 502 });
  }

  const surcharge = eligibility?.amount_details?.surcharge;
  const eligible  = surcharge?.status === 'available';

  const ourSurchargeMinor = Math.round(calculateFee(baseAmountDollars, 'card').feeCharged * 100);
  const finalSurchargeMinor = eligible
    ? Math.min(ourSurchargeMinor, surcharge?.maximum_amount ?? ourSurchargeMinor)
    : 0; // debit card, or otherwise ineligible — payer only owes the base amount, same as absorb

  // Step 2 — lock in the validated amount before confirmation.
  //
  // Pulse's own cut (application_fee_amount) always equals its normal
  // calculated fee, regardless of whether the card turned out to be
  // ineligible for surcharging or capped below our formula — Pulse doesn't
  // silently absorb the gap. Whoever chose pass_on (the club) is the one
  // whose payout narrows to cover it, exactly like they already agree to
  // in absorb mode; the parent is never charged more than what was
  // disclosed and confirmed.
  const totalChargeMinor = baseAmountMinor + finalSurchargeMinor;
  const applicationFeeMinor = Math.min(ourSurchargeMinor, totalChargeMinor);

  const finalizeBody = new URLSearchParams({
    amount: String(totalChargeMinor),
    'amount_details[surcharge][amount]': String(finalSurchargeMinor),
    'amount_details[surcharge][enforce_validation]': 'enabled',
    'metadata[fee_charged]': String(finalSurchargeMinor / 100),
    'metadata[surcharge_passed_to_payer]': String(finalSurchargeMinor > 0),
    'metadata[platform_fee_collected]': String(applicationFeeMinor / 100),
  });
  if (club?.stripe_connect_onboarded && club?.stripe_connect_account_id) {
    finalizeBody.set('application_fee_amount', String(applicationFeeMinor));
  }

  const finalizeRes = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
    method: 'POST',
    headers: { ...authHeader, 'Stripe-Version': STRIPE_PREVIEW_VERSION },
    body: finalizeBody,
  });
  let finalized: { error?: { message?: string } } | null;
  try { finalized = await finalizeRes.json(); } catch { finalized = null; }
  if (!finalizeRes.ok) {
    console.error('Surcharge finalize failed:', finalizeRes.status, finalized);
    return NextResponse.json({ error: finalized?.error?.message ?? 'Could not finalize this payment amount.' }, { status: 502 });
  }

  return NextResponse.json({
    eligible,
    base_amount:      baseAmountDollars,
    surcharge_amount: finalSurchargeMinor / 100,
    total:             (baseAmountMinor + finalSurchargeMinor) / 100,
  });
}
