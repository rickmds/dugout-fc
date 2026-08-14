import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });

  const body = await req.text();
  const sig  = req.headers.get('stripe-signature') ?? '';

  // Verify Stripe signature manually (no Stripe SDK — raw crypto)
  const verified = await verifyStripeSignature(body, sig, webhookSecret);
  if (!verified) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });

  const event = JSON.parse(body);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { player_fee_id, pay_amount, club_slug } = session.metadata ?? {};
    if (player_fee_id) {
      const amountPaid = pay_amount ? parseFloat(pay_amount) : session.amount_total / 100;
      await handlePaymentComplete({ player_fee_id, pay_amount: amountPaid, club_slug, reference: session.id, payment_intent_id: session.payment_intent });
    }
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const { player_fee_id, pay_amount, club_slug, club_id, donation_amount } = pi.metadata ?? {};
    if (player_fee_id) {
      const amountPaid = pay_amount ? parseFloat(pay_amount) : pi.amount_received / 100;
      await handlePaymentComplete({ player_fee_id, pay_amount: amountPaid, club_slug, reference: pi.id, payment_intent_id: pi.id });
      if (club_id && donation_amount && parseFloat(donation_amount) > 0) {
        const supabase = supabaseAdmin();
        await supabase.from('hardship_contributions').insert({ club_id, player_fee_id, amount: parseFloat(donation_amount) });
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    const { player_fee_id, club_slug } = pi.metadata ?? {};
    if (player_fee_id) {
      const declineReason = pi.last_payment_error?.message ?? 'Your card was declined.';
      await handlePaymentFailed({ player_fee_id, club_slug, declineReason });
    }
  }

  if (event.type === 'account.updated') {
    await handleAccountUpdated(event.data.object);
  }

  return NextResponse.json({ received: true });
}

// Stripe fires this whenever a connected account's status changes — the
// only path to re-check it, since connect/return/route.ts only runs once
// at the end of onboarding. If Stripe later restricts/deauthorizes an
// account (compliance hold, disputes, manual review), charges_enabled
// flips to false and the payment page needs to stop offering online
// payment for that club instead of silently keeping stripe_connect_onboarded
// stuck at true forever.
async function handleAccountUpdated(account: { id: string; charges_enabled?: boolean; details_submitted?: boolean }) {
  const supabase = supabaseAdmin();
  const stillOnboarded = !!(account.charges_enabled && account.details_submitted);

  const { error } = await supabase
    .from('clubs')
    .update({ stripe_connect_onboarded: stillOnboarded })
    .eq('stripe_connect_account_id', account.id);

  if (error) console.error('account.updated: failed to sync stripe_connect_onboarded', { account_id: account.id, error: error.message });
}

// A declined/failed card produces no fee_payments row — nothing was
// actually charged — but the parent should still be told, otherwise a
// failed payment looks identical to "never tried" from their side.
async function handlePaymentFailed({ player_fee_id, club_slug, declineReason }: {
  player_fee_id: string; club_slug?: string; declineReason: string;
}) {
  const supabase = supabaseAdmin();

  const { data: fee } = await supabase
    .from('player_fees')
    .select('id, description, player_id')
    .eq('id', player_fee_id)
    .single();
  if (!fee) return;

  const { data: player } = await supabase
    .from('players')
    .select('profile_id')
    .eq('id', fee.player_id)
    .single();
  const parentProfileId = player?.profile_id as string | null;
  if (!parentProfileId) return;

  await supabase.from('notifications').insert({
    profile_id: parentProfileId,
    type:       'payment_failed',
    title:      '❌ Payment failed',
    body:       `${fee.description} — ${declineReason}`,
    data:       { player_fee_id, type: 'payment_failed', club_slug: club_slug ?? '' },
  });

  const { data: parentTokens } = await supabase
    .from('push_tokens').select('token').eq('profile_id', parentProfileId);
  if (parentTokens?.length) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(parentTokens.map(t => ({
        to: t.token, title: '❌ Payment failed',
        body: `${fee.description} — ${declineReason}`,
        sound: 'default',
        data: { type: 'payment_failed', player_fee_id, club_slug: club_slug ?? '' },
      }))),
    });
  }
}

type FeeWithClub = {
  id: string; amount_due: number; amount_paid: number; discount: number; description: string; player_id: string;
  teams: { id: string; name: string; clubs: { id: string; name: string; slug: string | null; logo_url: string | null; primary_color: string | null } | null } | null;
};

