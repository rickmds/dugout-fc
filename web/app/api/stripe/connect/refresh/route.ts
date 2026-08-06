import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET — Stripe sends the user here when an account link expires mid-onboarding
// We generate a fresh link and redirect them back into the flow
export async function GET(req: NextRequest) {
  const club_id   = req.nextUrl.searchParams.get('club_id');
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const baseUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.pulse-fc.app';

  if (!club_id || !stripeKey) {
    return NextResponse.redirect(new URL(`${baseUrl}/dashboard/settings?tab=club&section=Payments`));
  }

  const supabase = supabaseAdmin();
  const { data: club } = await supabase
    .from('clubs').select('stripe_connect_account_id').eq('id', club_id).single();

  if (!club?.stripe_connect_account_id) {
    return NextResponse.redirect(new URL(`${baseUrl}/dashboard/settings?tab=club&section=Payments`));
  }

  // Generate a fresh account link
  const res  = await fetch('https://api.stripe.com/v1/account_links', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      account:     club.stripe_connect_account_id,
      type:        'account_onboarding',
      return_url:  `${baseUrl}/api/stripe/connect/return?club_id=${club_id}`,
      refresh_url: `${baseUrl}/api/stripe/connect/refresh?club_id=${club_id}`,
    }),
  });
  const link = await res.json();

  if (link.url) return NextResponse.redirect(link.url);
  return NextResponse.redirect(new URL(`${baseUrl}/dashboard/settings?tab=club&section=Payments`));
}
