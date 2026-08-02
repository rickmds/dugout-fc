import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(req: NextRequest) {
  const { submission_id } = await req.json() as { submission_id: string };

  if (!submission_id) {
    return NextResponse.json({ error: 'submission_id is required' }, { status: 400 });
  }

  const { data: sub, error: subErr } = await supabase
    .from('registration_submissions')
    .select('id, data, status, form_id, registration_forms(title, club_id, clubs(name, slug))')
    .eq('id', submission_id)
    .single();

  if (subErr || !sub) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  if (sub.status !== 'waitlisted') {
    return NextResponse.json({ error: 'Submission is not currently on the waitlist' }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from('registration_submissions')
    .update({ status: 'approved', waitlist_position: null })
    .eq('id', submission_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Resequence remaining waitlist positions
  const { data: remaining } = await supabase
    .from('registration_submissions')
    .select('id, waitlist_position')
    .eq('form_id', sub.form_id)
    .eq('status', 'waitlisted')
    .order('waitlist_position', { ascending: true });

  if (remaining?.length) {
    for (let i = 0; i < remaining.length; i++) {
      await supabase
        .from('registration_submissions')
        .update({ waitlist_position: i + 1 })
        .eq('id', remaining[i].id);
    }
  }

  // Send promotion email
  const form  = (sub as unknown as { registration_forms: { title: string; clubs: { name: string; slug: string } } }).registration_forms;
  const club  = form.clubs;
  const data  = (sub.data ?? {}) as Record<string, string>;
  const email = findEmail(data);

  if (email) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pulse-fc.app';
    const link    = `${baseUrl}/register/${club.slug}?form=${sub.form_id}`;

    await resend.emails.send({
      from:    `${club.name} <noreply@pulse-fc.app>`,
      to:      email,
      subject: `Great news — a spot has opened up for ${form.title}`,
      html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 16px;color:#0F172A">A spot has opened up!</h2>
  <p style="color:#374151;line-height:1.7">You were on the waitlist for <strong>${form.title}</strong> at ${club.name}. A spot has become available and your registration is now confirmed.</p>
  <p style="color:#374151;line-height:1.7">No further action is needed — your registration is approved.</p>
  <a href="${link}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#22C55E;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">View registration →</a>
  <p style="font-size:12px;color:#94A3B8">If you have questions, contact ${club.name} directly.</p>
</div>`,
    });
  }

  return NextResponse.json({ success: true, email_sent: !!email });
}

function findEmail(data: Record<string, string>): string | null {
  for (const v of Object.values(data)) {
    if (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v;
  }
  return null;
}
