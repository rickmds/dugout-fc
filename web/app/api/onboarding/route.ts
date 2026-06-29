import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// All wizard DB writes go through here using the service role key (bypasses RLS)

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  const db = supabaseAdmin();

  if (action === 'create_club') {
    const { name, slug, primary_color, secondary_color, tagline, user_id, logo_base64, logo_mime, logo_name } = body;

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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Link profile to club and ensure org_admin role
    await db.from('profiles').upsert({ id: user_id, club_id: data.id, role: 'org_admin' });

    return NextResponse.json({ club: data });
  }

  if (action === 'create_team') {
    const { club_id, name, age_group, season, user_id } = body;

    const { data, error } = await db.from('teams')
      .insert({ club_id, name, age_group: age_group || null, season: season || null })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Add coach as team member
    await db.from('team_members').upsert({ team_id: data.id, profile_id: user_id, role: 'coach' });

    return NextResponse.json({ team: data });
  }

  if (action === 'add_players') {
    const { team_id, players } = body;
    if (!players?.length) return NextResponse.json({ ok: true });

    const { error } = await db.from('players').insert(players.map((p: any) => ({
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
