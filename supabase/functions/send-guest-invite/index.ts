import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Payload {
  profile_id: string;
  player_name: string;
  event_id: string;
  guest_id: string;
  requesting_team_id: string;
  coach_name: string;
  role: 'player' | 'coach';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let payload: Payload;
  try { payload = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { profile_id, player_name, event_id, guest_id, requesting_team_id, coach_name, role } = payload;
  if (!profile_id || !event_id || !requesting_team_id) {
    return new Response(JSON.stringify({ error: 'profile_id, event_id, and requesting_team_id are required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Get email from auth.users (service role only)
  const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(profile_id);
  if (userErr || !user?.email) {
    return new Response(JSON.stringify({ error: 'Could not resolve user email' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const toEmail = user.email;

  // Fetch event + team + club in parallel
  const [eventRes, teamRes] = await Promise.all([
    supabase.from('events')
      .select('title, type, event_date, event_time, location, address, home_away, team_id')
      .eq('id', event_id).single(),
    supabase.from('teams')
      .select('name, club_id')
      .eq('id', requesting_team_id).single(),
  ]);

  const event = eventRes.data;
  const team  = teamRes.data;
  if (!event || !team) {
    return new Response(JSON.stringify({ error: 'Event or team not found' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { data: club } = await supabase.from('clubs')
    .select('name, logo_url, primary_color')
    .eq('id', team.club_id).single();

  if (!RESEND_KEY) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no RESEND_API_KEY' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const clubName   = club?.name ?? 'Your Club';
  const teamName   = team.name;
  const isCoach    = role === 'coach';
  const subject    = isCoach
    ? `You've been invited to guest coach — ${event.title}`
    : `${player_name} has been invited to guest play — ${event.title}`;

  const APP_URL    = Deno.env.get('APP_URL') ?? 'https://pulse-fc.app';
  const inviteUrl  = guest_id ? `${APP_URL}/guest-invite/${guest_id}` : null;

  const html = buildHtml({
    clubName,
    teamName,
    coachName:    coach_name,
    playerName:   player_name,
    isCoach,
    event,
    inviteUrl,
    logoUrl:      club?.logo_url      ?? null,
    primaryColor: club?.primary_color ?? null,
  });

  const text = buildText({ clubName, teamName, coachName: coach_name, playerName: player_name, isCoach, event, inviteUrl });

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    `${clubName} <info@pulse-fc.app>`,
      to:      [toEmail],
      subject,
      html,
      text,
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveAccent(hex: string | null | undefined): string {
  if (!hex) return '#22c55e';
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#22c55e';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#22c55e';
  if ((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)) return '#22c55e';
  return hex;
}

function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return ((r * 299 + g * 587 + b * 114) / 1000) > 145 ? '#000000' : '#ffffff';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
}

function buildText({ clubName, teamName, coachName, playerName, isCoach, event, inviteUrl }: {
  clubName: string; teamName: string; coachName: string; playerName: string;
  isCoach: boolean; event: any; inviteUrl: string | null;
}): string {
  const who = isCoach ? 'You have' : `${playerName} has`;
  const lines = [
    `${who} been invited to ${isCoach ? 'guest coach' : 'guest play for'} ${teamName}.`,
    '',
    `Event: ${event.title}`,
    `Date: ${formatDate(event.event_date)}`,
    event.event_time ? `Time: ${formatTime(event.event_time)}` : null,
    (event.location || event.address) ? `Location: ${event.location ?? event.address}` : null,
    '',
    `Invited by ${coachName} · ${clubName}`,
    '',
    inviteUrl ? `Accept or decline: ${inviteUrl}` : 'Open the Pulse FC app to confirm or decline your attendance.',
  ];
  return lines.filter(l => l !== null).join('\n');
}

function buildHtml({ clubName, teamName, coachName, playerName, isCoach, event, inviteUrl, logoUrl, primaryColor }: {
  clubName: string; teamName: string; coachName: string; playerName: string;
  isCoach: boolean; event: any; inviteUrl: string | null; logoUrl: string | null; primaryColor: string | null;
}): string {
  const accent   = resolveAccent(primaryColor);
  const btnText  = contrastText(accent);
  const year     = new Date().getFullYear();
  const initials = clubName.split(' ').slice(0, 2).map(w => (w[0] ?? '').toUpperCase()).join('');

  const logoHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" width="60" height="60" alt="${esc(clubName)}"
         style="display:inline-block;border-radius:14px;" />`
    : `<div style="display:inline-block;width:60px;height:60px;line-height:60px;text-align:center;
                   border-radius:14px;background:${accent};">
         <span style="font-size:22px;font-weight:900;color:${btnText};">${esc(initials)}</span>
       </div>`;

  const headline = isCoach
    ? `You've been invited to guest coach <strong style="color:${accent};">${esc(teamName)}</strong>`
    : `<strong style="color:${accent};">${esc(playerName)}</strong> has been invited to guest play for <strong style="color:${accent};">${esc(teamName)}</strong>`;

  const eventTypeLabel = event.type === 'game' ? 'Game' : event.type === 'training' ? 'Training' : 'Event';
  const homeAwayLabel  = event.home_away === 'home' ? ' · Home' : event.home_away === 'away' ? ' · Away' : '';

  const locationRow = (event.location || event.address) ? `
    <tr>
      <td style="padding:0 28px 14px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="width:22px;font-size:15px;vertical-align:top;padding-top:1px;">📍</td>
            <td style="padding-left:10px;vertical-align:top;">
              <p style="margin:0 0 1px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Location</p>
              <p style="margin:0;font-size:14px;color:#d1d5db;font-weight:600;">${esc(event.location ?? event.address)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Guest ${isCoach ? 'Coaching' : 'Player'} Invitation</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 20px 64px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo + Club -->
          <tr>
            <td style="text-align:center;padding-bottom:28px;">
              ${logoHtml}
              <p style="margin:12px 0 0;font-size:18px;font-weight:800;color:#f9fafb;">${esc(clubName)}</p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #222222;border-radius:20px;overflow:hidden;
                       box-shadow:0 8px 32px rgba(0,0,0,0.5);">
              <div style="height:3px;background:${accent};"></div>

              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Eyebrow + headline -->
                <tr>
                  <td style="padding:32px 28px 20px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6b7280;
                               text-transform:uppercase;letter-spacing:1.5px;">
                      Guest ${isCoach ? 'Coaching' : 'Player'} Invitation
                    </p>
                    <p style="margin:0;font-size:20px;font-weight:800;color:#f9fafb;line-height:1.35;">
                      ${headline}
                    </p>
                    <p style="margin:10px 0 0;font-size:13px;color:#9ca3af;">
                      Invited by ${esc(coachName)}
                    </p>
                  </td>
                </tr>

                <tr><td style="padding:0 28px;"><div style="height:1px;background:#1e1e1e;"></div></td></tr>

                <!-- Event details card -->
                <tr>
                  <td style="padding:24px 28px 8px;">
                    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;
                                padding:18px 20px 8px;">
                      <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#6b7280;
                                 text-transform:uppercase;letter-spacing:1.2px;">
                        ${eventTypeLabel}${homeAwayLabel}
                      </p>
                      <p style="margin:0 0 16px;font-size:17px;font-weight:800;color:#f9fafb;">
                        ${esc(event.title)}
                      </p>
                      <table cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td style="padding-bottom:12px;">
                            <table cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="width:22px;font-size:15px;vertical-align:top;padding-top:1px;">📅</td>
                                <td style="padding-left:10px;vertical-align:top;">
                                  <p style="margin:0 0 1px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Date</p>
                                  <p style="margin:0;font-size:14px;color:#d1d5db;font-weight:600;">${esc(formatDate(event.event_date))}</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        ${event.event_time ? `
                        <tr>
                          <td style="padding-bottom:12px;">
                            <table cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="width:22px;font-size:15px;vertical-align:top;padding-top:1px;">⏰</td>
                                <td style="padding-left:10px;vertical-align:top;">
                                  <p style="margin:0 0 1px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Time</p>
                                  <p style="margin:0;font-size:14px;color:#d1d5db;font-weight:600;">${esc(formatTime(event.event_time))}</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>` : ''}
                        ${(event.location || event.address) ? `
                        <tr>
                          <td style="padding-bottom:12px;">
                            <table cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="width:22px;font-size:15px;vertical-align:top;padding-top:1px;">📍</td>
                                <td style="padding-left:10px;vertical-align:top;">
                                  <p style="margin:0 0 1px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Location</p>
                                  <p style="margin:0;font-size:14px;color:#d1d5db;font-weight:600;">${esc(event.location ?? event.address)}</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>` : ''}
                      </table>
                    </div>
                  </td>
                </tr>

                <!-- CTA buttons -->
                ${inviteUrl ? `
                <tr>
                  <td style="padding:8px 28px 28px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-right:6px;" width="50%">
                          <a href="${esc(inviteUrl)}?action=accept"
                             style="display:block;background:${accent};color:${btnText};text-decoration:none;
                                    font-size:15px;font-weight:800;padding:14px;border-radius:10px;
                                    text-align:center;line-height:1;">
                            ✓&nbsp; Accept
                          </a>
                        </td>
                        <td style="padding-left:6px;" width="50%">
                          <a href="${esc(inviteUrl)}?action=decline"
                             style="display:block;background:#1a1a1a;color:#9ca3af;text-decoration:none;
                                    font-size:15px;font-weight:700;padding:14px;border-radius:10px;
                                    border:1px solid #333;text-align:center;line-height:1;">
                            ✕&nbsp; Decline
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:14px 0 0;font-size:12px;color:#4b5563;text-align:center;">
                      Or open the <strong style="color:#f9fafb;">Pulse FC</strong> app to respond in-app.
                    </p>
                  </td>
                </tr>` : `
                <tr>
                  <td style="padding:20px 28px 28px;">
                    <p style="margin:0;font-size:14px;color:#9ca3af;line-height:1.7;">
                      Open the <strong style="color:#f9fafb;">Pulse FC</strong> app to view full event details and confirm attendance.
                    </p>
                  </td>
                </tr>`}

                <!-- Footer -->
                <tr>
                  <td style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
                    <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
                      ${esc(clubName)} uses
                      <a href="https://pulse-fc.app" style="color:${accent};text-decoration:none;font-weight:600;">Pulse FC</a>
                      for club management.
                      &nbsp;&middot;&nbsp; &copy; ${year} ${esc(clubName)}
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
