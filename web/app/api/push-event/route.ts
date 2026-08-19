import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';
import { sendWebPush } from '@/lib/webPush';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'coach', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { team_id, exclude_profile_id, type, title, body, data } = await req.json();

  if (!team_id) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

  const supabase = supabaseAdmin();

  // Resolve club slug for deep-link routing, and verify the team belongs to the caller's club
  const { data: teamRow } = await supabase
    .from('teams')
    .select('club_id, clubs(slug)')
    .eq('id', team_id)
    .single<{ club_id: string; clubs: { slug: string } | null }>();
  if (!teamRow || (auth.role !== 'app_admin' && teamRow.club_id !== auth.clubId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const clubSlug = teamRow.clubs?.slug ?? '';

  // Merge type + club_slug into push data so the mobile app can deep-link
  const pushData = { ...(data ?? {}), type: type ?? 'general', club_slug: clubSlug };
  const resolvedType = type ?? 'general';

  // Resolve team members (excluding the sender)
  const { data: members } = await supabase
    .from('team_members')
    .select('profile_id')
    .eq('team_id', team_id);

  const profileIds = (members ?? [])
    .map(m => m.profile_id)
    .filter(id => id !== exclude_profile_id);

  if (!profileIds.length) return NextResponse.json({ sent: 0 });

  // Insert in-app notifications
  await supabase.from('notifications').insert(
    profileIds.map(profile_id => ({
      profile_id,
      type: resolvedType,
      title,
      body,
      data: pushData,
    }))
  );

  // Fetch push tokens
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('profile_id', profileIds);

  await sendWebPush(profileIds, { title, body, data: pushData });

  if (!tokens?.length) return NextResponse.json({ sent: 0 });

  const messages = tokens.map(t => ({
    to: t.token,
    title,
    body,
    sound: 'default',
    data: pushData,
  }));

  for (let i = 0; i < messages.length; i += 100) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }

  return NextResponse.json({ sent: messages.length });
}
