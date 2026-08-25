import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { STRIPE_FIXED_FEE_MINOR } from '@/lib/countries';
import { calculateFee, LEGACY_BLENDED_FEE_MODEL, type PaymentRail } from '@/lib/feeCalculator';

type FeeForCheckout = {
  id: string; payment_token: string; description: string; amount_due: number; amount_paid: number; discount: number; status: string;
  payee_type: 'club' | 'coach'; fee_model_version: string;
  players: { full_name: string | null; profile_id: string | null } | null;
  teams: {
    id: string; name: string;
    clubs: {
      id: string; name: string; slug: string | null; primary_color: string | null; stripe_fee_handling: string | null;
      stripe_surcharge_pct: number | null; allow_partial_payments: boolean | null;
      stripe_connect_account_id: string | null; stripe_connect_onboarded: boolean | null; currency: string | null;
    } | null;
  } | null;
};

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ configured: false, error: 'Payments not configured for this club yet.' }, { status: 200 });
  }

  const { payment_token, amount: requestedAmount, donation_amount: donationRaw, rail: requestedRailRaw } = await req.json();
  if (!payment_token) return NextResponse.json({ error: 'payment_token required' }, { status: 400 });

  const supabase = supabaseAdmin();

  const { data: fee, error: feeErr } = await supabase
    .from('player_fees')
    .select(`
      id, payment_token, description, amount_due, amount_paid, discount, status, payee_type, fee_model_version,
      players!inner(full_name, profile_id),
      teams!inner(id, name, clubs!inner(id, name, slug, primary_color, stripe_fee_handling, stripe_surcharge_pct, allow_partial_payments, stripe_connect_account_id, stripe_connect_onboarded, currency))
    `)
    .eq('payment_token', payment_token)
    .single<FeeForCheckout>();

  if (feeErr || !fee) return NextResponse.json({ error: 'Fee not found' }, { status: 404 });

  // This fee is collected by the coach directly (cash/Venmo) — never let
  // real money route through the club's Stripe account for it, even if a
  // request reaches this endpoint directly rather than through the UI
  // (which already hides the Pay Now button for coach-collected fees).
  if (fee.payee_type === 'coach') {
    return NextResponse.json({ error: 'This fee is collected directly by your coach — online payment is not available for it.' }, { status: 400 });
  }

  const club    = fee.teams?.clubs;
  const balance = Math.max(0, fee.amount_due - fee.discount - fee.amount_paid);

  if (balance <= 0 || fee.status === 'paid' || fee.status === 'waived') {
    return NextResponse.json({ error: 'This fee is already settled.' }, { status: 400 });
  }

  let payAmount = balance;
  if (club?.allow_partial_payments && requestedAmount && parseFloat(requestedAmount) > 0) {
    payAmount = Math.min(parseFloat(requestedAmount), balance);
  }

  const donationAmount = donationRaw && parseFloat(donationRaw) > 0 ? parseFloat(donationRaw) : 0;

  const currency      = (club?.currency ?? 'USD').toLowerCase();
  const fixedFeeMinor = STRIPE_FIXED_FEE_MINOR[club?.currency ?? 'USD'] ?? STRIPE_FIXED_FEE_MINOR.USD;
  const feeBase       = payAmount + donationAmount;
  const feeBaseMinor  = Math.round(feeBase * 100);

  // A fee keeps whatever model it was created under (see
  // supabase/migrations/20260817000001_rail_based_fee_model.sql) — this is
  // what stops a global rate change from silently repricing an instalment
  // plan a family already agreed to.
  const isLegacyFeeModel = fee.fee_model_version === LEGACY_BLENDED_FEE_MODEL;

  let chargeAmount: number;
  let paymentMethodTypes: string[] | null = null; // null => let Stripe auto-detect (legacy only)
  let rail: PaymentRail | null = null;
  let feeChargedMinor = 0;
  let feeChargedDollars = 0;
  let platformCostDollars = 0;
  let legacyApplicationFeeRate = 0;

  // Card surcharges go through Stripe's native surcharge validation
  // (POST-preview API), which needs a payment method actually attached to
  // tell us the card's funding type (credit vs debit — debit can never be
  // surcharged) and the technically-permitted maximum before we know the
  // real total. So for a card + pass_on transaction we create the
  // PaymentIntent at the base amount only; /api/stripe/check-surcharge
  // fills in the real surcharge once a card is entered, right before
  // confirmation. ACH has no such rule and stays a single step.
  let surchargePending = false;

  if (isLegacyFeeModel) {
    const stripeRate   = (club?.stripe_surcharge_pct ?? 3.0) / 100;
    const platformRate = parseFloat(process.env.STRIPE_PLATFORM_FEE_PCT ?? '0') / 100;
    legacyApplicationFeeRate = platformRate;
    chargeAmount = club?.stripe_fee_handling === 'pass_on'
      ? Math.round((feeBaseMinor + fixedFeeMinor) / (1 - stripeRate - platformRate))
      : feeBaseMinor;
  } else {
    // ACH (us_bank_account) is USD/US-bank-account only in Stripe — fall
    // back to card for any club running in another currency, regardless
    // of what the client requested.
    const requestedRail: PaymentRail = requestedRailRaw === 'card' ? 'card' : 'ach';
    rail = requestedRail === 'ach' && currency === 'usd' ? 'ach' : 'card';

    const breakdown      = calculateFee(feeBase, rail);
    feeChargedDollars    = breakdown.feeCharged;
    platformCostDollars  = breakdown.platformCost;
    feeChargedMinor      = Math.round(feeChargedDollars * 100);

    surchargePending = rail === 'card' && club?.stripe_fee_handling === 'pass_on';
    chargeAmount = surchargePending
      ? feeBaseMinor // surcharge not known yet — filled in by check-surcharge before confirm
      : (club?.stripe_fee_handling === 'pass_on' ? feeBaseMinor + feeChargedMinor : feeBaseMinor);

    // Lock the PaymentIntent to the rail the fee was priced for — letting
    // Stripe's automatic_payment_methods offer an alternative here would
    // mean a payer could complete the charge through a rail with a
    // different real cost than what we just calculated and (for pass_on
    // clubs) charged them for.
    paymentMethodTypes = [rail === 'ach' ? 'us_bank_account' : 'card'];
  }

  const connectAccountId     = club?.stripe_connect_onboarded ? (club?.stripe_connect_account_id ?? null) : null;
  const applicationFeeAmount = connectAccountId
    ? (isLegacyFeeModel ? Math.round(chargeAmount * legacyApplicationFeeRate) : (surchargePending ? 0 : feeChargedMinor))
    : 0;

  // Whether the payer actually paid the processing fee as a surcharge on
  // top of the base amount (pass_on) vs it being absorbed by the club —
  // only the former needs any surcharge returned on a later refund. For
  // the pending-surcharge case this is only a placeholder — the real
  // answer (which depends on whether the card turns out to be debit or
  // credit) gets written by check-surcharge before confirmation.
  const surchargePassedToPayer = !isLegacyFeeModel && club?.stripe_fee_handling === 'pass_on' && !surchargePending;

  // Get or create Stripe customer for this parent
  const parentProfileId = fee.players?.profile_id ?? null;
  let stripeCustomerId: string | undefined;

  if (parentProfileId) {
    const { data: profileRow } = await supabase
      .from('profiles').select('stripe_customer_id, full_name').eq('id', parentProfileId).single();

    if (profileRow?.stripe_customer_id) {
      stripeCustomerId = profileRow.stripe_customer_id;
    } else {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ name: profileRow?.full_name ?? '', 'metadata[profile_id]': parentProfileId }),
      });
      let customer: { id?: string; error?: { message?: string } } | null;
      try { customer = await customerRes.json(); } catch { customer = null; }
      if (customerRes.ok && customer?.id) {
        stripeCustomerId = customer.id;
        await supabase.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', parentProfileId);
      } else {
        // Non-fatal — proceed without a saved customer rather than blocking the payment
        console.error('Stripe customer creation failed:', customerRes.status, customer);
      }
    }
  }

  const piBody = new URLSearchParams({
    amount:                      String(chargeAmount),
    currency,
    'metadata[player_fee_id]':   fee.id,
    'metadata[payment_token]':   payment_token,
    'metadata[pay_amount]':      String(payAmount),
    'metadata[club_slug]':       club?.slug ?? '',
    'metadata[club_id]':         fee.teams?.clubs?.id ?? '',
    'metadata[donation_amount]': String(donationAmount),
  });

  if (paymentMethodTypes) {
    paymentMethodTypes.forEach((t, i) => piBody.set(`payment_method_types[${i}]`, t));
  } else {
    piBody.set('automatic_payment_methods[enabled]', 'true');
  }
  if (rail) {
    piBody.set('metadata[payment_rail]',   rail);
    piBody.set('metadata[fee_charged]',    String(feeChargedDollars));
    piBody.set('metadata[platform_cost]',  String(platformCostDollars));
    piBody.set('metadata[surcharge_passed_to_payer]', String(surchargePassedToPayer));
    // Placeholder for the pending-surcharge case — check-surcharge
    // overwrites this with the real number (Pulse's normal fee,
    // regardless of what the payer ends up being charged) before confirm.
    piBody.set('metadata[platform_fee_collected]', String(surchargePending ? 0 : applicationFeeAmount / 100));
  }

  if (stripeCustomerId) piBody.set('customer', stripeCustomerId);
  if (connectAccountId) {
    piBody.set('transfer_data[destination]', connectAccountId);
    if (applicationFeeAmount > 0) piBody.set('application_fee_amount', String(applicationFeeAmount));
  }

  // A client-side network timeout doesn't mean the server-side call to
  // Stripe failed — without an idempotency key, a retry (or a double-tap
  // on a slow connection) creates a second, real PaymentIntent instead of
  // replaying the first. Deterministic from the exact request being made:
  // same fee + same amount + same rail + same donation is the same logical
  // request, so Stripe returns the still-open PaymentIntent from the first
  // attempt rather than minting a new one. A genuinely different request
  // (different amount, different rail) gets a different key and a fresh PI.
  const idempotencyKey = `pi_${payment_token}_${chargeAmount}_${rail ?? 'legacy'}_${donationAmount}`;

  const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencyKey },
    body: piBody,
  });
  let pi: { id?: string; client_secret?: string; error?: { message?: string } } | null;
  try { pi = await piRes.json(); } catch { pi = null; }

  if (!piRes.ok || !pi?.client_secret) {
    console.error('PaymentIntent error:', piRes.status, pi);
    return NextResponse.json({ error: pi?.error?.message ?? 'Could not create payment. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({
    payment_intent_id: pi.id,
    client_secret:      pi.client_secret,
    publishable_key:    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    charge_amount:       chargeAmount / 100,
    pay_amount:          payAmount,
    donation_amount:     donationAmount,
    rail,
    fee_charged: rail ? feeChargedDollars : null,
    // true only for card + pass_on: the surcharge shown so far is an
    // estimate — /api/stripe/check-surcharge determines and discloses the
    // real, card-network-validated amount once a card is entered.
    surcharge_pending: surchargePending,
  });
}
