import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { invite_id, player_name } = await req.json();

  if (!invite_id) {
    return NextResponse.json({ error: 'invite_id required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // Fetch invite + team + club in one query
  const { data: invite, error: invErr } = await supabase
    .from('invites')
    .select('email, token, teams(name, clubs(name, logo_url, primary_color))')
    .eq('id', invite_id)
    .single();

  if (invErr || !invite) {
    console.error('invite lookup failed', invErr);
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  const team      = (invite as any).teams;
  const club      = team?.clubs;
  const teamName  = team?.name  ?? 'your team';
  const clubName  = club?.name  ?? 'Your club';
  const logoUrl   = club?.logo_url  ?? null;
  const rawColor  = club?.primary_color ?? null;
  const accent    = resolveAccent(rawColor);
  const btnText   = contrastText(accent);
  const year      = new Date().getFullYear();
  const initials  = clubName.split(' ').slice(0, 2).map((w: string) => (w[0] ?? '').toUpperCase()).join('');
  const deepLink  = `https://pulse-fc.app/join?token=${invite.token}`;
  const appStoreUrl = 'https://apps.apple.com/app/pulse-fc';

  const logoHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" width="60" height="60" alt="${esc(clubName)}"
         style="display:inline-block;border-radius:14px;" />`
    : `<div style="display:inline-block;width:60px;height:60px;line-height:60px;text-align:center;
                   border-radius:14px;background:${accent};vertical-align:middle;">
         <span style="font-size:22px;font-weight:900;color:${btnText};">${esc(initials)}</span>
       </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>You've been invited to join ${esc(teamName)}</title>
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
                         letter-spacing:-0.3px;">${esc(clubName)}</p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #222222;border-radius:20px;
                       overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);">

              <!-- Accent bar -->
              <div style="height:3px;background:${accent};"></div>

              <!-- Headline -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:32px 28px 20px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6b7280;
                               text-transform:uppercase;letter-spacing:1.5px;">You're invited</p>
                    <h1 style="margin:0;font-size:24px;font-weight:800;color:#f9fafb;line-height:1.25;
                                letter-spacing:-0.5px;">
                      Join ${esc(teamName)}<br>on Pulse FC
                    </h1>
                  </td>
                </tr>

                <!-- Divider -->
                <tr><td style="padding:0 28px;"><div style="height:1px;background:#1e1e1e;"></div></td></tr>

                <!-- Body -->
                <tr>
                  <td style="padding:24px 28px 20px;">
                    <p style="margin:0 0 14px;font-size:15px;color:#d1d5db;line-height:1.7;">
                      ${player_name
                        ? `<strong style="color:#f9fafb;">${esc(player_name)}</strong> has been added to the ${esc(teamName)} roster at <strong style="color:${accent};">${esc(clubName)}</strong>.`
                        : `You've been added to <strong style="color:${accent};">${esc(clubName)}</strong>.`}
                    </p>
                    <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.7;">
                      Download the <strong style="color:#f9fafb;">Pulse FC</strong> app to view the team schedule,
                      RSVP to games and training sessions, and stay connected with the coaching staff.
                    </p>
                  </td>
                </tr>

                <!-- Team info card -->
                <tr>
                  <td style="padding:0 28px 20px;">
                    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:14px 18px;">
                      <table cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td style="width:28px;vertical-align:top;font-size:18px;line-height:1.4;">🏟️</td>
                          <td style="vertical-align:top;padding-left:10px;">
                            <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;
                                       text-transform:uppercase;letter-spacing:1.2px;">Team</p>
                            <p style="margin:0;font-size:14px;color:#d1d5db;font-weight:600;">${esc(teamName)}</p>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                <!-- CTA buttons -->
                <tr>
                  <td style="padding:4px 28px 24px;text-align:center;">
                    <a href="${esc(appStoreUrl)}"
                       style="display:inline-block;background:${accent};color:${btnText};
                              text-decoration:none;font-size:16px;font-weight:800;
                              padding:16px 40px;border-radius:12px;letter-spacing:0.2px;line-height:1;margin-bottom:12px;">
                      📱 Download Pulse FC
                    </a>
                    <p style="margin:0;font-size:13px;color:#6b7280;">
                      Already have the app?
                      <a href="${esc(deepLink)}" style="color:${accent};text-decoration:underline;">
                        Tap here to join your team
                      </a>
                    </p>
                  </td>
                </tr>

                <!-- Invite code + footer -->
                <tr>
                  <td style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
                    <p style="margin:0 0 6px;font-size:12px;color:#4b5563;line-height:1.6;">
                      Your invite code:
                      <strong style="color:#9ca3af;font-family:'Courier New',monospace;">${esc(invite.token)}</strong>
                    </p>
                    <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
                      ${esc(clubName)} uses
                      <a href="https://pulse-fc.app" style="color:${accent};text-decoration:none;font-weight:600;">Pulse FC</a>
                      for club management.
                      &nbsp;&middot;&nbsp;
                      If you weren't expecting this, you can safely ignore it.
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

  const { error } = await resend.emails.send({
    from: `${clubName} <info@pulse-fc.app>`,
    to: invite.email,
    subject: `You've been invited to join ${teamName} — ${clubName}`,
    html,
  });

  if (error) {
    console.error('Resend error:', error);
    return NextResponse.json({ error: 'Failed to send email', detail: error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

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
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return lum > 145 ? '#000000' : '#ffffff';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
