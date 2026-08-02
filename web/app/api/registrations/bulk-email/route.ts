import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(req: NextRequest) {
  const { submission_ids, subject, body, from_name } = await req.json() as {
    submission_ids: string[];
    subject: string;
    body: string;
    from_name?: string;
  };

  if (!submission_ids?.length || !subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'submission_ids, subject, and body are required' }, { status: 400 });
  }

  const { data: subs, error: subsErr } = await supabase
    .from('registration_submissions')
    .select('id, data, form_id')
    .in('id', submission_ids);

  if (subsErr || !subs?.length) {
    return NextResponse.json({ error: 'No submissions found' }, { status: 404 });
  }

  const fromName = from_name?.trim() || 'Pulse FC';
  const sent: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const sub of subs) {
    const data = (sub.data ?? {}) as Record<string, string>;
    const email = findEmail(data);
    if (!email) { failed.push({ id: sub.id, reason: 'No email address in submission data' }); continue; }

    const personalised = personalise(body, data);
    const subjectPersonalised = personalise(subject, data);

    const { error } = await resend.emails.send({
      from:    `${fromName} <noreply@pulse-fc.app>`,
      to:      email,
      subject: subjectPersonalised,
      html:    `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">${personalised.replace(/\n/g, '<br>')}</div>`,
    });

    if (error) { failed.push({ id: sub.id, reason: error.message ?? 'Send failed' }); }
    else        { sent.push(sub.id); }
  }

  return NextResponse.json({ sent: sent.length, failed });
}

function findEmail(data: Record<string, string>): string | null {
  for (const v of Object.values(data)) {
    if (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v;
  }
  return null;
}

function personalise(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => data[key] ?? '');
}
