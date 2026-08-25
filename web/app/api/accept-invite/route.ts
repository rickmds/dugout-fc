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
    .select('id, email, team_id, club_id, team_ids, player_id, role, accepted_at, teams(club_id, clubs(slug)), clubs(slug)')
    .eq('token', token)
    .is('accepted_at', null)
    .single<{
      id: string; email: string | null; team_id: string | null; club_id: string | null; team_ids: string[] | null;
      player_id: string | null; role: string; accepted_at: string | null;
      teams: { club_id: string; clubs: { slug: string } | null } | null;
      clubs: { slug: string } | null;
    }>();

  if (invErr || !invite) {
    return NextResponse.json({ error: 'This invite link is invalid or has already been used.' }, { status: 400 });
  }

  const inv = invite;

  // Every real invite in this app is created with the recipient's actual
  // email (invite-coach, roster-import, and the guardian-invite screens
  // all reject an empty email before insert) — without this check, a
  // fully anonymous caller could redeem any club's invite token by simply
  // declaring whatever email they wanted in the POST body, no account or
  // prior auth required at all.
  if (!inv.email || inv.email.trim().toLowerCase() !== String(email).trim().toLowerCase()) {
    return NextResponse.json({ error: 'This invite was sent to a different email address. Ask your club for a new invite addressed to you.' }, { status: 403 });
  }
  const club_id   = inv.team_id ? inv.teams?.club_id : inv.club_id;
  const club_slug = inv.team_id ? inv.teams?.clubs?.slug : inv.clubs?.slug;
  const role      = inv.role === 'coach' ? 'coach' : inv.role === 'org_admin' ? 'org_admin' : 'player';

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

  // 4. Join the team(s) — a single-team invite (parent or single-team coach)
  // carries team_id; a club-wide coach invite carries team_ids instead; an
  // org_admin invite carries neither — their access is club-wide via
  // profiles.role/club_id alone, no team_members row needed.
  const teamRole = inv.role === 'coach' ? 'coach' : 'parent';
  const memberRows = inv.team_id
    ? [{ team_id: inv.team_id, profile_id: userId, role: teamRole }]
    : (inv.team_ids ?? []).map((team_id) => ({ team_id, profile_id: userId, role: 'coach' }));

  if (memberRows.length) {
    const { error: memberErr } = await db.from('team_members').insert(memberRows);
    if (memberErr) {
      await db.auth.admin.deleteUser(userId);
      console.error('team_members insert failed:', memberErr);
      return NextResponse.json({ error: 'Could not join team. Please try again.' }, { status: 500 });
    }
  }

  // 5. Link player record to this profile
  // The account, profile, and team membership are already committed at
  // this point (the important part) — a failure here shouldn't roll any
  // of that back like the earlier steps do, but it also shouldn't be
  // swallowed silently and reported as a full success.
  //
  // Mirrors the mobile accept_invite RPC exactly: every accepting guardian
  // gets a player_guardians row (this is what makes a second/third guardian
  // actually work), and the legacy single-column players.profile_id slot is
  // only ever claimed by whoever gets there first (.is('profile_id', null))
  // — without that guard, each new guardian silently evicted the previous
  // one from every RLS check keyed on players.profile_id.
  let tailWarning: string | null = null;
  if (inv.player_id) {
    const { error: guardianErr } = await db.from('player_guardians').upsert(
      { player_id: inv.player_id, profile_id: userId },
      { onConflict: 'player_id,profile_id', ignoreDuplicates: true }
    );
    if (guardianErr) console.error('player_guardians insert failed:', guardianErr);

    const { error: playerLinkErr } = await db.from('players')
      .update({ profile_id: userId })
      .eq('id', inv.player_id)
      .is('profile_id', null);
    if (playerLinkErr) {
      console.error('player profile link failed:', playerLinkErr);
      tailWarning = 'Your account was created, but linking your player profile failed. Contact your club if your roster info looks off.';
    }
  }

  // 6. Mark invite as accepted — accepted_by records who, so removing a
  // guardian later can actually revoke their player_guardians access
  // instead of just deleting this historical row.
  const { error: acceptErr } = await db.from('invites').update({ accepted_at: new Date().toISOString(), accepted_by: userId }).eq('id', inv.id);
  if (acceptErr) {
    console.error('invite accept mark failed:', acceptErr);
    tailWarning ??= 'Your account was created, but we could not mark the invite as accepted.';
  }

  return NextResponse.json({ success: true, club_slug, warning: tailWarning });
}
