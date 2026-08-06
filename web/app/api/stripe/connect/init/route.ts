import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';

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

  // Load club
  const { data: club } = await supabase
    .from('clubs').select('id, name, stripe_connect_account_id').eq('id', club_id).single();
  if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

  let accountId = club.stripe_connect_account_id as string | null;

  // Create Express account if one doesn't exist yet
  if (!accountId) {
    const res = await fetch('https://api.stripe.com/v1/accounts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        type:                    'express',
        'business_type':         'company',
        'business_profile[name]': club.name ?? '',
        'metadata[club_id]':     club_id,
        'capabilities[card_payments][requested]':  'true',
        'capabilities[transfers][requested]':       'true',
      }),
    });
    const account = await res.json();
    if (!account.id) {
      console.error('Stripe account creation failed:', account);
      return NextResponse.json({ error: account.error?.message ?? 'Could not create Stripe account.' }, { status: 500 });
    }
    accountId = account.id;
    await supabase.from('clubs').update({ stripe_connect_account_id: accountId }).eq('id', club_id);
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
  const link = await linkRes.json();
  if (!link.url) {
    console.error('Account link creation failed:', JSON.stringify(link), { returnUrl, refreshUrl, accountId });
    return NextResponse.json({ error: link.error?.message ?? 'Could not generate onboarding link.' }, { status: 500 });
  }

  return NextResponse.json({ url: link.url });
}
