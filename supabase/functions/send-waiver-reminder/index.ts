// Called from web/app/(dashboard)/dashboard/waivers/page.tsx's "Remind" /
// "Remind all" buttons — a coach nudging one parent to go sign an
// outstanding waiver. Didn't exist until now (the button called it anyway,
// silently failing every time — see send-push's CORS fix for the sibling
// bug in the same area). CORS handling here mirrors send-team-email/
// write-email/send-guest-invite exactly, since this is called from the web
// dashboard the same way they are.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Payload {
  to_email: string;
  player_name: string;
  waiver_title: string;
  club_name: string;
  portal_url: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { to_email, player_name, waiver_title, club_name, portal_url } = payload;

  if (!to_email || !player_name || !waiver_title) {
    return new Response(JSON.stringify({ error: 'to_email, player_name, and waiver_title are required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const displayClub = club_name || 'Pulse FC';
  const subject = `Action needed: sign "${waiver_title}" for ${player_name}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 20px 64px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr><td style="text-align:center;padding:0 28px 28px;">
            <p style="margin:0;font-size:19px;font-weight:800;color:#f9fafb;letter-spacing:-0.4px;">${escapeHtml(displayClub)}</p>
          </td></tr>
          <tr>
            <td style="background:#111111;border:1px solid #222222;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
              <div style="height:3px;background:#F59E0B;"></div>
              <div style="padding:28px 28px 20px;">
                <p style="margin:0 0 8px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Waiver reminder</p>
                <h1 style="margin:0;font-size:22px;font-weight:800;color:#f9fafb;line-height:1.3;letter-spacing:-0.4px;">${escapeHtml(waiver_title)}</h1>
              </div>
              <div style="height:1px;background:#1e1e1e;margin:0 28px;"></div>
              <div style="padding:24px 28px 4px;">
                <p style="margin:0 0 18px;font-size:15px;color:#d1d5db;line-height:1.75;">
                  ${escapeHtml(player_name)} still needs <strong style="color:#f9fafb;">"${escapeHtml(waiver_title)}"</strong> signed before they can take part with ${escapeHtml(displayClub)}. It only takes a minute.
                </p>
              </div>
              <div style="padding:8px 28px 28px;text-align:center;">
                <a href="${portal_url}"
                   style="display:inline-block;background:#F59E0B;color:#000000;text-decoration:none;
                          font-size:16px;font-weight:800;padding:16px 44px;border-radius:12px;
                          letter-spacing:-0.1px;line-height:1;">
                  Sign Now &rarr;
                </a>
              </div>
              <div style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
                <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
                  Sent via <a href="https://pulse-fc.app" style="color:#F59E0B;text-decoration:none;font-weight:600;">Pulse FC</a>
                  &nbsp;&middot;&nbsp;
                  <span style="color:#374151;">&copy; ${new Date().getFullYear()} Pulse FC</span>
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${displayClub} <support@pulse-fc.app>`,
      to: [to_email],
      subject,
      html,
      text: `${player_name} still needs "${waiver_title}" signed before they can take part with ${displayClub}.\n\nSign now: ${portal_url}`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: err }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const data = await res.json();
  return new Response(JSON.stringify({ id: data.id }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
