import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rateLimit';
import { advanceWaitlistForTeam } from '@/lib/tryoutWaitlist';
import { notifyClubStaff } from '@/lib/notifyClubStaff';

// When a club has configured a Registration Hub form as its post-acceptance
// registration (tryout_offer_settings.post_acceptance_form_id), send
// accepted families there instead of the built-in /register-offer form —
// see web/app/offer-response/page.tsx.
async function resolveRegistrationHubToken(sb: ReturnType<typeof supabaseAdmin>, clubId: string): Promise<string | null> {
  const { data: settings } = await sb
    .from('tryout_offer_settings').select('post_acceptance_form_id').eq('club_id', clubId).single();
  if (!settings?.post_acceptance_form_id) return null;
  const { data: form } = await sb
    .from('registration_forms').select('token').eq('id', settings.post_acceptance_form_id).single();
  return form?.token ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: a } = await sb
    .from('tryout_assignments')
    .select('*, tryout_players(*)')
    .eq('offer_token', token)
    .single();

  if (!a) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

  const player = (a as { tryout_players: Record<string, string> }).tryout_players;
  const clubId = (a as { club_id: string }).club_id;
  const { data: club } = await sb.from('clubs').select('name, logo_url').eq('id', clubId).single();
  return NextResponse.json({
    player_name: player?.full_name,
    team_name: (a as { team: string }).team,
    club_name: club?.name,
    club_logo: club?.logo_url,
    current_status: (a as { offer_status: string }).offer_status,
    registration_status: (a as { registration_status: string }).registration_status,
    registration_hub_token: await resolveRegistrationHubToken(sb, clubId),
  });
}

export async function POST(req: NextRequest) {
  const { token, action } = await req.json() as { token: string; action: 'accept' | 'decline' };
  if (!token || !action) return NextResponse.json({ error: 'token and action required' }, { status: 400 });

  const sb = supabaseAdmin();

  const withinLimit = await checkRateLimit(sb, `tryout-process-response:${token}`, { max: 20, windowSeconds: 600 });
  if (!withinLimit) return NextResponse.json({ error: 'Too many attempts. Please try again in a few minutes.' }, { status: 429 });

  const { data: a } = await sb
    .from('tryout_assignments')
    .select('*, tryout_players(*)')
    .eq('offer_token', token)
    .single();

  if (!a) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

  const offerStatus = (a as { offer_status: string }).offer_status;
  if (['Accepted', 'Declined'].includes(offerStatus)) {
    return NextResponse.json({
      already_responded: true, action: offerStatus.toLowerCase(),
      team_name: (a as { team: string }).team,
      registration_status: (a as { registration_status: string }).registration_status,
      registration_hub_token: await resolveRegistrationHubToken(sb, (a as { club_id: string }).club_id),
    });
  }

  const newStatus = action === 'accept' ? 'Accepted' : 'Declined';
  const teamName = (a as { team: string | null }).team;
  const clubId = (a as { club_id: string }).club_id;

  await sb.from('tryout_assignments').update({
    offer_status: newStatus,
    status: newStatus,
    offer_responded_at: new Date().toISOString(),
  }).eq('id', (a as { id: string }).id);

  const player = (a as { tryout_players: Record<string, string> }).tryout_players;
  const { data: club } = await sb.from('clubs').select('name, logo_url, primary_color').eq('id', clubId).single();

  // A decline frees a roster spot on a real team — auto-offer the next
  // player in that team's ordered waitlist, if anyone's waiting.
  let promotedName: string | null = null;
  if (action === 'decline') {
    const { promoted } = await advanceWaitlistForTeam(sb, clubId, teamName);
    promotedName = promoted?.name ?? null;
  }

  const { data: offerSettings } = await sb
    .from('tryout_offer_settings')
    .select('notify_staff_on_accept, notify_staff_on_decline')
    .eq('club_id', clubId)
    .single();
  const shouldNotify = action === 'accept' ? offerSettings?.notify_staff_on_accept : offerSettings?.notify_staff_on_decline;
  if (shouldNotify) {
    const playerName = player?.full_name ?? 'A tryout player';
    let body = `${playerName} ${action === 'accept' ? 'accepted' : 'declined'} their offer for ${teamName ?? 'their team'}.`;
    if (promotedName) body += ` ${promotedName} has been automatically offered the open spot (waitlist #1).`;
    await notifyClubStaff(sb, { id: clubId, name: club?.name, primary_color: club?.primary_color }, {
      type: 'tryout_offer_response',
      title: `Offer ${action === 'accept' ? 'accepted' : 'declined'} — ${teamName ?? ''}`,
      body,
      emailSubject: `Tryouts: ${teamName ?? 'offer'} ${action === 'accept' ? 'accepted' : 'declined'}`,
      emailBody: body,
    });
  }

  return NextResponse.json({
    ok: true,
    action,
    player_name: player?.full_name,
    team_name: (a as { team: string }).team,
    club_name: club?.name,
    club_logo: club?.logo_url,
    club_color: club?.primary_color,
    registration_status: (a as { registration_status: string }).registration_status ?? 'NotStarted',
    registration_hub_token: await resolveRegistrationHubToken(sb, clubId),
  });
}
