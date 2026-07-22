import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pulse-fc.app';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { club_id, field_names, closed_from, closed_until, duration_label, reason, notify_message } = body as {
    club_id: string;
    field_names: string[];
    closed_from: string;
    closed_until: string | null;
    duration_label: string;
    reason: string;
    notify_message: string;
  };

  if (!club_id || !field_names?.length) {
    return NextResponse.json({ error: 'club_id and field_names required' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // ── 1. Fetch club for branding ────────────────────────────────────────────────
  const { data: club } = await sb
    .from('clubs')
    .select('id, name, primary_color, logo_url')
    .eq('id', club_id)
    .single();

  if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

  const primary = (club.primary_color && club.primary_color !== '#000000')
    ? club.primary_color : '#22C55E';

  // ── 2. Save closure records (one per field) ───────────────────────────────────
  const closureInserts = field_names.map(field_name => ({
    club_id, field_name, sub_zones: [], closed_from,
    closed_until: closed_until ?? null,
    duration_label: duration_label ?? 'rest_of_day',
    reason: reason ?? null,
    notify_message: notify_message ?? null,
  }));

  const { data: insertedClosures, error: insertErr } = await sb
    .from('field_closures')
    .insert(closureInserts)
    .select('id, field_name');

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // ── 3. Find affected practice slots ──────────────────────────────────────────
  // Recurring templates: match by field_name. We collect affected teams.
  const { data: affectedSlots } = await sb
    .from('tryout_practice_slots')
    .select('id, team, field_name, day_of_week, start_time, end_time')
    .eq('club_id', club_id)
    .in('field_name', field_names);

  // Filter to days that fall within the closure window
  const closureFrom = new Date(closed_from);
  const closureUntil = closed_until ? new Date(closed_until) : null;
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Collect days covered by closure
  const coveredDays = new Set<string>();
  const cur = new Date(closureFrom);
  const limit = closureUntil ?? new Date(closureFrom.getTime() + 7 * 86400000);
  while (cur <= limit) {
    coveredDays.add(dayNames[cur.getDay()]);
    cur.setDate(cur.getDate() + 1);
  }

  const slotsToCancel = (affectedSlots ?? []).filter(s => coveredDays.has(s.day_of_week));
  const affectedTeams = [...new Set(slotsToCancel.map(s => s.team).filter(Boolean))] as string[];

  // ── 4. Also cancel dated events on affected fields ────────────────────────────
  // events.location is a text field — match by field name substring
  const { data: affectedEvents } = await sb
    .from('events')
    .select('id, title, event_date, team_id, location')
    .gte('event_date', closureFrom.toISOString().slice(0, 10))
    .lte('event_date', (closureUntil ?? limit).toISOString().slice(0, 10));

  const matchingEvents = (affectedEvents ?? []).filter(e =>
    field_names.some(fn => e.location?.includes(fn))
  );

  if (matchingEvents.length > 0) {
    await sb.from('events').update({
      // Mark with a cancellation note in location field suffix — TODO: add cancellation_reason column in future
    }).in('id', matchingEvents.map(e => e.id));
  }

  // ── 5. Collect coach emails from affected teams ───────────────────────────────
  const { data: coachAssignments } = await sb
    .from('tryout_coach_assignments')
    .select('coach_id, team, role')
    .eq('club_id', club_id)
    .in('team', affectedTeams.length ? affectedTeams : ['__none__']);

  const coachIds = [...new Set((coachAssignments ?? []).map(a => a.coach_id))];

  const { data: coachRecords } = coachIds.length ? await sb
    .from('tryout_coaches')
    .select('id, full_name, email')
    .in('id', coachIds) : { data: [] };

  // ── 6. Collect parent/player emails from affected teams ───────────────────────
  const { data: playerAssignments } = await sb
    .from('tryout_assignments')
    .select('player_id, team')
    .eq('club_id', club_id)
    .in('team', affectedTeams.length ? affectedTeams : ['__none__']);

  const playerIds = [...new Set((playerAssignments ?? []).map(a => a.player_id))];

  const { data: players } = playerIds.length ? await sb
    .from('tryout_players')
    .select('id, first_name, last_name, parent_name, email_primary, email_secondary')
    .in('id', playerIds) : { data: [] };

  // ── 7. Also grab club team_members for regular season parents ─────────────────
  const { data: teamMembers } = await sb
    .from('team_members')
    .select('profile_id, role')
    .in('team_id', matchingEvents.map(e => e.team_id).filter(Boolean));

  const memberProfileIds = [...new Set((teamMembers ?? []).map(m => m.profile_id))];
  const { data: memberProfiles } = memberProfileIds.length ? await sb
    .from('profiles')
    .select('id, full_name, email: id')  // we use auth.users for email
    .in('id', memberProfileIds) : { data: [] };

  // ── 8. Build recipient list ───────────────────────────────────────────────────
  type Recipient = { name: string; email: string; coachId?: string; isCoach?: boolean; closureId?: string };
  const recipients: Recipient[] = [];

  // Coaches
  for (const c of (coachRecords ?? [])) {
    if (c.email) {
      const closureId = insertedClosures?.[0]?.id;
      recipients.push({ name: c.full_name ?? 'Coach', email: c.email, coachId: c.id, isCoach: true, closureId });
    }
  }

  // Parents via tryout_players
  for (const p of (players ?? [])) {
    if (p.email_primary) {
      recipients.push({ name: p.parent_name ?? `${p.first_name} ${p.last_name}`, email: p.email_primary });
    }
    if (p.email_secondary) {
      recipients.push({ name: p.parent_name ?? `${p.first_name} ${p.last_name}`, email: p.email_secondary });
    }
  }

  // Deduplicate by email
  const seen = new Set<string>();
  const uniqueRecipients = recipients.filter(r => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  // ── 9. Send emails ────────────────────────────────────────────────────────────
  const fieldList = field_names.join(', ');
  const durationText = duration_label === 'rest_of_day' ? 'for the rest of today'
    : duration_label === 'hours' ? 'temporarily'
    : duration_label === 'indefinite' ? 'until further notice'
    : 'for a period of time';

  const emailsSent: string[] = [];

  for (const r of uniqueRecipients) {
    const ackUrl = r.isCoach && r.closureId
      ? `${APP_URL}/api/fields/acknowledge?closure_id=${r.closureId}&coach_email=${encodeURIComponent(r.email)}&coach_name=${encodeURIComponent(r.name)}`
      : null;

    const html = buildClosureEmail({
      clubName: club.name, clubColor: primary, logoUrl: club.logo_url,
      recipientName: r.name, fieldList, reason, durationText,
      message: notify_message, ackUrl, appUrl: APP_URL,
    });

    try {
      await resend.emails.send({
        from: `${club.name} <info@pulse-fc.app>`,
        to: r.email,
        subject: `⚠️ Field Closure: ${fieldList} — ${club.name}`,
        html,
      });
      emailsSent.push(r.email);
    } catch (e) {
      console.error('Email failed for', r.email, e);
    }
  }

  // ── 10. Send push notifications to all club members ───────────────────────────
  const { data: pushTokens } = await sb
    .from('push_tokens')
    .select('token')
    .in('profile_id',
      (await sb.from('profiles').select('id').eq('club_id', club_id)).data?.map(p => p.id) ?? []
    );

  let pushSent = false;
  if (pushTokens?.length) {
    const messages = pushTokens.map(t => ({
      to: t.token,
      title: `⚠️ Field Closure — ${club.name}`,
      body: notify_message
        ? notify_message.slice(0, 150)
        : `${fieldList} is closed ${durationText}. ${reason ? `Reason: ${reason}.` : ''}`,
      sound: 'default',
      data: { type: 'field_closure', field_names, reason },
    }));

    for (let i = 0; i < messages.length; i += 100) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
    }
    pushSent = true;
  }

  // ── 11. Update closure records with sent counts ───────────────────────────────
  if (insertedClosures?.length) {
    await sb.from('field_closures')
      .update({ emails_sent_at: new Date().toISOString(), emails_sent_count: emailsSent.length, push_sent: pushSent })
      .in('id', insertedClosures.map(c => c.id));
  }

  return NextResponse.json({
    ok: true,
    closures: insertedClosures?.length ?? 0,
    sessions_affected: slotsToCancel.length,
    emails_sent: emailsSent.length,
    push_sent: pushSent,
  });
}

// ── Email HTML builder ─────────────────────────────────────────────────────────

function buildClosureEmail({ clubName, clubColor, logoUrl, recipientName, fieldList, reason, durationText, message, ackUrl, appUrl }: {
  clubName: string; clubColor: string; logoUrl: string | null;
  recipientName: string; fieldList: string; reason: string; durationText: string;
  message: string | null; ackUrl: string | null; appUrl: string;
}) {
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
        <div style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">Field Closure Notice</div>
        <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;">${clubName}</div>
      </td></tr>

      <!-- Alert banner -->
      <tr><td style="background:#EF4444;padding:12px 32px;text-align:center;">
        <div style="font-size:14px;font-weight:800;color:#fff;">⚠️ ${fieldList} — CLOSED ${durationText.toUpperCase()}</div>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#fff;padding:28px 32px;">
        <p style="margin:0 0 8px;font-size:14px;color:#374151;">Hi ${recipientName},</p>
        ${message
          ? `<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.7;">${message}</p>`
          : `<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.7;">
              <strong>${fieldList}</strong> is closed ${durationText}.
              ${reason ? `<br><br><strong>Reason:</strong> ${reason}` : ''}
             </p>`
        }

        <!-- Info card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;">
            <div style="font-size:12px;font-weight:800;color:#B91C1C;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Closure Details</div>
            <div style="font-size:13px;color:#374151;"><strong>Field(s):</strong> ${fieldList}</div>
            ${reason ? `<div style="font-size:13px;color:#374151;margin-top:4px;"><strong>Reason:</strong> ${reason}</div>` : ''}
            <div style="font-size:13px;color:#374151;margin-top:4px;"><strong>Duration:</strong> ${durationText.charAt(0).toUpperCase() + durationText.slice(1)}</div>
          </td></tr>
        </table>

        ${ackUrl ? `
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${ackUrl}" style="display:inline-block;background:#16A34A;color:#fff;font-size:13px;font-weight:700;text-decoration:none;padding:11px 28px;border-radius:8px;">
            ✓ Acknowledge Receipt
          </a>
          <p style="font-size:11px;color:#94A3B8;margin:8px 0 0;">Coaches: click to confirm you've received this notice</p>
        </div>` : ''}

        <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.6;">
          We'll send another update when the field reopens. Questions? Reply to this email or contact your club admin through the ${clubName} app.
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
