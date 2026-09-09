import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';
import { sendExpoPush } from '@/lib/expoPush';
import { resolveAccent, contrastText, esc } from '@/lib/emailHelpers';

const resend = new Resend(process.env.RESEND_API_KEY);

type FeeForConfirmation = {
  description: string; player_id: string;
  teams: { name: string; club_id: string; clubs: { name: string; slug: string | null; logo_url: string | null; primary_color: string | null } | null } | null;
};

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { player_fee_id, amount_paid } = await req.json();
  if (!player_fee_id) return NextResponse.json({ error: 'player_fee_id required' }, { status: 400 });

  const supabase = supabaseAdmin();

  const { data: fee } = await supabase
    .from('player_fees')
    .select('description, player_id, teams(name, club_id, clubs(name, slug, logo_url, primary_color))')
    .eq('id', player_fee_id)
    .single<FeeForConfirmation>();

  if (!fee) return NextResponse.json({ ok: true, skipped: true });

  // Same cross-club check as send-fee-reminder — a client-supplied
  // player_fee_id must belong to the caller's own club.
  if (auth.role !== 'app_admin' && fee.teams?.club_id !== auth.clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: invite } = await supabase
    .from('invites')
    .select('email')
    .eq('player_id', fee.player_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!invite?.email) return NextResponse.json({ ok: true, skipped: true, reason: 'no_parent_email' });

  const fmtAmount = `$${Number(amount_paid).toFixed(2)}`;
  const desc = fee.description ?? 'Fee';

  try {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const parentUser = users.find((u) => u.email?.toLowerCase() === invite.email.toLowerCase());
    if (!parentUser) return NextResponse.json({ ok: true, skipped: true, reason: 'no_profile' });

    await supabase.from('notifications').insert({
      profile_id: parentUser.id,
      type: 'payment_confirmed',
      title: '✅ Payment recorded',
      body: `${fmtAmount} received for ${desc}`,
      data: { player_fee_id, type: 'payment_confirmed', club_slug: fee.teams?.clubs?.slug ?? '' },
    });

    const { data: tokens } = await supabase.from('push_tokens').select('token').eq('profile_id', parentUser.id);
    if (tokens?.length) {
      await sendExpoPush(tokens.map(t => ({
        to: t.token,
        title: '✅ Payment recorded',
        body: `${fmtAmount} received for ${desc}`,
        sound: 'default',
        data: { type: 'payment_confirmed', player_fee_id, club_slug: fee.teams?.clubs?.slug ?? '' },
      })));
    }
  } catch (e) {
    console.error('Push error:', e);
  }

  // A manual (cash/check) entry is a real payment record — same as the
  // Stripe-webhook confirmation, a parent should get a receipt to keep,
  // not just a push that scrolls away.
  try {
    const clubName = fee.teams?.clubs?.name ?? 'Your club';
    const accent = resolveAccent(fee.teams?.clubs?.primary_color);
    const btnText = contrastText(accent);
    const logoUrl = fee.teams?.clubs?.logo_url ?? null;
    const initials = clubName.split(' ').slice(0, 2).map((w) => (w[0] ?? '').toUpperCase()).join('');
    const logoHtml = logoUrl
      ? `<img src="${esc(logoUrl)}" width="56" height="56" alt="${esc(clubName)}" style="display:inline-block;border-radius:12px;" />`
      : `<div style="display:inline-block;width:56px;height:56px;line-height:56px;text-align:center;border-radius:12px;background:${accent};vertical-align:middle;"><span style="font-size:20px;font-weight:900;color:${btnText};">${esc(initials)}</span></div>`;

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Payment receipt</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:48px 20px 64px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr><td style="text-align:center;padding-bottom:28px;">${logoHtml}<p style="margin:10px 0 0;font-size:17px;font-weight:800;color:#f9fafb;">${esc(clubName)}</p></td></tr>
<tr><td style="background:#111111;border:1px solid #222222;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
<div style="height:3px;background:${accent};"></div>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px 28px 20px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;">Payment Receipt</p>
  <h1 style="margin:0;font-size:22px;font-weight:800;color:#f9fafb;line-height:1.3;">✅ Payment recorded</h1>
</td></tr>
<tr><td style="padding:0 28px;"><div style="height:1px;background:#1e1e1e;"></div></td></tr>
<tr><td style="padding:24px 28px 20px;">
  <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:18px 20px;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Description</p>
    <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#f9fafb;">${esc(desc)}</p>
    <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Amount recorded</p>
    <p style="margin:0;font-size:24px;font-weight:900;color:${accent};letter-spacing:-0.5px;">${esc(fmtAmount)}</p>
  </div>
</td></tr>
<tr><td style="padding:0 28px 24px;"><p style="margin:0;font-size:14px;color:#9ca3af;line-height:1.7;">Recorded manually by your club (cash, check, or another offline method). Keep this email as your receipt — if anything looks off, contact your club administrator.</p></td></tr>
<tr><td style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
  <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">${esc(clubName)} uses <a href="https://pulse-fc.app" style="color:${accent};text-decoration:none;font-weight:600;">Pulse FC</a> for club management.</p>
</td></tr>
</table></td></tr>
</table></td></tr></table>
</body></html>`;

    await resend.emails.send({
      from: `${clubName} <support@pulse-fc.app>`,
      to: invite.email,
      subject: `Receipt: ${desc} — ${fmtAmount} recorded`,
      html,
    });
  } catch (e) {
    console.error('Payment confirmation email error:', e);
  }

  return NextResponse.json({ ok: true });
}
