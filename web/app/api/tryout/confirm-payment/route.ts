import { NextRequest, NextResponse } from 'next/server';
import { handleTryoutPaymentComplete } from '../../stripe/webhook/route';

// Same backstop pattern as /api/registration/confirm-payment.
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

  const { tryout_installment_id } = pi.metadata ?? {};
  if (!tryout_installment_id) return NextResponse.json({ ok: true, status: pi.status });

  await handleTryoutPaymentComplete({
    tryout_installment_id,
    amount: (pi.amount_received ?? 0) / 100,
    payment_intent_id: pi.id,
    payment_method_id: pi.payment_method ?? null,
  });

  return NextResponse.json({ ok: true, status: 'succeeded' });
}
