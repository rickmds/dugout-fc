import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// The other half of the reconciliation backstop (see
// /api/stripe/confirm-payment): that route covers "the parent's own
// browser tells us the payment succeeded." This covers the case where
// nothing ever told us at all — the parent closed the tab before the
// client-side confirm call fired, *and* the webhook was also lost. Without
// this, that fee sits unpaid in the database forever with nothing to
// surface it to a human. Runs daily, diffing Stripe's own record of
// succeeded PaymentIntents against fee_payments.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ checked: 0, gaps: 0 });

  const supabase = supabaseAdmin();
  const sinceUnix = Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000); // 3-day lookback, wider than Stripe's own retry window

  type StripePI = { id: string; status: string; metadata?: Record<string, string> };
  const succeeded: StripePI[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page++) { // hard cap — this is a diff job, not meant to paginate forever
    const url = new URL('https://api.stripe.com/v1/payment_intents');
    url.searchParams.set('created[gte]', String(sinceUnix));
    url.searchParams.set('limit', '100');
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${stripeKey}` } });
    const body = await res.json() as { data?: StripePI[]; has_more?: boolean };
    if (!res.ok || !body.data) break;

    for (const pi of body.data) {
      if (pi.status === 'succeeded' && pi.metadata?.player_fee_id) succeeded.push(pi);
    }
    if (!body.has_more || !body.data.length) break;
    startingAfter = body.data[body.data.length - 1].id;
  }

  if (!succeeded.length) return NextResponse.json({ checked: 0, gaps: 0 });

  const { data: recorded } = await supabase
    .from('fee_payments')
    .select('stripe_payment_intent_id')
    .in('stripe_payment_intent_id', succeeded.map(pi => pi.id));
  const recordedIds = new Set((recorded ?? []).map(r => r.stripe_payment_intent_id));

  const gaps = succeeded.filter(pi => !recordedIds.has(pi.id));

  if (gaps.length) {
    console.error('reconcile-payments: Stripe shows succeeded PaymentIntents with no matching fee_payments row', {
      gapPaymentIntentIds: gaps.map(pi => pi.id),
    });

    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'app_admin');
    if (admins?.length) {
      await supabase.from('notifications').insert(
        admins.map(a => ({
          profile_id: a.id,
          type:  'payment_reconciliation_gap',
          title: '⚠️ Payment reconciliation gap',
          body:  `${gaps.length} Stripe payment${gaps.length === 1 ? '' : 's'} succeeded with no matching record — a webhook was likely missed. Check the server logs for PaymentIntent IDs.`,
          data:  { type: 'payment_reconciliation_gap', payment_intent_ids: gaps.map(pi => pi.id) },
        }))
      );
    }
  }

  return NextResponse.json({ checked: succeeded.length, gaps: gaps.length });
}
