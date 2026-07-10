import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { token, email, password, full_name } = await req.json();

  if (!token || !email || !password || !full_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const db = supabaseAdmin();

  // 1. Fetch and validate the invite
  const { data: invite, error: invErr } = await db
    .from('invites')
    .select('id, team_id, player_id, role, accepted_at, teams(club_id, clubs(slug))')
    .eq('token', token)
    .is('accepted_at', null)
    .single();

  if (invErr || !invite) {
    return NextResponse.json({ error: 'This invite link is invalid or has already been used.' }, { status: 400 });
  }

  const inv       = invite as any;
  const club_id   = inv.teams?.club_id;
  const club_slug = inv.teams?.clubs?.slug;
  const role      = inv.role === 'coach' ? 'coach'  : 'player';
  const teamRole  = inv.role === 'coach' ? 'coach'  : 'parent';

  // 2. Create the user with email pre-confirmed (no confirmation email needed)
  const { data: authData, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (createErr) {
    const msg = createErr.message ?? '';
    if (msg.includes('already been registered') || msg.includes('already exists') || msg.includes('email')) {
      return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.', code: 'email_exists' }, { status: 409 });
    }
    console.error('createUser error:', createErr);
    return NextResponse.json({ error: 'Could not create account. Please try again.' }, { status: 500 });
  }

  const userId = authData.user!.id;

  // 3. Create profile
  await db.from('profiles').upsert({
    id: userId,
    full_name,
    role,
    club_id,
  });

  // 4. Join the team
  await db.from('team_members').insert({
    team_id:    inv.team_id,
    profile_id: userId,
    role:       teamRole,
  });

  // 5. Link player record to this profile
  if (inv.player_id) {
    await db.from('players').update({ profile_id: userId }).eq('id', inv.player_id);
  }

  // 6. Mark invite as accepted
  await db.from('invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id);

  return NextResponse.json({ success: true, club_slug });
}
