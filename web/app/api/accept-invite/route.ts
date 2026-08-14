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
    .single<{
      id: string; team_id: string; player_id: string | null; role: string; accepted_at: string | null;
      teams: { club_id: string; clubs: { slug: string } | null } | null;
    }>();

  if (invErr || !invite) {
    return NextResponse.json({ error: 'This invite link is invalid or has already been used.' }, { status: 400 });
  }

  const inv       = invite;
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
  const { error: profErr } = await db.from('profiles').upsert({
    id: userId,
    full_name,
    role,
    club_id,
  });
  if (profErr) {
    await db.auth.admin.deleteUser(userId);
    console.error('profile upsert failed:', profErr);
    return NextResponse.json({ error: 'Account setup failed. Please try again.' }, { status: 500 });
  }

  // 4. Join the team
  const { error: memberErr } = await db.from('team_members').insert({
    team_id:    inv.team_id,
    profile_id: userId,
    role:       teamRole,
  });
  if (memberErr) {
    await db.auth.admin.deleteUser(userId);
    console.error('team_members insert failed:', memberErr);
    return NextResponse.json({ error: 'Could not join team. Please try again.' }, { status: 500 });
  }

  // 5. Link player record to this profile
  // The account, profile, and team membership are already committed at
  // this point (the important part) — a failure here shouldn't roll any
  // of that back like the earlier steps do, but it also shouldn't be
  // swallowed silently and reported as a full success.
  let tailWarning: string | null = null;
  if (inv.player_id) {
    const { error: playerLinkErr } = await db.from('players').update({ profile_id: userId }).eq('id', inv.player_id);
    if (playerLinkErr) {
      console.error('player profile link failed:', playerLinkErr);
      tailWarning = 'Your account was created, but linking your player profile failed. Contact your club if your roster info looks off.';
    }
  }

  // 6. Mark invite as accepted
  const { error: acceptErr } = await db.from('invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id);
  if (acceptErr) {
    console.error('invite accept mark failed:', acceptErr);
    tailWarning ??= 'Your account was created, but we could not mark the invite as accepted.';
  }

  return NextResponse.json({ success: true, club_slug, warning: tailWarning });
}
