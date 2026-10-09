import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';
import { mergeTokens } from '@/lib/mergeTokens';
import { requireRole } from '@/lib/apiAuth';

const resend = new Resend(process.env.RESEND_API_KEY);

// Bulk sibling of send-waitlist — sending offers has had a "send to all"
// since the beginning, but notifying a whole column of waitlisted/cut
// players meant one click per player. This closes that gap for Waitlist.
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { player_ids, club_id } = await req.json();
  if (!Array.isArray(player_ids) || player_ids.length === 0 || !club_id) {
    return NextResponse.json({ error: 'player_ids and club_id required' }, { status: 400 });
  }
  if (auth.role !== 'app_admin' && club_id !== auth.clubId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = supabaseAdmin();
  const [{ data: assignments }, { data: tmpl }, { data: club }] = await Promise.all([
    sb.from('tryout_assignments').select('*, tryout_players(*)').in('player_id', player_ids).eq('club_id', club_id),
    sb.from('tryout_email_templates').select('*').eq('club_id', club_id).eq('template_key', 'waitlist').single(),
    sb.from('clubs').select('name').eq('id', club_id).single(),
  ]);

  let sent = 0;
  for (const a of assignments ?? []) {
    const player = (a as { tryout_players: Record<string, string> }).tryout_players;
    if (!player?.email_primary) continue;

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
      await sb.from('tryout_assignments').update({ status: 'Waitlist' }).eq('player_id', (a as { player_id: string }).player_id).eq('club_id', club_id);
      sent++;
    } catch {
      // continue on individual send failure
    }
  }

  return NextResponse.json({ sent });
}
