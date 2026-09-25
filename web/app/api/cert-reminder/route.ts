import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { resolveAccent, esc } from '@/lib/emailHelpers';
import { sendExpoPush } from '@/lib/expoPush';
import { resolveProfileEmails } from '@/lib/resolveProfileEmails';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const resend = new Resend(process.env.RESEND_API_KEY);

const CERT_LABELS: Record<string, string> = {
  background_check: 'Background Check',
  safesport: 'SafeSport',
  coaching_license: 'Coaching License',
  first_aid_cpr: 'First Aid / CPR',
  custom: 'Other',
};

// Nudges one coach about one of their own certifications — pending review
// too long, or expiring/expired. Certifications had no reminder path at
// all before this; a coach who forgot to submit or renew just sat there
// until an admin happened to notice on this page.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: callerProfile } = await admin.from('profiles').select('role, club_id').eq('id', user.id).single();
  const caller = callerProfile as { role: string; club_id: string | null } | null;

  const { cert_id } = await req.json() as { cert_id: string };
  if (!cert_id) return NextResponse.json({ error: 'cert_id required' }, { status: 400 });

  const { data: cert } = await admin
    .from('staff_certifications')
    .select('id, profile_id, club_id, cert_type, custom_label, status, expiry_date')
    .eq('id', cert_id)
    .single();
  if (!cert) return NextResponse.json({ error: 'Certification not found' }, { status: 404 });

  if (!caller || caller.role !== 'app_admin' && !(caller.role === 'org_admin' && caller.club_id === cert.club_id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: club } = await admin.from('clubs').select('name, primary_color').eq('id', cert.club_id).single();
  const clubName = club?.name ?? 'Your club';
  const certLabel = cert.cert_type === 'custom' ? (cert.custom_label ?? 'Other') : (CERT_LABELS[cert.cert_type] ?? cert.cert_type);

  const isExpired = cert.status === 'expired';
  const heading = cert.status === 'pending'
    ? `⏳ ${certLabel} is still waiting on your upload`
    : isExpired
      ? `⚠️ Your ${certLabel} has expired`
      : `⚠️ Your ${certLabel} is expiring soon`;
  const body = cert.status === 'pending'
    ? `${clubName} is still waiting on your ${certLabel} document. Submit it from Settings → My Certifications in the app.`
    : `Your ${certLabel}${cert.expiry_date ? ` (expires ${new Date(cert.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''} needs to be renewed. Update it from Settings → My Certifications in the app.`;

  await admin.from('notifications').insert({
    profile_id: cert.profile_id, type: 'cert_reminder', title: heading, body, data: { type: 'cert_reminder', cert_id: cert.id },
  });

  const { data: tokens } = await admin.from('push_tokens').select('token').eq('profile_id', cert.profile_id);
  if (tokens?.length) {
    await sendExpoPush(tokens.map(t => ({ to: t.token, title: heading, body, sound: 'default', data: { type: 'cert_reminder', cert_id: cert.id } })));
  }

  const emailMap = await resolveProfileEmails(admin, [cert.profile_id]);
  const to = emailMap.get(cert.profile_id);
  if (to) {
    try {
      await resend.emails.send({
        from: `${clubName} <support@pulse-fc.app>`, to, subject: heading,
        html: `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:32px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;background:#111111;border:1px solid #222222;border-radius:16px;overflow:hidden;">
  <div style="height:3px;background:${resolveAccent(club?.primary_color)};"></div>
  <div style="padding:28px;">
    <h1 style="margin:0 0 12px;font-size:19px;font-weight:800;color:#f9fafb;">${esc(heading)}</h1>
    <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.7;">${esc(body)}</p>
  </div>
</div>
</body></html>`,
      });
    } catch (e) {
      console.error('cert-reminder: email failed', e);
    }
  }

  return NextResponse.json({ success: true });
}
