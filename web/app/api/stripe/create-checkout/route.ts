import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ configured: false, error: 'Stripe is not configured for this club yet.' }, { status: 200 });
  }

  const { payment_token, amount: requestedAmount } = await req.json();
  if (!payment_token) return NextResponse.json({ error: 'payment_token required' }, { status: 400 });

  const supabase = supabaseAdmin();

  // Load fee + club settings in one query
  const { data: fee, error: feeErr } = await supabase
    .from('player_fees')
    .select(`
      id, payment_token, description, amount_due, amount_paid, discount, status,
      players!inner(full_name, profile_id),
      teams!inner(id, name, clubs!inner(name, slug, primary_color, stripe_fee_handling, stripe_surcharge_pct, allow_partial_payments, stripe_connect_account_id, stripe_connect_onboarded))
    `)
    .eq('payment_token', payment_token)
    .single();

  if (feeErr || !fee) return NextResponse.json({ error: 'Fee not found' }, { status: 404 });

  const club = (fee as any).teams?.clubs;
  const balance = Math.max(0, fee.amount_due - fee.discount - fee.amount_paid);

  if (balance <= 0 || fee.status === 'paid' || fee.status === 'waived') {
    return NextResponse.json({ error: 'This fee is already settled.' }, { status: 400 });
  }

  // Determine payment amount
  let payAmount = balance;
  if (club?.allow_partial_payments && requestedAmount && requestedAmount > 0) {
    payAmount = Math.min(parseFloat(requestedAmount), balance);
  }

  // When club passes all fees to parent, gross up so club nets exactly payAmount.
  // Formula: gross = (payAmount + 0.30) / (1 - stripe_rate - platform_rate)
  const stripeRate   = 0.029;
  const platformRate = parseFloat(process.env.STRIPE_PLATFORM_FEE_PCT ?? '0') / 100;
  const chargeAmount = club?.stripe_fee_handling === 'pass_on'
    ? Math.round(((payAmount + 0.30) / (1 - stripeRate - platformRate)) * 100) // cents, grossed up
    : Math.round(payAmount * 100); // cents, exact

  // Get or create Stripe customer for this parent
  const parentProfileId = (fee as any).players?.profile_id as string | null;
  let stripeCustomerId: string | undefined;

  if (parentProfileId) {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', parentProfileId)
      .single();

    if (profileRow?.stripe_customer_id) {
      stripeCustomerId = profileRow.stripe_customer_id;
    } else {
      // Look up parent's email from invite record
      const { data: invite } = await supabase
        .from('invites')
        .select('email')
        .eq('player_id', fee.id) // Note: fee.player_id would be needed — see below
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Create Stripe customer
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          name:     profileRow?.full_name ?? '',
          email:    invite?.email ?? '',
          metadata: JSON.stringify({ profile_id: parentProfileId }),
        } as Record<string, string>),
      });
      const customer = await customerRes.json();
      if (customer.id) {
        stripeCustomerId = customer.id;
        await supabase.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', parentProfileId);
      }
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.pulse-fc.app';
  const successUrl = `${baseUrl}/pay/${payment_token}?paid=1`;
  const cancelUrl  = `${baseUrl}/pay/${payment_token}?cancelled=1`;

  // Platform fee (0% during beta — set STRIPE_PLATFORM_FEE_PCT to charge later)
  const connectAccountId = club?.stripe_connect_onboarded ? (club?.stripe_connect_account_id ?? null) : null;
  const applicationFeeAmount = connectAccountId
    ? Math.round(chargeAmount * platformRate)
    : 0;

  const sessionBody = new URLSearchParams({
    'payment_method_types[]': 'card',
    'mode': 'payment',
    'line_items[0][price_data][currency]':                   'usd',
    'line_items[0][price_data][unit_amount]':                String(chargeAmount),
    'line_items[0][price_data][product_data][name]':         fee.description,
    'line_items[0][price_data][product_data][description]':  `${(fee as any).players?.full_name ?? ''} · ${(fee as any).teams?.name ?? ''}`,
    'line_items[0][quantity]':                               '1',
    'success_url':                                           successUrl,
    'cancel_url':                                            cancelUrl,
    'metadata[player_fee_id]':                               fee.id,
    'metadata[payment_token]':                               payment_token,
    'metadata[pay_amount]':                                  String(payAmount),
    'metadata[club_slug]':                                   club?.slug ?? '',
    'payment_intent_data[metadata][player_fee_id]':          fee.id,
    'payment_intent_data[metadata][payment_token]':          payment_token,
    'customer_creation':                                     'always',
    'saved_payment_method_options[payment_method_order][]':  'card',
    'expires_at':                                            String(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60), // 30 days
  });

  if (stripeCustomerId) {
    sessionBody.set('customer', stripeCustomerId);
  }

  // Route payment to club's connected Stripe account
  if (connectAccountId) {
    sessionBody.set('payment_intent_data[transfer_data][destination]', connectAccountId);
    if (applicationFeeAmount > 0) {
      sessionBody.set('payment_intent_data[application_fee_amount]', String(applicationFeeAmount));
    }
  }

  const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: sessionBody,
  });

  const session = await sessionRes.json();

  if (!session.url) {
    console.error('Stripe session error:', session);
    return NextResponse.json({ error: session.error?.message ?? 'Could not create checkout session.' }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
