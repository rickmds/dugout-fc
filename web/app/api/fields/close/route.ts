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
    .select('id, name, slug, primary_color, logo_url')
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

  // ── 4. Find dated events on affected fields within closure window ─────────────
  const closureFromDate = closureFrom.toISOString().slice(0, 10);
  const closureUntilDate = (closureUntil ?? limit).toISOString().slice(0, 10);

  const { data: allEvents } = await sb
    .from('events')
    .select('id, title, event_date, event_time, type, team_id, location')
    .gte('event_date', closureFromDate)
    .lte('event_date', closureUntilDate);

  const matchingEvents = (allEvents ?? []).filter(e =>
    field_names.some(fn => e.location?.toLowerCase().includes(fn.toLowerCase()))
  );

  // Mark those events as cancelled
  if (matchingEvents.length > 0) {
    await sb.from('events')
      .update({ cancelled_at: new Date().toISOString(), cancelled_reason: `Field closure: ${reason}` })
      .in('id', matchingEvents.map(e => e.id));
  }

  // ── 5. Get team members for affected event teams ───────────────────────────────
  const affectedEventTeamIds = [...new Set(
    matchingEvents.map(e => e.team_id).filter(Boolean)
  )] as string[];

  const { data: affectedTeamMembers } = affectedEventTeamIds.length ? await sb
    .from('team_members')
    .select('profile_id, team_id')
    .in('team_id', affectedEventTeamIds) : { data: [] };

  const affectedProfileIds = [...new Set(
    (affectedTeamMembers ?? []).map(m => m.profile_id)
  )];

  // ── 6. Get emails for affected members via auth admin ─────────────────────────
  type AffectedRecipient = { profileId: string; email: string; name: string; teamId: string };
  const affectedEmailRecipients: AffectedRecipient[] = [];

  if (affectedProfileIds.length > 0) {
    const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const profileEmailMap = new Map(users.map(u => [u.id, u.email ?? '']));

    const { data: affectedProfiles } = await sb
      .from('profiles')
      .select('id, full_name')
      .in('id', affectedProfileIds);

    for (const profile of (affectedProfiles ?? [])) {
      const email = profileEmailMap.get(profile.id);
      const membership = (affectedTeamMembers ?? []).find(m => m.profile_id === profile.id);
      if (email && membership) {
        affectedEmailRecipients.push({
          profileId: profile.id,
          email,
          name: profile.full_name ?? 'Club Member',
          teamId: membership.team_id,
        });
      }
    }
  }

  // ── 7. Collect tryout coaches/parents from recurring slots ────────────────────
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

  // ── 8. Build full recipient list ──────────────────────────────────────────────
  type Recipient = { name: string; email: string; coachId?: string; isCoach?: boolean; closureId?: string; affectedEvents?: typeof matchingEvents };
  const recipients: Recipient[] = [];

  // Regular club members with affected events — include their specific events
  const seen = new Set<string>();
  for (const r of affectedEmailRecipients) {
    const key = r.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const memberEvents = matchingEvents.filter(e => e.team_id === r.teamId);
    recipients.push({ name: r.name, email: r.email, affectedEvents: memberEvents });
  }

  // Tryout coaches
  for (const c of (coachRecords ?? [])) {
    if (c.email) {
      const key = c.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const closureId = insertedClosures?.[0]?.id;
      recipients.push({ name: c.full_name ?? 'Coach', email: c.email, coachId: c.id, isCoach: true, closureId });
    }
  }

  // Tryout parents
  for (const p of (players ?? [])) {
    for (const email of [p.email_primary, p.email_secondary].filter(Boolean)) {
      const key = email!.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      recipients.push({ name: p.parent_name ?? `${p.first_name} ${p.last_name}`, email: email! });
    }
  }

  const uniqueRecipients = recipients;

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
      affectedEvents: r.affectedEvents,
    });

    try {
      const hasSessionsCancelled = (r.affectedEvents?.length ?? 0) > 0;
      await resend.emails.send({
        from: `${club.name} <support@pulse-fc.app>`,
        to: r.email,
        subject: hasSessionsCancelled
          ? `❌ Session Cancelled + Field Closure: ${fieldList} — ${club.name}`
          : `⚠️ Field Closure: ${fieldList} — ${club.name}`,
        html,
      });
      emailsSent.push(r.email);
    } catch (e) {
      console.error('Email failed for', r.email, e);
    }
  }

  // ── 10. Push only to members with cancelled sessions ──────────────────────────
  const { data: pushTokens } = affectedProfileIds.length ? await sb
    .from('push_tokens')
    .select('token, profile_id')
    .in('profile_id', affectedProfileIds) : { data: [] };

  let pushSent = false;
  if (pushTokens?.length) {
    const messages = pushTokens.map(t => ({
      to: t.token,
      title: `❌ Session Cancelled — ${club.name}`,
      body: `Your session at ${fieldList} has been cancelled. ${reason ? `Reason: ${reason}.` : ''}`,
      sound: 'default',
      data: { type: 'field_closure', field_names, reason, club_slug: (club as any).slug ?? '' },
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
    events_affected: matchingEvents.length,
    emails_sent: emailsSent.length,
    push_sent: pushSent,
  });
}

// ── Email HTML builder ─────────────────────────────────────────────────────────

function buildClosureEmail({ clubName, clubColor, logoUrl, recipientName, fieldList, reason, durationText, message, ackUrl, appUrl, affectedEvents }: {
  clubName: string; clubColor: string; logoUrl: string | null;
  recipientName: string; fieldList: string; reason: string; durationText: string;
  message: string | null; ackUrl: string | null; appUrl: string;
  affectedEvents?: { title: string; event_date: string; event_time: string | null; type: string }[];
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
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;margin-bottom:${affectedEvents?.length ? '16px' : '24px'};">
          <tr><td style="padding:16px 20px;">
            <div style="font-size:12px;font-weight:800;color:#B91C1C;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Closure Details</div>
            <div style="font-size:13px;color:#374151;"><strong>Field(s):</strong> ${fieldList}</div>
            ${reason ? `<div style="font-size:13px;color:#374151;margin-top:4px;"><strong>Reason:</strong> ${reason}</div>` : ''}
            <div style="font-size:13px;color:#374151;margin-top:4px;"><strong>Duration:</strong> ${durationText.charAt(0).toUpperCase() + durationText.slice(1)}</div>
          </td></tr>
        </table>

        ${affectedEvents?.length ? `
        <!-- Affected sessions -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;">
            <div style="font-size:12px;font-weight:800;color:#92400E;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">❌ Your Cancelled Sessions</div>
            ${affectedEvents.map(e => {
              const dateStr = new Date(e.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
              const timeStr = e.event_time ? e.event_time.slice(0, 5) : '';
              return `<div style="font-size:13px;color:#374151;padding:4px 0;border-bottom:1px solid #FDE68A;">
                <strong>${e.title}</strong> — ${dateStr}${timeStr ? ` at ${timeStr}` : ''}
              </div>`;
            }).join('')}
          </td></tr>
        </table>` : ''}

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
