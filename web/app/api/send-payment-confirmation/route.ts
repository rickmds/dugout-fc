import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { player_fee_id, amount_paid } = await req.json();
  if (!player_fee_id) return NextResponse.json({ error: 'player_fee_id required' }, { status: 400 });

  const supabase = supabaseAdmin();

  const { data: fee } = await supabase
    .from('player_fees')
    .select('description, player_id, teams(name, clubs(name, slug))')
    .eq('id', player_fee_id)
    .single();

  if (!fee) return NextResponse.json({ ok: true, skipped: true });

  const { data: invite } = await supabase
    .from('invites')
    .select('email')
    .eq('player_id', (fee as any).player_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!invite?.email) return NextResponse.json({ ok: true, skipped: true, reason: 'no_parent_email' });

  const fmtAmount = `$${Number(amount_paid).toFixed(2)}`;
  const desc = (fee as any).description ?? 'Fee';

  try {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const parentUser = users.find((u) => u.email?.toLowerCase() === invite.email.toLowerCase());
    if (!parentUser) return NextResponse.json({ ok: true, skipped: true, reason: 'no_profile' });

    await supabase.from('notifications').insert({
      profile_id: parentUser.id,
      type: 'payment_confirmed',
      title: '✅ Payment recorded',
      body: `${fmtAmount} received for ${desc}`,
      data: { player_fee_id, type: 'payment_confirmed', club_slug: (fee as any).teams?.clubs?.slug ?? '' },
    });

    const { data: tokens } = await supabase.from('push_tokens').select('token').eq('profile_id', parentUser.id);
    if (tokens?.length) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(tokens.map((t: any) => ({
          to: t.token,
          title: '✅ Payment recorded',
          body: `${fmtAmount} received for ${desc}`,
          sound: 'default',
          data: { type: 'payment_confirmed', player_fee_id, club_slug: (fee as any).teams?.clubs?.slug ?? '' },
        }))),
      });
    }
  } catch (e) {
    console.error('Push error:', e);
  }

  return NextResponse.json({ ok: true });
}
