import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const resend = new Resend(process.env.RESEND_API_KEY!);

const EXPIRY_HOURS = 48;

export async function POST(req: NextRequest) {
  const { form_id, emails, sent_by } = await req.json() as {
    form_id: string;
    emails: string[];
    sent_by: string;
  };

  if (!form_id || !emails?.length || !sent_by) {
    return NextResponse.json({ error: 'form_id, emails, and sent_by are required' }, { status: 400 });
  }

  const { data: form, error: formErr } = await supabase
    .from('registration_forms')
    .select('id, title, club_id, token, clubs(name, slug)')
    .eq('id', form_id)
    .single();

  if (formErr || !form) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }

  const club    = (form as unknown as { clubs: { name: string; slug: string } }).clubs;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pulse-fc.app';
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  const sent: string[] = [];
  const failed: { email: string; reason: string }[] = [];

  for (const email of emails) {
    const token = crypto.randomUUID();

    const { error: insertErr } = await supabase.from('registration_late_invites').insert({
      form_id,
      email,
      token,
      sent_at:    new Date().toISOString(),
      expires_at: expiresAt,
    });

    if (insertErr) { failed.push({ email, reason: insertErr.message }); continue; }

    const link = `${baseUrl}/register/${club.slug}?form=${form_id}&token=${token}`;

    const { error: sendErr } = await resend.emails.send({
      from:    `${club.name} <noreply@pulse-fc.app>`,
      to:      email,
      subject: `You've been invited to register — ${form.title}`,
      html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 16px;color:#0F172A">You're invited to register</h2>
  <p style="color:#374151;line-height:1.7">You've been given private access to register for <strong>${form.title}</strong> at ${club.name}.</p>
  <p style="color:#374151;line-height:1.7">This link is valid for the next ${EXPIRY_HOURS} hours.</p>
  <a href="${link}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#22C55E;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">Register now →</a>
  <p style="font-size:12px;color:#94A3B8">If you didn't expect this email, you can ignore it. The link only works once and expires after ${EXPIRY_HOURS} hours.</p>
</div>`,
    });

    if (sendErr) {
      await supabase.from('registration_late_invites').delete().eq('token', token);
      failed.push({ email, reason: sendErr.message ?? 'Send failed' });
    } else {
      sent.push(email);
    }
  }

  return NextResponse.json({ sent: sent.length, failed });
}
