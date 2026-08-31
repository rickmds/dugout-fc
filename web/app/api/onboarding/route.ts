import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole, hasClubAccess } from '@/lib/apiAuth';

// All wizard DB writes go through here using the service role key (bypasses RLS)

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { action } = body;
  const db = supabaseAdmin();

  if (action === 'create_club') {
    const { name, slug, primary_color, secondary_color, tagline, logo_base64, logo_mime, logo_name, as_additional_club } = body;

    // Without this, a replayed request (a duplicate tab left open from a
    // previous onboarding session, a retried click) from an org_admin who
    // already has a club silently creates a second club and reassigns them
    // to it, orphaning the one they actually run. A deliberate second club
    // (as_additional_club, set by the dashboard's "+ Add another club"
    // entry point) is exempt — it never touches profiles below, only adds
    // a club_admins row, so there's nothing to orphan.
    if (auth.clubId && !as_additional_club) {
      return NextResponse.json({ error: 'You already belong to a club.' }, { status: 409 });
    }

    // Check slug is available
    const { data: existing } = await db.from('clubs').select('id').eq('slug', slug).maybeSingle();
    if (existing) return NextResponse.json({ error: 'That URL slug is already taken.' }, { status: 409 });

    // Upload logo to Supabase Storage if provided
    let logo_url: string | null = null;
    if (logo_base64 && logo_mime) {
      try {
        const base64Data = logo_base64.split(',')[1] ?? logo_base64;
        const buf = Buffer.from(base64Data, 'base64');
        const ext = (logo_name as string | null)?.split('.').pop() ?? 'png';
        const path = `${slug}-${Date.now()}.${ext}`;
        const { data: storData, error: storError } = await db.storage
          .from('logos')
          .upload(path, buf, { contentType: logo_mime, upsert: true });
        if (!storError && storData) {
          const { data: { publicUrl } } = db.storage.from('logos').getPublicUrl(storData.path);
          logo_url = publicUrl;
        }
      } catch {
        // Logo upload failed — continue without it
      }
    }

    const { data, error } = await db.from('clubs')
      .insert({ name, slug, primary_color, secondary_color, logo_url, tagline: tagline || null })
      .select().single();
    if (error) {
      // The pre-check above and this insert are two separate round-trips,
      // so two concurrent signups with the same slug can both pass the
      // pre-check and race here — catch the unique-violation and return the
      // same friendly message instead of the raw Postgres error text.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That URL slug is already taken.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (as_additional_club && auth.clubId) {
      // Never touch profiles here — that's the org_admin's real home
      // identity at their first club. club_admins grants the same
      // implicit "every team in this club" access, purely additively.
      await db.from('club_admins').upsert(
        { club_id: data.id, profile_id: auth.userId },
        { onConflict: 'club_id,profile_id', ignoreDuplicates: true },
      );
    } else {
      // Link profile to club and ensure org_admin role
      await db.from('profiles').upsert({ id: auth.userId, club_id: data.id, role: 'org_admin' });
    }

    return NextResponse.json({ club: data });
  }

  if (action === 'create_team') {
    const { club_id, name, age_group, season } = body;

    // Verify the caller has org-admin rights over this club — either as
    // their home club or, since multi-club membership, via club_admins.
    if (!(await hasClubAccess(auth, club_id, ['org_admin', 'app_admin']))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await db.from('teams')
      .insert({ club_id, name, age_group: age_group || null, season: season || null })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Add coach as team member
    await db.from('team_members').upsert({ team_id: data.id, profile_id: auth.userId, role: 'coach' });

    return NextResponse.json({ team: data });
  }

  if (action === 'add_players') {
    const { team_id, players } = body;
    if (!players?.length) return NextResponse.json({ ok: true });

    // Verify the team's club belongs to the authenticated user (home club
    // or a second club via club_admins)
    const { data: teamRow } = await db.from('teams').select('club_id').eq('id', team_id).single();
    if (!teamRow || !(await hasClubAccess(auth, teamRow.club_id, ['org_admin', 'app_admin']))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await db.from('players').insert(players.map((p: { full_name: string; jersey_number?: string; position?: string }) => ({
      team_id,
      full_name: p.full_name,
      jersey_number: p.jersey_number ? parseInt(p.jersey_number) : null,
      position: p.position || null,
    })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
