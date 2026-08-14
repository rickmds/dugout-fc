import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { requireRole } from '@/lib/apiAuth';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pulse-fc.app';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { club_id, subject, message } = await req.json() as {
    club_id: string;
    subject: string;
    message: string;
  };

  if (!club_id || !message?.trim()) {
    return NextResponse.json({ error: 'club_id and message required' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // ── 1. Fetch club ─────────────────────────────────────────────────────────────
  const { data: club } = await sb
    .from('clubs')
    .select('id, name, slug, primary_color, logo_url')
    .eq('id', club_id)
    .single();

  if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

  const primary = (club.primary_color && club.primary_color !== '#000000')
    ? club.primary_color : '#22C55E';

  // ── 2. Fetch all club member profiles ─────────────────────────────────────────
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, full_name, role')
    .eq('club_id', club_id);

  const profileIds = (profiles ?? []).map(p => p.id);

  // ── 3. Send push to all club members ─────────────────────────────────────────
  let pushSent = 0;
  if (profileIds.length) {
    const { data: pushTokens } = await sb
      .from('push_tokens')
      .select('token')
      .in('profile_id', profileIds);

    if (pushTokens?.length) {
      const pushTitle = subject?.trim() || `🚨 ${club.name} — Urgent Message`;
      const messages = pushTokens.map(t => ({
        to: t.token,
        title: pushTitle,
        body: message.slice(0, 200),
        sound: 'default',
        priority: 'high',
        data: { type: 'emergency_broadcast', club_slug: club.slug ?? '' },
      }));

      for (let i = 0; i < messages.length; i += 100) {
        await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(messages.slice(i, i + 100)),
        });
      }
      pushSent = pushTokens.length;
    }
  }

  // ── 4. Fetch emails from auth.users for all club members ──────────────────────
  // We pull emails via the admin API on auth.users
  const emailsSent: string[] = [];
  const emailSubject = subject?.trim() || `🚨 Urgent Message from ${club.name}`;

  for (const p of (profiles ?? [])) {
    const { data: userData } = await sb.auth.admin.getUserById(p.id);
    const email = userData?.user?.email;
    if (!email) continue;

    const html = buildBroadcastEmail({
      clubName: club.name,
      clubColor: primary,
      logoUrl: club.logo_url,
      recipientName: p.full_name ?? 'Member',
      message,
      appUrl: APP_URL,
    });

    try {
      await resend.emails.send({
        from: `${club.name} <support@pulse-fc.app>`,
        to: email,
        subject: emailSubject,
        html,
      });
      emailsSent.push(email);
    } catch (e) {
      console.error('Emergency broadcast email failed for', email, e);
    }
  }

  return NextResponse.json({
    ok: true,
    push_sent: pushSent,
    emails_sent: emailsSent.length,
    recipients: profileIds.length,
  });
}

function buildBroadcastEmail({ clubName, clubColor, logoUrl, recipientName, message, appUrl }: {
  clubName: string; clubColor: string; logoUrl: string | null;
  recipientName: string; message: string; appUrl: string;
}) {
  const escaped = message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F5;padding:32px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <!-- Header -->
      <tr><td style="background:${clubColor};border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
        ${logoUrl ? `<img src="${logoUrl}" height="48" style="margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;">` : ''}
        <div style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">Emergency Broadcast</div>
        <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;">${clubName}</div>
      </td></tr>

      <!-- Urgent banner -->
      <tr><td style="background:#DC2626;padding:12px 32px;text-align:center;">
        <div style="font-size:14px;font-weight:800;color:#fff;">🚨 URGENT MESSAGE FROM ${clubName.toUpperCase()}</div>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#fff;padding:28px 32px;">
        <p style="margin:0 0 8px;font-size:14px;color:#374151;">Hi ${recipientName},</p>
        <div style="margin:0 0 24px;font-size:15px;color:#111827;line-height:1.7;background:#FEF2F2;border-left:4px solid #DC2626;padding:16px 20px;border-radius:0 8px 8px 0;">
          ${escaped}
        </div>
        <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.6;">
          This is an emergency broadcast from your club administrator. Please take any necessary action immediately.
          Open the ${clubName} app for more updates.
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#F8FAFC;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#94A3B8;">${clubName} · <a href="${appUrl}" style="color:#94A3B8;">${appUrl}</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
