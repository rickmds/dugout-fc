import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: p } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if ((p as { role: string } | null)?.role !== 'app_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { subject, html } = await req.json() as { subject: string; html: string };
  if (!subject?.trim() || !html?.trim()) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  }

  // Get all org_admin profile IDs
  const { data: orgAdmins } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'org_admin');

  if (!orgAdmins?.length) return NextResponse.json({ sent: 0 });

  // Resolve emails via auth admin API
  const recipients: { email: string; name: string | null }[] = [];
  await Promise.all(
    (orgAdmins as { id: string; full_name: string | null }[]).map(async (prof) => {
      const { data: { user: u } } = await admin.auth.admin.getUserById(prof.id);
      if (u?.email) recipients.push({ email: u.email, name: prof.full_name });
    })
  );

  if (!recipients.length) return NextResponse.json({ sent: 0 });

  // Send individually so each email is personalised
  const results = await Promise.allSettled(
    recipients.map(r =>
      resend.emails.send({
        from: 'Rick at Pulse FC <info@pulse-fc.app>',
        to: r.email,
        subject,
        html: html.replace(/{{name}}/g, r.name ?? 'there'),
      })
    )
  );

  const sent      = results.filter(r => r.status === 'fulfilled').length;
  const failed    = results.filter(r => r.status === 'rejected').length;

  return NextResponse.json({ sent, failed, total: recipients.length });
}
