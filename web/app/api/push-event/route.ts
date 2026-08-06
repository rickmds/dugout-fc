import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function POST(req: NextRequest) {
  const { team_id, exclude_profile_id, type, title, body, data } = await req.json();

  if (!team_id) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

  const supabase = supabaseAdmin();

  // Resolve club slug for deep-link routing
  const { data: teamRow } = await supabase
    .from('teams')
    .select('clubs(slug)')
    .eq('id', team_id)
    .single();
  const clubSlug = (teamRow?.clubs as any)?.slug ?? '';

  // Merge type + club_slug into push data so the mobile app can deep-link
  const pushData = { ...(data ?? {}), type: type ?? 'general', club_slug: clubSlug };
  const resolvedType = type ?? 'general';

  // Resolve team members (excluding the sender)
  const { data: members } = await supabase
    .from('team_members')
    .select('profile_id')
    .eq('team_id', team_id);

  const profileIds = (members ?? [])
    .map((m: any) => m.profile_id as string)
    .filter((id: string) => id !== exclude_profile_id);

  if (!profileIds.length) return NextResponse.json({ sent: 0 });

  // Insert in-app notifications
  await supabase.from('notifications').insert(
    profileIds.map((profile_id: string) => ({
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

  if (!tokens?.length) return NextResponse.json({ sent: 0 });

  const messages = tokens.map((t: any) => ({
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
