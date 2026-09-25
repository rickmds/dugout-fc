import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { buildRegistrationChargeBody } from '@/lib/registrationCharge';
import { claimInstallmentForCharge, releaseInstallmentChargeLock } from '@/lib/installmentChargeLock';

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

  const { payment_token, autopay_consent } = await req.json();
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
    .select('id, form_id, stripe_customer_id')
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

  const charge = buildRegistrationChargeBody({
    amount: inst.amount, currency: form.currency ?? 'USD', club,
    installmentId: inst.id, paymentToken: payment_token, submissionId: submission.id,
  });
  if ('error' in charge) {
    return NextResponse.json({ configured: false, error: 'Online payments are not set up for this club yet.' }, { status: 200 });
  }
  const { body: piBody, chargeAmount } = charge;
  piBody.set('payment_method_types[0]', 'card');

  // Only save the card (and only when the family opts in) if there's
  // actually a future installment to charge it against later — a one-time
  // full payment never creates a saved card or a Stripe Customer.
  const { count: futureCount } = await supabase
    .from('registration_installments')
    .select('id', { count: 'exact', head: true })
    .eq('submission_id', submission.id)
    .neq('id', inst.id)
    .is('paid_at', null);
  const wantsAutopay = !!autopay_consent && (futureCount ?? 0) > 0;

  if (wantsAutopay) {
    let customerId = submission.stripe_customer_id;
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'metadata[submission_id]': submission.id }),
      });
      let customer: { id?: string } | null;
      try { customer = await customerRes.json(); } catch { customer = null; }
      if (customerRes.ok && customer?.id) {
        customerId = customer.id;
        await supabase.from('registration_submissions').update({ stripe_customer_id: customerId, autopay_consent: true }).eq('id', submission.id);
      } else {
        console.error('registration Stripe customer creation failed:', customerRes.status, customer);
      }
    } else {
      await supabase.from('registration_submissions').update({ autopay_consent: true }).eq('id', submission.id);
    }
    if (customerId) {
      piBody.set('customer', customerId);
      piBody.set('setup_future_usage', 'off_session');
    }
  }

  // Claim the installment for the duration of the Stripe round trip — closes
  // the race where the daily auto-charge cron fires for this same
  // installment at the same moment a family is paying it manually.
  const claimed = await claimInstallmentForCharge(supabase, 'registration_installments', inst.id);
  if (!claimed) {
    return NextResponse.json({ error: 'A payment attempt for this installment is already in progress. Please try again in a moment.' }, { status: 409 });
  }

  const idempotencyKey = `pi_reg_${payment_token}_${chargeAmount}`;

  const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencyKey },
    body: piBody,
  });
  let pi: { id?: string; client_secret?: string; error?: { message?: string } } | null;
  try { pi = await piRes.json(); } catch { pi = null; }
  await releaseInstallmentChargeLock(supabase, 'registration_installments', inst.id);

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
