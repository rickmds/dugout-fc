import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET — Stripe redirects here after the club completes (or abandons) onboarding
// We verify completion status and mark the club as connected
export async function GET(req: NextRequest) {
  const club_id = req.nextUrl.searchParams.get('club_id');
  if (!club_id) return NextResponse.redirect(new URL('/dashboard/settings?tab=club&section=Payments&connect=error', req.url));

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const baseUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.pulse-fc.app';

  if (!stripeKey) return NextResponse.redirect(new URL(`${baseUrl}/dashboard/settings?tab=club&section=Payments&connect=error`));

  const supabase = supabaseAdmin();
  const { data: club } = await supabase
    .from('clubs').select('id, stripe_connect_account_id').eq('id', club_id).single();

  if (!club?.stripe_connect_account_id) {
    return NextResponse.redirect(new URL(`${baseUrl}/dashboard/settings?tab=club&section=Payments&connect=error`));
  }

  // Retrieve the account from Stripe to check onboarding status
  const res     = await fetch(`https://api.stripe.com/v1/accounts/${club.stripe_connect_account_id}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const account = await res.json();

  if (account.details_submitted) {
    await supabase.from('clubs').update({ stripe_connect_onboarded: true }).eq('id', club_id);
    return NextResponse.redirect(new URL(`${baseUrl}/dashboard/settings?tab=club&section=Payments&connect=success`));
  }

  // Onboarding not complete — send back to settings so they can try again
  return NextResponse.redirect(new URL(`${baseUrl}/dashboard/settings?tab=club&section=Payments&connect=incomplete`));
}