async function handlePaymentComplete({ player_fee_id, pay_amount: amountPaid, club_slug, reference, payment_intent_id }: {
  player_fee_id: string; pay_amount: number; club_slug?: string; reference: string; payment_intent_id: string;
}) {
  const supabase = supabaseAdmin();
  const paymentIntentId = payment_intent_id;

  // Load the fee
  const { data: fee } = await supabase
    .from('player_fees')
    .select('id, amount_due, amount_paid, discount, description, player_id, teams!inner(id, name, clubs!inner(id, name, slug, logo_url, primary_color))')
    .eq('id', player_fee_id)
    .single<FeeWithClub>();

  if (!fee) return;

  const prevPaid  = fee.amount_paid ?? 0;
  const newPaid   = prevPaid + amountPaid;
  const balance   = Math.max(0, (fee.amount_due ?? 0) - (fee.discount ?? 0));
  const newStatus = newPaid >= balance - 0.01 ? 'paid' : 'partial';

  // Idempotency: Stripe delivers webhooks at-least-once, so the same
  // payment can arrive more than once (checkout.session.completed AND
  // payment_intent.succeeded for one payment, or a plain retry). The
  // insert below is the atomic claim — a duplicate delivery hits the
  // unique constraint on stripe_payment_intent_id and we stop here
  // before crediting the fee or notifying anyone a second time.
  const { error: insertErr } = await supabase.from('fee_payments').insert({
    player_fee_id,
    amount:                   amountPaid,
    method:                   'stripe',
    reference:                reference,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id:         paymentIntentId,
    notes:                    'Online payment via Stripe',
  });
  if (insertErr) {
    if (insertErr.code === '23505') return; // already processed this payment intent
    console.error('fee_payments insert failed', insertErr);
    return;
  }

  const { error: updateErr } = await supabase.from('player_fees').update({
    amount_paid: newPaid,
    status:      newStatus,
  }).eq('id', player_fee_id);
  if (updateErr) console.error('player_fees update failed', updateErr, { player_fee_id });

  // Load parent + coach details for notifications
  const club      = fee.teams?.clubs;
  const clubName  = club?.name  ?? 'Your club';
  const teamId    = fee.teams?.id ?? '';
  const teamName  = fee.teams?.name ?? 'your team';
  const accent    = resolveAccent(club?.primary_color);

  const { data: player } = await supabase
    .from('players')
    .select('full_name, profile_id')
    .eq('id', fee.player_id)
    .single();

  const playerName     = player?.full_name ?? 'Player';
  const parentProfileId = player?.profile_id as string | null;

  const fmtAmount = `$${amountPaid.toFixed(2)}`;

  // ── Notify parent ─────────────────────────────────────────────────────────
  if (parentProfileId) {
    await supabase.from('notifications').insert({
      profile_id: parentProfileId,
      type:       'payment_confirmed',
      title:      '✅ Payment confirmed',
      body:       `${fee.description} · ${fmtAmount} — received`,
      data:       { player_fee_id, type: 'payment_confirmed', club_slug: club_slug ?? club?.slug ?? '' },
    });

    const { data: parentTokens } = await supabase
      .from('push_tokens').select('token').eq('profile_id', parentProfileId);
    if (parentTokens?.length) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(parentTokens.map(t => ({
          to: t.token, title: '✅ Payment confirmed',
          body: `${fee.description} · ${fmtAmount} received. Thanks!`,
          sound: 'default',
          data: { type: 'payment_confirmed', player_fee_id, club_slug: club_slug ?? club?.slug ?? '' },
        }))),
      });
    }
  }

  // ── Notify coaches + org_admins ───────────────────────────────────────────
  const [{ data: coachRows }, { data: adminRows }] = await Promise.all([
    supabase.from('team_members').select('profile_id').eq('team_id', teamId).eq('role', 'coach'),
    supabase.from('profiles').select('id').eq('club_id', club?.id ?? '').in('role', ['org_admin', 'app_admin']),
  ]);
  const staffIds = [
    ...(coachRows ?? []).map(r => r.profile_id as string),
    ...(adminRows ?? []).map(r => r.id as string),
  ].filter((id, i, arr) => !!id && arr.indexOf(id) === i && id !== parentProfileId);

  if (staffIds.length) {
    await supabase.from('notifications').insert(
      staffIds.map(profile_id => ({
        profile_id,
        type:  'payment_received',
        title: '💳 Payment received',
        body:  `${playerName} paid ${fee.description} · ${fmtAmount}`,
        data:  { player_fee_id, type: 'payment_received', club_slug: club_slug ?? club?.slug ?? '' },
      }))
    );
    const { data: staffTokenRows } = await supabase
      .from('push_tokens').select('token, profile_id').in('profile_id', staffIds);
    if (staffTokenRows?.length) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(staffTokenRows.map(t => ({
          to: t.token, title: '💳 Payment received',
          body: `${playerName} paid ${fee.description} · ${fmtAmount}`,
          sound: 'default',
          data: { type: 'payment_received', player_fee_id, club_slug: club_slug ?? club?.slug ?? '' },
        }))),
      });
    }
  }

  // ── Branded receipt email to parent ───────────────────────────────────────
  const { data: invite } = await supabase
    .from('invites').select('email')
    .eq('player_id', fee.player_id)
    .order('created_at', { ascending: false })
    .limit(1).single();

  if (invite?.email) {
    const year     = new Date().getFullYear();
    const logoUrl  = club?.logo_url ?? null;
    const initials = clubName.split(' ').slice(0, 2).map((w: string) => (w[0] ?? '').toUpperCase()).join('');
    const btnText  = contrastText(accent);
    const logoHtml = logoUrl
      ? `<img src="${esc(logoUrl)}" width="56" height="56" alt="${esc(clubName)}" style="display:inline-block;border-radius:12px;" />`
      : `<div style="display:inline-block;width:56px;height:56px;line-height:56px;text-align:center;border-radius:12px;background:${accent};vertical-align:middle;"><span style="font-size:20px;font-weight:900;color:${btnText};">${esc(initials)}</span></div>`;

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Payment receipt</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:48px 20px 64px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr><td style="text-align:center;padding-bottom:28px;">${logoHtml}<p style="margin:10px 0 0;font-size:17px;font-weight:800;color:#f9fafb;">${esc(clubName)}</p></td></tr>
<tr><td style="background:#111111;border:1px solid #222222;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
<div style="height:3px;background:#22C55E;"></div>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px 28px 20px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;">Payment Receipt</p>
  <h1 style="margin:0;font-size:22px;font-weight:800;color:#f9fafb;line-height:1.3;">✅ Payment confirmed</h1>
</td></tr>
<tr><td style="padding:0 28px;"><div style="height:1px;background:#1e1e1e;"></div></td></tr>
<tr><td style="padding:24px 28px 20px;">
  <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;overflow:hidden;">
    <div style="height:2px;background:#22C55E;"></div>
    <table cellpadding="0" cellspacing="0" width="100%" style="padding:18px 20px;">
      <tr><td><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Description</p>
        <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#f9fafb;">${esc(fee.description)}</p></td></tr>
      <tr><td><table cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="width:50%;vertical-align:top;">
          <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Amount paid</p>
          <p style="margin:0;font-size:24px;font-weight:900;color:#22C55E;letter-spacing:-0.5px;">${esc(fmtAmount)}</p>
        </td>
        <td style="width:50%;vertical-align:top;text-align:right;">
          <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Player</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:#d1d5db;">${esc(playerName)}</p>
        </td>
      </tr></table></td></tr>
      <tr><td style="padding-top:14px;">
        <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Team</p>
        <p style="margin:0;font-size:14px;color:#9ca3af;">${esc(teamName)}</p>
      </td></tr>
      ${newStatus === 'partial' ? `<tr><td style="padding-top:14px;"><p style="margin:0 0 3px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Remaining balance</p><p style="margin:0;font-size:14px;color:#f59e0b;font-weight:700;">$${(balance - newPaid).toFixed(2)}</p></td></tr>` : ''}
    </table>
  </div>
</td></tr>
<tr><td style="padding:0 28px 24px;"><p style="margin:0;font-size:14px;color:#9ca3af;line-height:1.7;">Keep this email as your receipt. If you have any questions, contact your club administrator.</p></td></tr>
<tr><td style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
  <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">${esc(clubName)} uses <a href="https://pulse-fc.app" style="color:${accent};text-decoration:none;font-weight:600;">Pulse FC</a> for club management. &middot; &copy; ${year} ${esc(clubName)}</p>
</td></tr>
</table></td></tr>
</table></td></tr></table>
</body></html>`;

    await resend.emails.send({
      from:    `${clubName} <support@pulse-fc.app>`,
      to:      invite.email,
      subject: `Receipt: ${fee.description} — ${fmtAmount} received`,
      html,
    });
  }
}

// ── Stripe webhook signature verification (no SDK) ────────────────────────────
const SIGNATURE_TOLERANCE_SECONDS = 300; // Stripe's own recommended replay window

// Constant-time compare — a plain `===` short-circuits on the first
// mismatched character, which leaks timing information an attacker could
// use to guess the correct signature one byte at a time.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyStripeSignature(body: string, header: string, secret: string): Promise<boolean> {
  try {
    const parts: Record<string, string> = {};
    for (const part of header.split(',')) {
      const [k, v] = part.split('=');
      parts[k.trim()] = v.trim();
    }
    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;

    const ts = parseInt(timestamp, 10);
    if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;

    const payload    = `${timestamp}.${body}`;
    const key        = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBytes   = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const computed   = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
    return timingSafeEqual(computed, signature);
  } catch {
    return false;
  }
}

function resolveAccent(hex: string | null | undefined): string {
  if (!hex) return '#22c55e';
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#22c55e';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#22c55e';
  if ((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)) return '#22c55e';
  return hex;
}

function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#000000' : '#ffffff';
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
