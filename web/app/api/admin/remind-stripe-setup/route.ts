import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

// "Payment misconfig" Health Flag remediation — unlike orphaned staff/stale
// invites, there's nothing to delete here (the club's fees are real); the
// only fix is the club's own org_admin finishing Stripe Connect setup,
// which app_admin can't do for them. This nudges them instead.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: p } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if ((p as { role: string } | null)?.role !== 'app_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { club_id } = await req.json() as { club_id: string };
  if (!club_id) return NextResponse.json({ error: 'club_id required' }, { status: 400 });

  const { data: club } = await admin.from('clubs').select('id, name, slug').eq('id', club_id).single();
  if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

  const { data: admins } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('club_id', club_id)
    .eq('role', 'org_admin');

  if (!admins?.length) return NextResponse.json({ sent: 0 });

  const recipients: { email: string; name: string | null }[] = [];
  await Promise.all(
    (admins as { id: string; full_name: string | null }[]).map(async (prof) => {
      const { data: { user: u } } = await admin.auth.admin.getUserById(prof.id);
      if (u?.email) recipients.push({ email: u.email, name: prof.full_name });
    })
  );

  if (!recipients.length) return NextResponse.json({ sent: 0 });

  const settingsUrl = `${APP_URL}/dashboard/settings`;
  const results = await Promise.allSettled(
    recipients.map(r =>
      resend.emails.send({
        from: 'Pulse FC <support@pulse-fc.app>',
        to: r.email,
        subject: `Finish setting up payments for ${club.name}`,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111;">
<p>Hi ${r.name ?? 'there'},</p>
<p><strong>${club.name}</strong> has fees set up for families to pay, but the club's Stripe account isn't fully connected yet — so those payments can't actually be collected online.</p>
<p><a href="${settingsUrl}" style="display:inline-block;background:#22C55E;color:#000;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;">Finish payment setup</a></p>
<p style="color:#666;font-size:13px;">This takes a few minutes in your club Settings — Payments section.</p>
</div>`,
      })
    )
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  return NextResponse.json({ sent, total: recipients.length });
}
