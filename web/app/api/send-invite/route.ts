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

  const { data: invite, error: invErr } = await supabase
    .from('invites')
    .select('email, token, teams(name, age_group, clubs(name, logo_url, primary_color))')
    .eq('id', invite_id)
    .single();

  if (invErr || !invite) {
    console.error('invite lookup failed', invErr);
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  const team       = (invite as any).teams;
  const club       = team?.clubs;
  const teamName   = team?.name      ?? 'your team';
  const ageGroup   = team?.age_group ?? null;
  const clubName   = club?.name      ?? 'Your Club';
  const logoUrl    = club?.logo_url  ?? null;
  const rawColor   = club?.primary_color ?? null;
  const accent     = resolveAccent(rawColor);
  const btnText    = contrastText(accent);
  const year       = new Date().getFullYear();
  const initials   = clubName.split(' ').slice(0, 2).map((w: string) => (w[0] ?? '').toUpperCase()).join('');
  const joinUrl    = `https://pulse-fc.app/join?token=${invite.token}`;
  const appStoreUrl = 'https://apps.apple.com/app/pulse-fc/id6740793498';

  // ── Logo block ──────────────────────────────────────────────────────────────
  const logoBlock = logoUrl
    ? `<img src="${esc(logoUrl)}" width="56" height="56" alt="${esc(clubName)}"
         style="display:inline-block;border-radius:14px;border:2px solid rgba(255,255,255,0.06);" />`
    : `<div style="display:inline-block;width:56px;height:56px;line-height:56px;text-align:center;
                   border-radius:14px;background:${accent};vertical-align:middle;">
         <span style="font-size:20px;font-weight:900;color:${btnText};">${esc(initials)}</span>
       </div>`;

  // ── Team detail pill ────────────────────────────────────────────────────────
  const teamDetail = ageGroup
    ? `${esc(teamName)} &nbsp;·&nbsp; ${esc(ageGroup)}`
    : esc(teamName);

  // ── Body paragraphs ─────────────────────────────────────────────────────────
  const playerLine = player_name
    ? `<strong style="color:#f9fafb;">${esc(player_name)}</strong> has been added to the <strong style="color:#f9fafb;">${esc(teamName)}</strong> squad at ${esc(clubName)}.`
    : `You have been added to <strong style="color:#f9fafb;">${esc(teamName)}</strong> at ${esc(clubName)}.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(player_name ? `${player_name} has been added to ${teamName}` : `You've been invited to join ${teamName}`)} · ${esc(clubName)}</title>
</head>
<body style="margin:0;padding:0;background:#080808;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;">
    <tr>
      <td align="center" style="padding:40px 16px 64px;">
        <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

          <!-- Club identity header -->
          <tr>
            <td style="text-align:center;padding-bottom:24px;">
              ${logoBlock}
              <p style="margin:10px 0 0;font-size:13px;font-weight:700;color:#9ca3af;
                         letter-spacing:0.05em;text-transform:uppercase;">${esc(clubName)}</p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #1f1f1f;border-radius:20px;
                       overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,0.6);">

              <!-- Accent bar -->
              <div style="height:4px;background:${accent};"></div>

              <!-- Heading section -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:32px 32px 24px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;
                               text-transform:uppercase;letter-spacing:0.12em;">Welcome to the squad</p>
                    <h1 style="margin:0 0 0;font-size:26px;font-weight:800;color:#f9fafb;
                                line-height:1.2;letter-spacing:-0.5px;">
                      ${player_name ? `${esc(player_name)} is on ${esc(teamName)}` : `You're on ${esc(teamName)}`}
                    </h1>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:0 32px;">
                    <div style="height:1px;background:#1e1e1e;"></div>
                  </td>
                </tr>

                <!-- Body copy -->
                <tr>
                  <td style="padding:24px 32px 20px;">
                    <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.75;">
                      ${playerLine}
                    </p>
                    <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.75;">
                      ${esc(clubName)} manages the season schedule, game day RSVPs, and team
                      communications all in one place. Create your free account below — it takes
                      under two minutes.
                    </p>
                  </td>
                </tr>

                <!-- Team detail pill -->
                <tr>
                  <td style="padding:0 32px 24px;">
                    <div style="display:inline-block;background:#1a1a1a;border:1px solid #2a2a2a;
                                border-radius:10px;padding:10px 16px;">
                      <span style="font-size:11px;font-weight:700;color:#6b7280;
                                   text-transform:uppercase;letter-spacing:0.1em;">Team &nbsp;</span>
                      <span style="font-size:13px;font-weight:700;color:#e5e7eb;">${teamDetail}</span>
                    </div>
                  </td>
                </tr>

                <!-- Primary CTA -->
                <tr>
                  <td style="padding:0 32px 16px;text-align:center;">
                    <a href="${esc(joinUrl)}"
                       style="display:inline-block;background:${accent};color:${btnText};
                              text-decoration:none;font-size:16px;font-weight:800;
                              padding:16px 48px;border-radius:12px;letter-spacing:-0.1px;line-height:1;">
                      Set up your account &rarr;
                    </a>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:4px 32px 20px;">
                    <div style="height:1px;background:#1a1a1a;"></div>
                  </td>
                </tr>

                <!-- Already have the app? -->
                <tr>
                  <td style="padding:0 32px 28px;text-align:center;">
                    <p style="margin:0 0 12px;font-size:12px;color:#6b7280;
                               text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Already have the app?</p>
                    <a href="${esc(appStoreUrl)}"
                       style="display:inline-block;background:#1a1a1a;color:#d1d5db;
                              border:1px solid #2a2a2a;text-decoration:none;
                              font-size:14px;font-weight:700;padding:12px 28px;
                              border-radius:10px;line-height:1;">
                      Download on the App Store
                    </a>
                    <p style="margin:12px 0 0;font-size:12px;color:#4b5563;line-height:1.6;">
                      Or open the app and enter code &nbsp;
                      <strong style="color:#9ca3af;font-family:'Courier New',Courier,monospace;
                                     letter-spacing:1.5px;">${esc(invite.token)}</strong>
                    </p>
                  </td>
                </tr>

              </table>

              <!-- Footer -->
              <div style="border-top:1px solid #181818;padding:16px 32px;background:#0d0d0d;">
                <p style="margin:0;font-size:12px;color:#374151;line-height:1.7;">
                  ${esc(clubName)} uses
                  <a href="https://pulse-fc.app" style="color:${accent};text-decoration:none;font-weight:600;">Pulse FC</a>
                  for club management.
                  &nbsp;&middot;&nbsp;
                  If you weren't expecting this email, you can safely ignore it.
                  &nbsp;&middot;&nbsp;
                  &copy; ${year} ${esc(clubName)}
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

  const subject = player_name
    ? `${player_name} has been added to ${teamName} · ${clubName}`
    : `You've been invited to join ${teamName} · ${clubName}`;

  const { error } = await resend.emails.send({
    from: `${clubName} <info@pulse-fc.app>`,
    to:   invite.email,
    subject,
    html,
  });

  if (error) {
    console.error('Resend error:', error);
    return NextResponse.json({ error: 'Failed to send email', detail: error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveAccent(hex: string | null | undefined): string {
  if (!hex) return '#22c55e';
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#22c55e';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#22c55e';
  if ((r < 10 && g < 10 && b < 10) || (r > 245 && g > 245 && b > 245)) return '#22c55e';
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
