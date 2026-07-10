import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  const { to, player_name, form_title, club_name, club_logo_url, primary_color, confirmation_message } = await req.json();
  if (!to || !form_title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const accent    = resolveAccent(primary_color);
  const btnText   = contrastText(accent);
  const clubLabel = club_name ?? 'Pulse FC';
  const initials  = clubLabel.split(' ').slice(0, 2).map((w: string) => (w[0] ?? '').toUpperCase()).join('');
  const year      = new Date().getFullYear();

  const logoHtml = club_logo_url
    ? `<img src="${esc(club_logo_url)}" width="60" height="60" alt="${esc(clubLabel)}"
         style="display:inline-block;border-radius:14px;" />`
    : `<div style="display:inline-block;width:60px;height:60px;line-height:60px;text-align:center;
                   border-radius:14px;background:${accent};vertical-align:middle;">
         <span style="font-size:22px;font-weight:900;color:${btnText};">${esc(initials)}</span>
       </div>`;

  const confirmMsg = (confirmation_message ?? "We'll be in touch shortly with everything you need to know before the season kicks off.").replace(/\n/g, '<br>');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Registration Confirmed — ${esc(form_title)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 20px 64px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo + Club name -->
          <tr>
            <td style="text-align:center;padding-bottom:28px;">
              ${logoHtml}
              <p style="margin:12px 0 0;font-size:18px;font-weight:800;color:#f9fafb;
                         letter-spacing:-0.3px;">${esc(clubLabel)}</p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #222222;border-radius:20px;
                       overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);">

              <!-- Accent bar -->
              <div style="height:3px;background:${accent};"></div>

              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Headline -->
                <tr>
                  <td style="padding:32px 28px 20px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6b7280;
                               text-transform:uppercase;letter-spacing:1.5px;">Registration confirmed</p>
                    <h1 style="margin:0;font-size:24px;font-weight:800;color:#f9fafb;line-height:1.25;letter-spacing:-0.5px;">
                      ${player_name ? `${esc(player_name)} is registered` : "You're registered"}<br>
                      <span style="color:${accent};">for ${esc(form_title)}</span>
                    </h1>
                  </td>
                </tr>

                <!-- Divider -->
                <tr><td style="padding:0 28px;"><div style="height:1px;background:#1e1e1e;"></div></td></tr>

                <!-- Confirmation message -->
                <tr>
                  <td style="padding:24px 28px 20px;">
                    <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.75;">${confirmMsg}</p>
                  </td>
                </tr>

                <!-- Confirmation badge -->
                <tr>
                  <td style="padding:0 28px 28px;">
                    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:16px 20px;">
                      <table cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td style="width:44px;vertical-align:middle;">
                            <div style="display:inline-block;width:36px;height:36px;line-height:36px;
                                        text-align:center;border-radius:50%;
                                        background:${accent}20;border:2px solid ${accent};">
                              <span style="font-size:16px;font-weight:700;color:${accent};">✓</span>
                            </div>
                          </td>
                          <td style="vertical-align:middle;padding-left:4px;">
                            <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Registration</p>
                            <p style="margin:0;font-size:14px;color:#d1d5db;font-weight:600;">${esc(form_title)}</p>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                <!-- Download CTA -->
                <tr>
                  <td style="padding:0 28px 32px;text-align:center;border-top:1px solid #1e1e1e;padding-top:24px;">
                    <p style="margin:0 0 16px;font-size:14px;color:#9ca3af;">
                      Download the Pulse FC app to stay connected with your team
                    </p>
                    <a href="https://apps.apple.com/app/pulse-fc"
                       style="display:inline-block;background:${accent};color:${btnText};
                              text-decoration:none;font-size:15px;font-weight:800;
                              padding:14px 36px;border-radius:12px;letter-spacing:0.2px;line-height:1;">
                      📱 Download Pulse FC
                    </a>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
                    <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
                      ${esc(clubLabel)} uses
                      <a href="https://pulse-fc.app" style="color:${accent};text-decoration:none;font-weight:600;">Pulse FC</a>
                      for club management.
                      &nbsp;&middot;&nbsp; &copy; ${year} ${esc(clubLabel)}
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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${clubLabel} <info@pulse-fc.app>`,
      to: [to],
      subject: `Registration confirmed — ${form_title}`,
      html,
      text: `Your registration for ${form_title} is confirmed.\n\n${confirmation_message ?? "We'll be in touch shortly."}`,
    }),
  });

  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 });
  return NextResponse.json({ ok: true });
}

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
