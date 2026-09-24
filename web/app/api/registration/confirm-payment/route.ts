import { NextRequest, NextResponse } from 'next/server';
import { handleRegistrationPaymentComplete } from '../../stripe/webhook/route';

// Same backstop pattern as /api/stripe/confirm-payment — the client calls
// this right after Stripe reports success, as insurance against the
// payment_intent.succeeded webhook being dropped. Re-fetches the
// PaymentIntent from Stripe itself and runs the same idempotent crediting
// path the webhook uses, so it's safe to run from both places.
export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Payments not configured' }, { status: 500 });

  const { payment_intent_id } = await req.json();
  if (!payment_intent_id) return NextResponse.json({ error: 'payment_intent_id required' }, { status: 400 });

  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  let pi: { id?: string; status?: string; amount_received?: number; payment_method?: string; metadata?: Record<string, string> } | null;
  try { pi = await res.json(); } catch { pi = null; }

  if (!res.ok || !pi?.id) return NextResponse.json({ error: 'Could not verify payment with Stripe.' }, { status: 502 });
  if (pi.status !== 'succeeded') return NextResponse.json({ ok: true, status: pi.status });

  const { registration_installment_id } = pi.metadata ?? {};
  if (!registration_installment_id) return NextResponse.json({ ok: true, status: pi.status });

  await handleRegistrationPaymentComplete({
    registration_installment_id,
    amount: (pi.amount_received ?? 0) / 100,
    payment_intent_id: pi.id,
    payment_method_id: pi.payment_method ?? null,
  });

  return NextResponse.json({ ok: true, status: 'succeeded' });
}
