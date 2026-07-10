import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY');

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const {
    mode, event_id, event_title, event_date, event_time, event_type,
    team_name, team_id, reason, email_subject, email_body, coach_name, is_reinstatement,
  } = await req.json();

  // ── Mode 1: Generate email copy only ────────────────────────────────────────
  if (mode === 'generate') {
    const prompt = is_reinstatement
      ? `You are writing a reinstatement email on behalf of a youth soccer coach — good news, a previously cancelled event is back on.

Event details:
- Team: ${team_name}
- Event: ${event_title}
- Type: ${event_type}
- Date: ${event_date}${event_time ? `, ${event_time}` : ''}
- Reason the event is back on: ${reason}

Write a short, upbeat, professional email to parents letting them know the event is reinstated.
- Tone: positive, enthusiastic, clear. Start with the good news.
- Keep it brief — 2–3 short paragraphs max.
- Do NOT include a sign-off name (the app adds it automatically).
- Return ONLY valid JSON with two fields: "subject" (string) and "body" (string, plain text with \\n for line breaks).`
      : `You are writing a cancellation email on behalf of a youth soccer coach.

Event details:
- Team: ${team_name}
- Event: ${event_title}
- Type: ${event_type}
- Date: ${event_date}${event_time ? `, ${event_time}` : ''}
- Reason given by coach: ${reason}

Write a short, professional, friendly cancellation email to the parents.
- Subject line first, then the email body.
- Tone: warm, apologetic but clear.
- Keep it brief — 3 short paragraphs max.
- Do NOT include a sign-off name (the app adds it automatically).
- Return ONLY valid JSON with two fields: "subject" (string) and "body" (string, plain text with \\n for line breaks).`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const json  = await res.json();
    const raw   = json.content?.[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const parsed = JSON.parse(match[0]);
    return new Response(JSON.stringify({ subject: parsed.subject, body: parsed.body }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Shared: fetch club branding + team member emails ────────────────────────
  async function fetchBrandingAndRecipients(admin: ReturnType<typeof createClient>) {
    const [clubRes, membersRes] = await Promise.all([
      admin.from('teams').select('name, clubs(name, logo_url, primary_color)').eq('id', team_id).single(),
      admin.from('team_members').select('profile_id').eq('team_id', team_id),
    ]);

    const club     = (clubRes.data as any)?.clubs ?? {};
    const logoUrl  = club.logo_url  ?? null;
    const accent   = resolveAccent(club.primary_color ?? null);
    const clubName = club.name ?? team_name;

    const profileIds: string[] = ((membersRes.data ?? []) as any[]).map((m) => m.profile_id).filter(Boolean);
    const emailList: Array<{ email: string; name: string }> = [];
    for (const pid of profileIds) {
      const { data: ud } = await admin.auth.admin.getUserById(pid);
      if (ud?.user?.email) {
        const { data: prof } = await admin.from('profiles').select('full_name').eq('id', pid).maybeSingle();
        emailList.push({ email: ud.user.email, name: prof?.full_name ?? '' });
      }
    }
    return { clubName, logoUrl, accent, emailList };
  }

  // ── Mode 2: Confirm cancel ───────────────────────────────────────────────────
  if (mode === 'confirm') {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    await admin.from('events').update({
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
    }).eq('id', event_id);

    const { clubName, logoUrl, accent, emailList } = await fetchBrandingAndRecipients(admin);

    if (emailList.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const html = buildEventEmail({
      subject: email_subject,
      body: email_body,
      teamName: team_name,
      coachName: coach_name,
      clubName,
      logoUrl,
      accent,
      statusType: 'cancelled',
      eventTitle: event_title,
      eventDate: event_date,
      eventTime: event_time ?? null,
    });

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${clubName} <info@pulse-fc.app>`,
        to: emailList.map((r) => r.email),
        subject: email_subject,
        html,
        text: email_body,
      }),
    });

    return new Response(JSON.stringify({ ok: true, sent: emailList.length }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Mode 3: Confirm uncancel ─────────────────────────────────────────────────
  if (mode === 'confirm_uncancel') {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    await admin.from('events').update({
      cancelled_at: null,
      cancellation_reason: null,
    }).eq('id', event_id);

    const { clubName, logoUrl, accent, emailList } = await fetchBrandingAndRecipients(admin);

    if (emailList.length > 0) {
      const html = buildEventEmail({
        subject: email_subject,
        body: email_body,
        teamName: team_name,
        coachName: coach_name,
        clubName,
        logoUrl,
        accent,
        statusType: 'reinstated',
        eventTitle: event_title,
        eventDate: event_date,
        eventTime: event_time ?? null,
      });

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${clubName} <info@pulse-fc.app>`,
          to: emailList.map((r) => r.email),
          subject: email_subject,
          html,
          text: email_body,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true, sent: emailList.length }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Unknown mode' }), {
    status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#000000' : '#ffffff';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  catch { return d; }
}

function buildEventEmail({ subject, body, teamName, coachName, clubName, logoUrl, accent, statusType, eventTitle, eventDate, eventTime }: {
  subject: string; body: string; teamName: string; coachName: string;
  clubName: string; logoUrl: string | null; accent: string;
  statusType: 'cancelled' | 'reinstated';
  eventTitle: string; eventDate: string; eventTime: string | null;
}): string {
  const btnText    = contrastText(accent);
  const year       = new Date().getFullYear();
  const initials   = clubName.split(' ').slice(0, 2).map((w) => (w[0] ?? '').toUpperCase()).join('');
  const isCancelled = statusType === 'cancelled';
  const statusColor = isCancelled ? '#ef4444' : '#22c55e';
  const statusLabel = isCancelled ? '⚠️ CANCELLED' : '✅ BACK ON';
  const bodyHtml   = body
    .split(/\n\n+/).filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.75;">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const logoHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" width="60" height="60" alt="${esc(clubName)}"
         style="display:inline-block;border-radius:14px;" />`
    : `<div style="display:inline-block;width:60px;height:60px;line-height:60px;text-align:center;
                   border-radius:14px;background:${accent};vertical-align:middle;">
         <span style="font-size:22px;font-weight:900;color:${btnText};">${esc(initials)}</span>
       </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 20px 64px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo + club name -->
          <tr>
            <td style="text-align:center;padding-bottom:28px;">
              ${logoHtml}
              <p style="margin:12px 0 0;font-size:18px;font-weight:800;color:#f9fafb;">${esc(clubName)}</p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #222222;border-radius:20px;
                       overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);">

              <!-- Status bar -->
              <div style="height:3px;background:${statusColor};"></div>

              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Header -->
                <tr>
                  <td style="padding:28px 28px 20px;">
                    <div style="display:inline-block;background:${statusColor}20;border:1px solid ${statusColor}40;
                                border-radius:20px;padding:4px 12px;margin-bottom:14px;">
                      <span style="font-size:11px;font-weight:800;color:${statusColor};
                                   text-transform:uppercase;letter-spacing:1.5px;">${statusLabel}</span>
                    </div>
                    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6b7280;
                               text-transform:uppercase;letter-spacing:1.5px;">${esc(teamName)}</p>
                    <h1 style="margin:0;font-size:22px;font-weight:800;color:#f9fafb;
                                line-height:1.3;letter-spacing:-0.4px;">${esc(subject)}</h1>
                  </td>
                </tr>

                <tr><td style="padding:0 28px;"><div style="height:1px;background:#1e1e1e;"></div></td></tr>

                <!-- Event info card -->
                <tr>
                  <td style="padding:20px 28px 4px;">
                    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;
                                overflow:hidden;border-left:3px solid ${statusColor};">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:14px 18px;border-bottom:1px solid #2a2a2a;">
                            <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Event</p>
                            <p style="margin:0;font-size:14px;color:#f9fafb;font-weight:600;">${esc(eventTitle)}</p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:14px 18px;">
                            <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Date</p>
                            <p style="margin:0;font-size:14px;color:#d1d5db;font-weight:600;">${fmtDate(eventDate)}${eventTime ? ` · ${eventTime}` : ''}</p>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:20px 28px 8px;">
                    ${bodyHtml}
                  </td>
                </tr>

                <!-- Signature -->
                <tr>
                  <td style="padding:0 28px 28px;">
                    <p style="margin:0;font-size:14px;color:#9ca3af;font-style:italic;">— ${esc(coachName)}</p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
                    <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
                      Sent by <strong style="color:#9ca3af;">${esc(coachName)}</strong> via
                      <a href="https://pulse-fc.app" style="color:${accent};text-decoration:none;font-weight:600;">Pulse FC</a>
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
