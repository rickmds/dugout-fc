import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const today = new Date();
  const in14  = new Date(today); in14.setDate(today.getDate() + 14);
  const in60  = new Date(today); in60.setDate(today.getDate() + 60);

  // Auto-expire verified certs that have passed their expiry date
  await sb.from('staff_certifications')
    .update({ status: 'expired' })
    .eq('status', 'verified')
    .lt('expiry_date', today.toISOString().slice(0, 10));

  // Fetch certs expiring in exactly 60 or 14 days (±1 day window so daily cron catches them)
  const { data: expiring } = await sb
    .from('staff_certifications')
    .select(`
      id, cert_type, license_level, custom_label, expiry_date, status, profile_id,
      profiles!staff_certifications_profile_id_fkey(full_name, club_id),
      clubs!staff_certifications_club_id_fkey(name)
    `)
    .eq('status', 'verified')
    .gte('expiry_date', today.toISOString().slice(0, 10))
    .lte('expiry_date', in60.toISOString().slice(0, 10))
    .returns<{
      id: string; cert_type: string; license_level: string | null; custom_label: string | null;
      expiry_date: string; status: string; profile_id: string;
      profiles: { full_name: string | null; club_id: string | null } | null;
      clubs: { name: string } | null;
    }[]>();

  if (!expiring?.length) {
    return NextResponse.json({ sent: 0, expired: 0 });
  }

  const CERT_LABELS: Record<string, string> = {
    background_check: 'Background Check',
    safesport:        'SafeSport Training',
    coaching_license: 'Coaching License',
    first_aid_cpr:    'First Aid / CPR',
    custom:           'Certification',
  };

  let sent = 0;

  for (const cert of expiring) {
    const expiry = new Date(cert.expiry_date);
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);

    // Only alert at 60-day and 14-day marks (±1 day window)
    const is60 = daysLeft >= 59 && daysLeft <= 61;
    const is14 = daysLeft >= 13 && daysLeft <= 15;
    if (!is60 && !is14) continue;

    const certLabel = cert.cert_type === 'coaching_license' && cert.license_level
      ? `${cert.license_level} Coaching License`
      : cert.cert_type === 'custom' && cert.custom_label
      ? cert.custom_label
      : CERT_LABELS[cert.cert_type] ?? cert.cert_type;

    const coachName  = cert.profiles?.full_name ?? 'Coach';
    const clubName   = cert.clubs?.name ?? 'your club';
    const expiryStr  = expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const urgency    = is14 ? '🚨 Urgent' : '⚠️ Reminder';

    // Get coach email via auth admin
    const { data: { users } } = await sb.auth.admin.listUsers();
    const coachUser = users.find(u =>
      u.user_metadata?.profile_id === cert.profile_id ||
      u.id === cert.profile_id
    );
    const coachEmail = coachUser?.email;

    // Also get org admin email
    const { data: admins } = await sb
      .from('profiles')
      .select('id')
      .eq('club_id', cert.profiles?.club_id)
      .in('role', ['org_admin', 'app_admin']);

    const adminEmails: string[] = [];
    for (const admin of admins ?? []) {
      const adminUser = users.find(u => u.id === admin.id);
      if (adminUser?.email) adminEmails.push(adminUser.email);
    }

    const subject = `${urgency}: ${certLabel} expires ${is14 ? 'in 2 weeks' : 'in 60 days'} — ${coachName}`;

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <div style="font-size:28px;margin-bottom:16px">${is14 ? '🚨' : '⚠️'}</div>
        <h1 style="font-size:22px;font-weight:900;color:#0D1117;margin:0 0 8px;letter-spacing:-0.5px">
          ${certLabel} expiring ${is14 ? 'in 2 weeks' : 'in 60 days'}
        </h1>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px">
          ${coachName}'s <strong>${certLabel}</strong> for ${clubName} expires on <strong>${expiryStr}</strong>.
          ${is14 ? 'Renewal is urgent — please take action immediately.' : 'Now is a good time to start the renewal process.'}
        </p>
        <div style="background:#F8FAFC;border-radius:10px;padding:16px 20px;margin-bottom:24px;border:1px solid #E2E8F0">
          <div style="font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Details</div>
          <div style="font-size:14px;color:#0F172A"><strong>Coach:</strong> ${coachName}</div>
          <div style="font-size:14px;color:#0F172A;margin-top:4px"><strong>Certification:</strong> ${certLabel}</div>
          <div style="font-size:14px;color:#0F172A;margin-top:4px"><strong>Expires:</strong> ${expiryStr}</div>
          <div style="font-size:14px;color:${is14 ? '#EF4444' : '#F97316'};margin-top:4px;font-weight:700"><strong>Days remaining:</strong> ${daysLeft}</div>
        </div>
        <p style="font-size:13px;color:#64748B;line-height:1.6">
          Once renewed, the coach can upload their new certification in the Pulse FC mobile app under
          <strong>Settings → My Certifications</strong>. You can then verify it in the dashboard under
          <strong>Certifications</strong>.
        </p>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0">
        <p style="font-size:11px;color:#94A3B8">Pulse FC · Sent to club admin and coach · ${clubName}</p>
      </div>
    `;

    const to = [...new Set([...(coachEmail ? [coachEmail] : []), ...adminEmails])];
    if (!to.length) continue;

    const { error } = await resend.emails.send({
      from: 'Pulse FC <support@pulse-fc.app>',
      to,
      subject,
      html,
    });

    if (!error) sent++;
  }

  return NextResponse.json({ sent, checked: expiring.length });
}
