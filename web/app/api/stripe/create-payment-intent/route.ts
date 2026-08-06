import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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
      id, payment_token, description, amount_due, amount_paid, discount, status,
      players!inner(full_name, profile_id),
      teams!inner(id, name, clubs!inner(name, slug, primary_color, stripe_fee_handling, allow_partial_payments, stripe_connect_account_id, stripe_connect_onboarded))
    `)
    .eq('payment_token', payment_token)
    .single();

  if (feeErr || !fee) return NextResponse.json({ error: 'Fee not found' }, { status: 404 });

  const club    = (fee as any).teams?.clubs;
  const balance = Math.max(0, fee.amount_due - fee.discount - fee.amount_paid);

  if (balance <= 0 || fee.status === 'paid' || fee.status === 'waived') {
    return NextResponse.json({ error: 'This fee is already settled.' }, { status: 400 });
  }

  let payAmount = balance;
  if (club?.allow_partial_payments && requestedAmount && parseFloat(requestedAmount) > 0) {
    payAmount = Math.min(parseFloat(requestedAmount), balance);
  }

  const donationAmount = donationRaw && parseFloat(donationRaw) > 0 ? parseFloat(donationRaw) : 0;

  const stripeRate   = 0.029;
  const platformRate = parseFloat(process.env.STRIPE_PLATFORM_FEE_PCT ?? '0') / 100;
  const feeBase      = payAmount + donationAmount;
  const chargeAmount = club?.stripe_fee_handling === 'pass_on'
    ? Math.round(((feeBase + 0.30) / (1 - stripeRate - platformRate)) * 100)
    : Math.round(feeBase * 100);

  const connectAccountId     = club?.stripe_connect_onboarded ? (club?.stripe_connect_account_id ?? null) : null;
  const applicationFeeAmount = connectAccountId ? Math.round(chargeAmount * platformRate) : 0;

  // Get or create Stripe customer for this parent
  const parentProfileId = (fee as any).players?.profile_id as string | null;
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
      const customer = await customerRes.json();
      if (customer.id) {
        stripeCustomerId = customer.id;
        await supabase.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', parentProfileId);
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
    'metadata[club_id]':                 (fee as any).teams?.clubs?.id ?? '',
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
  const pi = await piRes.json();

  if (!pi.client_secret) {
    console.error('PaymentIntent error:', pi);
    return NextResponse.json({ error: pi.error?.message ?? 'Could not create payment.' }, { status: 500 });
  }

  return NextResponse.json({
    client_secret:   pi.client_secret,
    publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    charge_amount:   chargeAmount / 100,
    pay_amount:      payAmount,
    donation_amount: donationAmount,
  });
}
