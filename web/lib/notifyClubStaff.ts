import { supabaseAdmin } from '@/lib/supabase';
import { Resend } from 'resend';
import { resolveAccent, esc } from '@/lib/emailHelpers';
import { sendExpoPush } from '@/lib/expoPush';
import { resolveProfileEmails } from '@/lib/resolveProfileEmails';

const resend = new Resend(process.env.RESEND_API_KEY);

function alertHtml(opts: { accent: string; heading: string; body: string }): string {
  return `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:32px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;background:#111111;border:1px solid #222222;border-radius:16px;overflow:hidden;">
  <div style="height:3px;background:${opts.accent};"></div>
  <div style="padding:28px;">
    <h1 style="margin:0 0 12px;font-size:19px;font-weight:800;color:#f9fafb;">${esc(opts.heading)}</h1>
    <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.7;">${esc(opts.body)}</p>
  </div>
</div>
</body></html>`;
}

// General-purpose "alert every admin at this club" helper — push + in-app +
// email, same three-channel shape already proven for refund/dispute alerts
// (web/lib/installmentRefunds.ts's notifyStaff). Pulled out standalone
// rather than importing that one, since it's shaped around a
// MatchedInstallment and this needs to fire from places (a failed on-session
// charge, a failed cron auto-charge) that already have their own club row in
// hand.
export async function notifyClubStaff(
  supabase: ReturnType<typeof supabaseAdmin>,
  club: { id: string; name?: string | null; primary_color?: string | null } | null | undefined,
  opts: { type: string; title: string; body: string; emailSubject: string; emailBody: string },
) {
  if (!club?.id) return;

  const { data: admins } = await supabase.from('profiles').select('id').eq('club_id', club.id).in('role', ['org_admin', 'app_admin']);
  const staffIds = (admins ?? []).map(a => a.id as string);
  if (!staffIds.length) return;

  await supabase.from('notifications').insert(staffIds.map(profile_id => ({
    profile_id, type: opts.type, title: opts.title, body: opts.body, data: { type: opts.type },
  })));

  const { data: tokens } = await supabase.from('push_tokens').select('token').in('profile_id', staffIds);
  if (tokens?.length) {
    await sendExpoPush(tokens.map(t => ({ to: t.token, title: opts.title, body: opts.body, sound: 'default', data: { type: opts.type } })));
  }

  const emailMap = await resolveProfileEmails(supabase, staffIds);
  const to = [...emailMap.values()];
  if (!to.length) return;
  try {
    await resend.emails.send({
      from: 'Pulse FC <support@pulse-fc.app>', to,
      subject: opts.emailSubject,
      html: alertHtml({ accent: resolveAccent(club.primary_color), heading: opts.title, body: opts.emailBody }),
    });
  } catch (e) {
    console.error('notifyClubStaff: staff alert email failed', e);
  }
}
