import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';
import { countryInfo } from '@/lib/countries';

type StripeResponse = { id?: string; url?: string; error?: { message?: string } };

// POST — called when org_admin clicks "Connect with Stripe"
// Creates (or reuses) a Stripe Express account, generates an account link, returns the URL
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Stripe is not configured on this server.' }, { status: 500 });

  const supabase = supabaseAdmin();
  const { club_id } = await req.json();
  if (!club_id) return NextResponse.json({ error: 'club_id required' }, { status: 400 });
  if (auth.role !== 'app_admin' && club_id !== auth.clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Load club
  const { data: club } = await supabase
    .from('clubs').select('id, name, country, stripe_connect_account_id').eq('id', club_id).single();
  if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

  let accountId = club.stripe_connect_account_id as string | null;

  // Create Express account if one doesn't exist yet
  if (!accountId) {
    // Stripe can't be told a Connect account's country after creation, so
    // this is the one and only chance to set it — omitting it entirely
    // (as this used to) makes Stripe silently default to the platform
    // account's own country, which produces a US-flavored account no
    // matter where the club actually is.
    const res = await fetch('https://api.stripe.com/v1/accounts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        type:                    'express',
        country:                 countryInfo(club.country).code,
        'business_type':         'company',
        'business_profile[name]': club.name ?? '',
        'metadata[club_id]':     club_id,
        'capabilities[card_payments][requested]':  'true',
        'capabilities[transfers][requested]':       'true',
      }),
    });
    let account: StripeResponse | null;
    try { account = await res.json(); } catch { account = null; }
    if (!res.ok || !account?.id) {
      console.error('Stripe account creation failed:', res.status, account);
      return NextResponse.json({ error: account?.error?.message ?? 'Could not create Stripe account. Please try again.' }, { status: 502 });
    }
    accountId = account.id;

    // If this write fails, the club's stripe_connect_account_id stays
    // null — meaning a retry below would create a SECOND Stripe account,
    // orphaning this one, and (worse) the account.updated webhook keys
    // off stripe_connect_account_id to find the club, so it could never
    // mark this club onboarded even if they finish Express setup for an
    // account we have no record of. Stop here rather than handing back a
    // working-looking onboarding link for an account the DB doesn't know
    // about.
    const { error: saveErr } = await supabase.from('clubs').update({ stripe_connect_account_id: accountId }).eq('id', club_id);
    if (saveErr) {
      console.error('Failed to save Stripe account id:', saveErr, { club_id, accountId });
      return NextResponse.json({ error: 'Could not save your Stripe account. Please try again.' }, { status: 500 });
    }
  }

  const baseUrl = 'https://pulse-fc.app';

  const returnUrl  = `${baseUrl}/api/stripe/connect/return?club_id=${club_id}`;
  const refreshUrl = `${baseUrl}/api/stripe/connect/refresh?club_id=${club_id}`;

  // Generate a fresh account link (these expire after ~5 min)
  const linkRes = await fetch('https://api.stripe.com/v1/account_links', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      account:     accountId!,
      type:        'account_onboarding',
      return_url:  returnUrl,
      refresh_url: refreshUrl,
    }),
  });
  let link: StripeResponse | null;
  try { link = await linkRes.json(); } catch { link = null; }
  if (!linkRes.ok || !link?.url) {
    console.error('Account link creation failed:', linkRes.status, JSON.stringify(link), { returnUrl, refreshUrl, accountId });
    return NextResponse.json({ error: link?.error?.message ?? 'Could not generate onboarding link. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({ url: link.url });
}
