import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { name, email, message } = await req.json();
  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const year = new Date().getFullYear();
  const escapedMsg = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  const escapedName = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedEmail = email.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>New contact — Pulse FC</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 20px 64px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td style="text-align:center;padding-bottom:28px;">
              <div style="display:inline-block;width:60px;height:60px;line-height:60px;text-align:center;
                          border-radius:14px;background:#22c55e;vertical-align:middle;">
                <span style="font-size:26px;font-weight:900;color:#000;">⚽</span>
              </div>
              <p style="margin:12px 0 0;font-size:18px;font-weight:800;color:#f9fafb;">Pulse FC</p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #222222;border-radius:20px;
                       overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);">

              <div style="height:3px;background:#22c55e;"></div>

              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Header -->
                <tr>
                  <td style="padding:32px 28px 20px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6b7280;
                               text-transform:uppercase;letter-spacing:1.5px;">New message</p>
                    <h1 style="margin:0;font-size:22px;font-weight:800;color:#f9fafb;line-height:1.25;">
                      Contact form submission
                    </h1>
                  </td>
                </tr>

                <tr><td style="padding:0 28px;"><div style="height:1px;background:#1e1e1e;"></div></td></tr>

                <!-- Sender info -->
                <tr>
                  <td style="padding:24px 28px 16px;">
                    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:14px 18px;border-bottom:1px solid #2a2a2a;">
                            <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Name</p>
                            <p style="margin:0;font-size:14px;color:#f9fafb;font-weight:600;">${escapedName}</p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:14px 18px;">
                            <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Email</p>
                            <a href="mailto:${escapedEmail}" style="font-size:14px;color:#22c55e;font-weight:600;text-decoration:none;">${escapedEmail}</a>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                <!-- Message -->
                <tr>
                  <td style="padding:0 28px 28px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Message</p>
                    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:18px;
                                border-left:3px solid #22c55e;">
                      <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.75;">${escapedMsg}</p>
                    </div>
                  </td>
                </tr>

                <!-- Reply CTA -->
                <tr>
                  <td style="padding:0 28px 32px;text-align:center;border-top:1px solid #1e1e1e;padding-top:24px;">
                    <a href="mailto:${escapedEmail}?subject=Re: Pulse FC enquiry"
                       style="display:inline-block;background:#22c55e;color:#000;
                              text-decoration:none;font-size:15px;font-weight:800;
                              padding:14px 36px;border-radius:12px;line-height:1;">
                      Reply to ${escapedName} →
                    </a>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
                    <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
                      Sent via the contact form at
                      <a href="https://pulse-fc.app" style="color:#22c55e;text-decoration:none;font-weight:600;">pulse-fc.app</a>
                      &nbsp;&middot;&nbsp; &copy; ${year} Pulse FC
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

  const { error } = await resend.emails.send({
    from: 'Pulse FC <info@pulse-fc.app>',
    to: 'rick@mdssoccer.com',
    replyTo: email,
    subject: `New contact from ${name} — Pulse FC`,
    html,
    text: `From: ${name} <${email}>\n\n${message}`,
  });

  if (error) return NextResponse.json({ error: 'Failed to send' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
