import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const resend = new Resend(process.env.RESEND_API_KEY);

// Same darken helper as the registration page itself (web/app/t/[clubSlug]/TryoutRegistrationForm.tsx)
function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type FormQuestion = { id: string; label: string };
type FormConfigJson = { questions?: FormQuestion[]; seasonLabel?: string; locationText?: string };

// Triggered by the public registration form right after a successful
// submit (no auth — same "anonymous public POST" shape as /api/contact).
// Re-fetches the just-inserted row server-side rather than trusting
// whatever the client would otherwise have to resend, so the email body
// always reflects what's actually in the database.
export async function POST(req: NextRequest) {
  const { player_id, club_id } = await req.json();
  if (!player_id || !club_id) {
    return NextResponse.json({ error: 'player_id and club_id required' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const [{ data: player }, { data: club }, { data: fc }] = await Promise.all([
    sb.from('tryout_players').select('*').eq('id', player_id).eq('club_id', club_id).single(),
    sb.from('clubs').select('name, logo_url, primary_color').eq('id', club_id).single(),
    sb.from('tryout_form_config').select('config_json').eq('club_id', club_id).single(),
  ]);

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

  const recipients = [player.email_primary, player.email_secondary].filter((e): e is string => !!e?.trim());
  if (!recipients.length) return NextResponse.json({ ok: true, skipped: 'no email on file' });

  const clubName = club?.name ?? 'the club';
  const clubColor = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const config = (fc?.config_json ?? null) as FormConfigJson | null;

  const rows: { label: string; value: string }[] = [];
  rows.push({ label: 'Player', value: `${player.first_name} ${player.last_name}` });
  if (player.date_of_birth) {
    rows.push({ label: 'Date of birth', value: new Date(`${player.date_of_birth}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) });
  }
  if (player.grade) rows.push({ label: 'Grade', value: player.grade });
  if (player.gender) rows.push({ label: 'Gender', value: player.gender });
  if (player.positions?.length) rows.push({ label: 'Preferred position(s)', value: player.positions.join(', ') });
  rows.push({ label: 'Parent / Guardian', value: player.parent_name ?? '' });
  if (player.email_primary) rows.push({ label: 'Email', value: player.email_primary });
  if (player.email_secondary) rows.push({ label: 'Additional email', value: player.email_secondary });
  if (player.phone) rows.push({ label: 'Phone', value: player.phone });
  if (player.town) rows.push({ label: 'Town / City', value: player.town });
  if (player.current_team) rows.push({ label: 'Current team', value: player.current_team });
  if (player.referral_source) rows.push({ label: 'How they heard about us', value: player.referral_source });

  // Custom questions, in the club's own question order, labeled with
  // each question's current text (same "label is live, not frozen at
  // submission time" behavior as the Google-Forms-style export).
  const responses = (player.custom_responses ?? {}) as Record<string, unknown>;
  for (const q of config?.questions ?? []) {
    const val = responses[q.id];
    if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) continue;
    rows.push({ label: q.label, value: Array.isArray(val) ? val.join(', ') : String(val) });
  }

  const rowsHtml = rows.map(r => `
    <tr>
      <td style="padding:11px 18px;border-bottom:1px solid #F1F5F9;font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.04em;width:38%;vertical-align:top;">${esc(r.label)}</td>
      <td style="padding:11px 18px;border-bottom:1px solid #F1F5F9;font-size:14px;color:#0F172A;font-weight:600;">${esc(r.value)}</td>
    </tr>`).join('');

  const seasonSuffix = config?.seasonLabel ? ` ${esc(config.seasonLabel)}` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Registration confirmed</title></head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;">
    <tr><td align="center" style="padding:40px 20px 56px;">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

        <tr><td style="background:linear-gradient(135deg, ${clubColor}, ${shade(clubColor, -22)});border-radius:18px 18px 0 0;padding:32px 32px 28px;">
          ${club?.logo_url ? `<img src="${club.logo_url}" alt="${esc(clubName)}" width="48" height="48" style="display:block;margin-bottom:14px;border-radius:10px;background:#fff;padding:6px;" />` : ''}
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.8);margin-bottom:6px;">Registration confirmed</div>
          <div style="font-size:21px;font-weight:800;color:#fff;letter-spacing:-0.01em;">${esc(clubName)}${seasonSuffix} Tryouts</div>
        </td></tr>

        <tr><td style="background:#fff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 18px 18px;overflow:hidden;">
          <div style="padding:26px 32px 6px;">
            <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">
              Thanks — we've got ${esc(player.first_name)}'s registration. Here's what was submitted:
            </p>
          </div>
          <div style="padding:16px 14px 6px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F1F5F9;border-radius:10px;overflow:hidden;">
              ${rowsHtml}
            </table>
          </div>
          <div style="padding:20px 32px 30px;">
            <p style="margin:0;font-size:13px;color:#64748B;line-height:1.65;">
              ${config?.locationText ? `${esc(config.locationText)}<br/><br/>` : ''}If anything above needs correcting, just reply to this email.
            </p>
          </div>
        </td></tr>

        <tr><td style="padding:18px 8px;text-align:center;">
          <p style="margin:0;font-size:11.5px;color:#94A3B8;">Sent via <a href="https://pulse-fc.app" style="color:#94A3B8;">pulse-fc.app</a> on behalf of ${esc(clubName)}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: `${clubName} via Pulse FC <support@pulse-fc.app>`,
      to: recipients,
      subject: `You're registered — ${clubName}${seasonSuffix} Tryouts`,
      html,
    });
  } catch (e) {
    console.error('confirm-registration: resend failed', e);
    return NextResponse.json({ error: 'Could not send confirmation email' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
