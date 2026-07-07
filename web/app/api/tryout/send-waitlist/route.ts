import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { mergeTokens } from '@/lib/mergeTokens';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dugoutfc.app';

export async function POST(req: NextRequest) {
  const { assignment_id } = await req.json();
  if (!assignment_id) return NextResponse.json({ error: 'assignment_id required' }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: a } = await sb.from('tryout_assignments').select('*, tryout_players(*)').eq('id', assignment_id).single();
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const player = (a as { tryout_players: Record<string, string> }).tryout_players;
  if (!player?.email_primary) return NextResponse.json({ error: 'No email' }, { status: 400 });

  const clubId = (a as { club_id: string }).club_id;
  const { data: tmpl } = await sb.from('tryout_email_templates').select('*').eq('club_id', clubId).eq('template_key', 'waitlist').single();
  const { data: club } = await sb.from('clubs').select('name').eq('id', clubId).single();

  const body = mergeTokens(tmpl?.body_html ?? '<p>Thank you for participating in tryouts. You have been placed on our waitlist.</p>', {
    player_first_name: player.first_name ?? '',
    player_full_name: player.full_name ?? '',
    parent_name: player.parent_name ?? '',
    team_name: (a as { team: string }).team ?? '',
    age_group: player.final_age_group ?? '',
    club_name: club?.name ?? '',
    season_label: player.season_label ?? '',
    offer_deadline: '', accept_link: '', decline_link: '',
  });

  await resend.emails.send({
    from: `${tmpl?.from_name ?? club?.name ?? 'Dugout FC'} <noreply@dugoutfc.app>`,
    to: player.email_primary,
    subject: tmpl?.subject ?? 'Waitlist Notification',
    html: body,
  });

  await sb.from('tryout_assignments').update({ status: 'Waitlist' }).eq('id', assignment_id);

  return NextResponse.json({ ok: true });
}
