import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { calculateFee } from '@/lib/feeCalculator';

// Card-only v1 for registration payments — no ACH rail, no surcharge
// disclosure step, no partial-amount override. Keeps the first version of
// "pay at registration" simple; the fee_payments-side rail complexity
// (see /api/stripe/create-payment-intent) can be ported over later if a
// club actually needs it for registrations.
export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ configured: false, error: 'Payments not configured for this club yet.' }, { status: 200 });
  }

  const { payment_token } = await req.json();
  if (!payment_token) return NextResponse.json({ error: 'payment_token required' }, { status: 400 });

  const supabase = supabaseAdmin();

  const { data: inst } = await supabase
    .from('registration_installments')
    .select('id, submission_id, amount, paid_at')
    .eq('payment_token', payment_token)
    .single();
  if (!inst) return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
  if (inst.paid_at) return NextResponse.json({ error: 'This payment has already been received.' }, { status: 400 });

  const { data: submission } = await supabase
    .from('registration_submissions')
    .select('id, form_id')
    .eq('id', inst.submission_id)
    .single();
  if (!submission) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  const { data: form } = await supabase
    .from('registration_forms')
    .select('id, title, currency, club_id')
    .eq('id', submission.form_id)
    .single();
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  const { data: club } = await supabase
    .from('clubs')
    .select('id, name, slug, stripe_fee_handling, stripe_connect_account_id, stripe_connect_onboarded')
    .eq('id', form.club_id)
    .single();

  const connectAccountId = club?.stripe_connect_onboarded ? (club?.stripe_connect_account_id ?? null) : null;
  if (!connectAccountId) {
    return NextResponse.json({ configured: false, error: 'Online payments are not set up for this club yet.' }, { status: 200 });
  }

  const currency  = (form.currency ?? 'USD').toLowerCase();
  const breakdown = calculateFee(inst.amount, 'card');
  const feeChargedMinor = Math.round(breakdown.feeCharged * 100);
  const baseMinor        = Math.round(inst.amount * 100);
  const chargeAmount     = club?.stripe_fee_handling === 'pass_on' ? baseMinor + feeChargedMinor : baseMinor;
  const applicationFeeAmount = feeChargedMinor;

  const piBody = new URLSearchParams({
    amount: String(chargeAmount),
    currency,
    'payment_method_types[0]': 'card',
    'metadata[registration_installment_id]': inst.id,
    'metadata[payment_token]': payment_token,
    'metadata[submission_id]': submission.id,
    'metadata[club_id]': club?.id ?? '',
    'metadata[club_slug]': club?.slug ?? '',
    'transfer_data[destination]': connectAccountId,
  });
  if (applicationFeeAmount > 0) piBody.set('application_fee_amount', String(applicationFeeAmount));

  const idempotencyKey = `pi_reg_${payment_token}_${chargeAmount}`;

  const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencyKey },
    body: piBody,
  });
  let pi: { id?: string; client_secret?: string; error?: { message?: string } } | null;
  try { pi = await piRes.json(); } catch { pi = null; }

  if (!piRes.ok || !pi?.client_secret) {
    console.error('registration PaymentIntent error:', piRes.status, pi);
    return NextResponse.json({ error: pi?.error?.message ?? 'Could not create payment. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({
    client_secret: pi.client_secret,
    publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    charge_amount: chargeAmount / 100,
  });
}
