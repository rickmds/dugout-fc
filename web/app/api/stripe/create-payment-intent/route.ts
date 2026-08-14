import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

type FeeForCheckout = {
  id: string; payment_token: string; description: string; amount_due: number; amount_paid: number; discount: number; status: string;
  payee_type: 'club' | 'coach';
  players: { full_name: string | null; profile_id: string | null } | null;
  teams: {
    id: string; name: string;
    clubs: {
      id: string; name: string; slug: string | null; primary_color: string | null; stripe_fee_handling: string | null;
      stripe_surcharge_pct: number | null; allow_partial_payments: boolean | null;
      stripe_connect_account_id: string | null; stripe_connect_onboarded: boolean | null;
    } | null;
  } | null;
};

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ configured: false, error: 'Payments not configured for this club yet.' }, { status: 200 });
  }

  const { payment_token, amount: requestedAmount, donation_amount: donationRaw } = await req.json();
  if (!payment_token) return NextResponse.json({ error: 'payment_token required' }, { status: 400 });

  const supabase = supabaseAdmin();

  const { data: fee, error: feeErr } = await supabase
    .from('player_fees')
    .select(`
      id, payment_token, description, amount_due, amount_paid, discount, status, payee_type,
      players!inner(full_name, profile_id),
      teams!inner(id, name, clubs!inner(id, name, slug, primary_color, stripe_fee_handling, stripe_surcharge_pct, allow_partial_payments, stripe_connect_account_id, stripe_connect_onboarded))
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

  const stripeRate   = (club?.stripe_surcharge_pct ?? 3.0) / 100;
  const platformRate = parseFloat(process.env.STRIPE_PLATFORM_FEE_PCT ?? '0') / 100;
  const feeBase      = payAmount + donationAmount;
  const chargeAmount = club?.stripe_fee_handling === 'pass_on'
    ? Math.round(((feeBase + 0.30) / (1 - stripeRate - platformRate)) * 100)
    : Math.round(feeBase * 100);

  const connectAccountId     = club?.stripe_connect_onboarded ? (club?.stripe_connect_account_id ?? null) : null;
  const applicationFeeAmount = connectAccountId ? Math.round(chargeAmount * platformRate) : 0;

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
    amount:                              String(chargeAmount),
    currency:                            'usd',
    'automatic_payment_methods[enabled]': 'true',
    'metadata[player_fee_id]':           fee.id,
    'metadata[payment_token]':           payment_token,
    'metadata[pay_amount]':              String(payAmount),
    'metadata[club_slug]':               club?.slug ?? '',
    'metadata[club_id]':                 fee.teams?.clubs?.id ?? '',
    'metadata[donation_amount]':         String(donationAmount),
  });

  if (stripeCustomerId) piBody.set('customer', stripeCustomerId);
  if (connectAccountId) {
    piBody.set('transfer_data[destination]', connectAccountId);
    if (applicationFeeAmount > 0) piBody.set('application_fee_amount', String(applicationFeeAmount));
  }

  const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: piBody,
  });
  let pi: { client_secret?: string; error?: { message?: string } } | null;
  try { pi = await piRes.json(); } catch { pi = null; }

  if (!piRes.ok || !pi?.client_secret) {
    console.error('PaymentIntent error:', piRes.status, pi);
    return NextResponse.json({ error: pi?.error?.message ?? 'Could not create payment. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({
    client_secret:   pi.client_secret,
    publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    charge_amount:   chargeAmount / 100,
    pay_amount:      payAmount,
    donation_amount: donationAmount,
  });
}
