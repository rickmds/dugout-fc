import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { mergeTokens } from '@/lib/mergeTokens';
import { requireRole } from '@/lib/apiAuth';

const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { player_id, club_id } = await req.json();
  if (!player_id || !club_id) return NextResponse.json({ error: 'player_id and club_id required' }, { status: 400 });
  if (auth.role !== 'app_admin' && club_id !== auth.clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = supabaseAdmin();
  const { data: a } = await sb.from('tryout_assignments').select('*, tryout_players(*)').eq('player_id', player_id).eq('club_id', club_id).single();
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const player = (a as { tryout_players: Record<string, string> }).tryout_players;
  if (!player?.email_primary) return NextResponse.json({ error: 'Player has no email' }, { status: 400 });

  const { data: tmpl } = await sb.from('tryout_email_templates').select('*').eq('club_id', club_id).eq('template_key', 'waitlist').single();
  const { data: club } = await sb.from('clubs').select('name').eq('id', club_id).single();

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

  try {
    await resend.emails.send({
      from: `${tmpl?.from_name ?? club?.name ?? 'Pulse FC'} <support@pulse-fc.app>`,
      to: player.email_primary,
      subject: tmpl?.subject ?? 'Waitlist Notification',
      html: body,
    });
  } catch (e) {
    console.error('send-waitlist: resend failed', e);
    return NextResponse.json({ error: 'Could not send the waitlist email. Please try again.' }, { status: 502 });
  }

  await sb.from('tryout_assignments').update({ status: 'Waitlist' }).eq('player_id', player_id).eq('club_id', club_id);

  return NextResponse.json({ ok: true });
}
