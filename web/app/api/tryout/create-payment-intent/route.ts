import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { buildTryoutChargeBody } from '@/lib/registrationCharge';

// Card-only v1, same scope decisions as /api/registration/create-payment-intent.
export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ configured: false, error: 'Payments not configured for this club yet.' }, { status: 200 });
  }

  const { payment_token, autopay_consent } = await req.json();
  if (!payment_token) return NextResponse.json({ error: 'payment_token required' }, { status: 400 });

  const supabase = supabaseAdmin();

  const { data: inst } = await supabase
    .from('tryout_installments')
    .select('id, assignment_id, amount, paid_at')
    .eq('payment_token', payment_token)
    .single();
  if (!inst) return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
  if (inst.paid_at) return NextResponse.json({ error: 'This payment has already been received.' }, { status: 400 });

  const { data: assignment } = await supabase
    .from('tryout_assignments')
    .select('id, club_id, stripe_customer_id')
    .eq('id', inst.assignment_id)
    .single();
  if (!assignment) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  const { data: club } = await supabase
    .from('clubs')
    .select('id, name, slug, currency, stripe_fee_handling, stripe_connect_account_id, stripe_connect_onboarded')
    .eq('id', assignment.club_id)
    .single();

  const charge = buildTryoutChargeBody({
    amount: inst.amount, currency: club?.currency ?? 'USD', club,
    installmentId: inst.id, paymentToken: payment_token, assignmentId: assignment.id,
  });
  if ('error' in charge) {
    return NextResponse.json({ configured: false, error: 'Online payments are not set up for this club yet.' }, { status: 200 });
  }
  const { body: piBody, chargeAmount } = charge;
  piBody.set('payment_method_types[0]', 'card');

  const { count: futureCount } = await supabase
    .from('tryout_installments')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignment.id)
    .neq('id', inst.id)
    .is('paid_at', null);
  const wantsAutopay = !!autopay_consent && (futureCount ?? 0) > 0;

  if (wantsAutopay) {
    let customerId = assignment.stripe_customer_id;
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'metadata[assignment_id]': assignment.id }),
      });
      let customer: { id?: string } | null;
      try { customer = await customerRes.json(); } catch { customer = null; }
      if (customerRes.ok && customer?.id) {
        customerId = customer.id;
        await supabase.from('tryout_assignments').update({ stripe_customer_id: customerId, autopay_consent: true }).eq('id', assignment.id);
      } else {
        console.error('tryout Stripe customer creation failed:', customerRes.status, customer);
      }
    } else {
      await supabase.from('tryout_assignments').update({ autopay_consent: true }).eq('id', assignment.id);
    }
    if (customerId) {
      piBody.set('customer', customerId);
      piBody.set('setup_future_usage', 'off_session');
    }
  }

  const idempotencyKey = `pi_tryout_${payment_token}_${chargeAmount}`;

  const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencyKey },
    body: piBody,
  });
  let pi: { id?: string; client_secret?: string; error?: { message?: string } } | null;
  try { pi = await piRes.json(); } catch { pi = null; }

  if (!piRes.ok || !pi?.client_secret) {
    console.error('tryout PaymentIntent error:', piRes.status, pi);
    return NextResponse.json({ error: pi?.error?.message ?? 'Could not create payment. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({
    client_secret: pi.client_secret,
    publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    charge_amount: chargeAmount / 100,
  });
}
