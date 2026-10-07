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

type FormQuestion = { id: string; label: string; fieldKey?: string };
type FormConfigJson = {
  questions?: FormQuestion[]; seasonLabel?: string;
  locationText?: string; sessionScheduleText?: string;
  importantInfoText?: string; offerTimelineText?: string; contactText?: string;
};

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

  // "When" prefers the specific date/session the family actually picked
  // (the "which tryout date" custom question, if the club uses one) over
  // the club's general schedule blurb — more specific beats more generic.
  const responses = (player.custom_responses ?? {}) as Record<string, unknown>;
  const tryoutDateQ = (config?.questions ?? []).find(q => q.fieldKey === 'tryout_date');
  const pickedDate = tryoutDateQ ? responses[tryoutDateQ.id] : undefined;
  const whenValue = (typeof pickedDate === 'string' && pickedDate.trim()) ? pickedDate : (config?.sessionScheduleText ?? '');

  const details: { icon: string; label: string; value: string }[] = [];
  if (whenValue) details.push({ icon: '📅', label: 'When', value: whenValue });
  if (config?.locationText) details.push({ icon: '📍', label: 'Where', value: config.locationText });
  if (config?.importantInfoText) details.push({ icon: '🎒', label: 'What to bring', value: config.importantInfoText });
  if (config?.offerTimelineText) details.push({ icon: '📬', label: "What's next", value: config.offerTimelineText });
  if (config?.contactText) details.push({ icon: '📞', label: 'Questions?', value: config.contactText });

  const detailsHtml = details.length ? details.map(d => `
    <tr>
      <td style="padding:14px 18px;border-bottom:1px solid #F1F5F9;width:34px;vertical-align:top;font-size:17px;">${d.icon}</td>
      <td style="padding:14px 18px 14px 0;border-bottom:1px solid #F1F5F9;">
        <div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">${esc(d.label)}</div>
        <div style="font-size:14px;color:#0F172A;font-weight:600;line-height:1.55;white-space:pre-line;">${esc(d.value)}</div>
      </td>
    </tr>`).join('') : `
    <tr><td style="padding:16px 18px;" colspan="2">
      <div style="font-size:14px;color:#64748B;">We'll follow up soon with the session date, time, and everything else you need to know.</div>
    </td></tr>`;

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
          <div style="padding:28px 32px 8px;">
            <div style="font-size:18px;font-weight:800;color:#0F172A;letter-spacing:-0.01em;margin-bottom:6px;">You're registered! ⚽</div>
            <p style="margin:0;font-size:14.5px;color:#334155;line-height:1.6;">
              We've got ${esc(player.first_name)}'s tryout registration for ${esc(clubName)}. Here's what to know before the big day:
            </p>
          </div>
          <div style="padding:16px 14px 6px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F1F5F9;border-radius:10px;overflow:hidden;">
              ${detailsHtml}
            </table>
          </div>
          <div style="padding:20px 32px 30px;">
            <p style="margin:0;font-size:13px;color:#64748B;line-height:1.65;">
              Questions, or need to update anything? Just reply to this email.
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
