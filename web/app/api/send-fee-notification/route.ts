import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { player_fee_id } = await req.json();
  if (!player_fee_id) return NextResponse.json({ error: 'player_fee_id required' }, { status: 400 });

  const supabase = supabaseAdmin();

  // Fetch fee + player + team + club in one query
  const { data: fee, error: feeErr } = await supabase
    .from('player_fees')
    .select('id, description, amount_due, discount, due_date, player_id, players(full_name), teams(name, club_id, clubs(name, logo_url, primary_color))')
    .eq('id', player_fee_id)
    .single();

  if (feeErr || !fee) {
    console.error('fee lookup failed', feeErr);
    return NextResponse.json({ error: 'Fee not found' }, { status: 404 });
  }

  // Find parent email from invites table
  const { data: invite } = await supabase
    .from('invites')
    .select('email')
    .eq('player_id', fee.player_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!invite?.email) {
    // No parent email on record — silently skip, not an error
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_parent_email' });
  }

  const player   = (fee as any).players;
  const team     = (fee as any).teams;
  const club     = team?.clubs;
  const clubName = club?.name  ?? 'Your club';
  const teamName = team?.name  ?? 'your team';
  const playerName = player?.full_name ?? 'Your child';
  const accent   = resolveAccent(club?.primary_color);
  const btnText  = contrastText(accent);
  const logoUrl  = club?.logo_url ?? null;
  const initials = clubName.split(' ').slice(0, 2).map((w: string) => (w[0] ?? '').toUpperCase()).join('');
  const year     = new Date().getFullYear();

  const netAmount = Math.max(0, (fee.amount_due ?? 0) - (fee.discount ?? 0));
  const fmtAmount = `$${netAmount.toFixed(2)}`;
  const fmtDue    = fee.due_date
    ? new Date(fee.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const isOverdue = fee.due_date ? new Date(fee.due_date) < new Date() : false;
  const urgencyColor = isOverdue ? '#EF4444' : fee.due_date ? '#F59E0B' : accent;

  const logoHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" width="56" height="56" alt="${esc(clubName)}" style="display:inline-block;border-radius:12px;" />`
    : `<div style="display:inline-block;width:56px;height:56px;line-height:56px;text-align:center;border-radius:12px;background:${accent};vertical-align:middle;">
         <span style="font-size:20px;font-weight:900;color:${btnText};">${esc(initials)}</span>
       </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Fee notice from ${esc(clubName)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 20px 64px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo + Club -->
          <tr>
            <td style="text-align:center;padding-bottom:28px;">
              ${logoHtml}
              <p style="margin:10px 0 0;font-size:17px;font-weight:800;color:#f9fafb;letter-spacing:-0.3px;">${esc(clubName)}</p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #222222;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
              <div style="height:3px;background:${accent};"></div>

              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Headline -->
                <tr>
                  <td style="padding:32px 28px 20px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;">Fee Notice</p>
                    <h1 style="margin:0;font-size:22px;font-weight:800;color:#f9fafb;line-height:1.3;letter-spacing:-0.4px;">
                      A fee has been assigned to ${esc(playerName)}
                    </h1>
                  </td>
                </tr>

                <tr><td style="padding:0 28px;"><div style="height:1px;background:#1e1e1e;"></div></td></tr>

                <!-- Fee details card -->
                <tr>
                  <td style="padding:24px 28px 20px;">
                    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;overflow:hidden;">
                      <div style="height:2px;background:${urgencyColor};"></div>
                      <table cellpadding="0" cellspacing="0" width="100%" style="padding:18px 20px;">
                        <tr>
                          <td>
                            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Description</p>
                            <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#f9fafb;">${esc(fee.description)}</p>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <table cellpadding="0" cellspacing="0" width="100%">
                              <tr>
                                <td style="width:50%;vertical-align:top;">
                                  <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Amount due</p>
                                  <p style="margin:0;font-size:24px;font-weight:900;color:${urgencyColor};letter-spacing:-0.5px;">${esc(fmtAmount)}</p>
                                </td>
                                ${fmtDue ? `<td style="width:50%;vertical-align:top;text-align:right;">
                                  <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Due date</p>
                                  <p style="margin:0;font-size:15px;font-weight:600;color:${isOverdue ? '#EF4444' : '#d1d5db'};">${esc(fmtDue)}${isOverdue ? ' · OVERDUE' : ''}</p>
                                </td>` : ''}
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-top:14px;">
                            <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.2px;">Team</p>
                            <p style="margin:0;font-size:14px;color:#9ca3af;">${esc(teamName)}</p>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                <!-- Body text -->
                <tr>
                  <td style="padding:0 28px 24px;">
                    <p style="margin:0;font-size:14px;color:#9ca3af;line-height:1.7;">
                      Please contact your coach or club administrator to arrange payment. Questions? Simply reply to this email.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="border-top:1px solid #1a1a1a;padding:18px 28px;background:#0d0d0d;">
                    <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
                      ${esc(clubName)} uses
                      <a href="https://dugoutfc.app" style="color:${accent};text-decoration:none;font-weight:600;">Dugout FC</a>
                      for club management. &nbsp;&middot;&nbsp; &copy; ${year} ${esc(clubName)}
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
    from: `${clubName} <noreply@dugoutfc.app>`,
    to: invite.email,
    subject: `Fee notice: ${fee.description} — ${fmtAmount}${fmtDue ? ` due ${fmtDue}` : ''}`,
    html,
  });

  if (error) {
    console.error('Resend error:', error);
    return NextResponse.json({ error: 'Failed to send email', detail: error }, { status: 502 });
  }

  // Push notification to parent
  try {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const parentUser = users.find((u) => u.email?.toLowerCase() === invite.email.toLowerCase());
    if (parentUser) {
      await supabase.from('notifications').insert({
        profile_id: parentUser.id,
        type: 'fee_assigned',
        title: '💳 New fee assigned',
        body: `${fee.description} · ${fmtAmount}${fmtDue ? ` — due ${fmtDue}` : ''}`,
        data: { player_fee_id, type: 'fee_assigned' },
      });
      const { data: tokens } = await supabase.from('push_tokens').select('token').eq('profile_id', parentUser.id);
      if (tokens?.length) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(tokens.map((t: any) => ({
            to: t.token,
            title: '💳 New fee assigned',
            body: `${fee.description} · ${fmtAmount}${fmtDue ? ` — due ${fmtDue}` : ''}`,
            sound: 'default',
            data: { type: 'fee_assigned', player_fee_id },
          }))),
        });
      }
    }
  } catch (e) {
    console.error('Push error:', e);
  }

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
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return lum > 145 ? '#000000' : '#ffffff';
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
