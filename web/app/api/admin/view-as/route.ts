import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/apiAuth';

// app_admin-only. Generates a real Supabase session for a real parent
// profile so testing actually exercises RLS as that person, rather than a
// client-side "pretend" mode that wouldn't catch anything RLS-specific.
// admin.generateLink() (unlike signInWithOtp/resetPasswordForEmail) never
// triggers the club-branded Send Email hook — the target parent is not
// notified or emailed anything when this runs.
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['app_admin']);
  if (!auth.ok) return auth.response;

  const { profile_id } = await req.json();
  if (!profile_id) return NextResponse.json({ error: 'profile_id required' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: targetUser, error: userErr } = await db.auth.admin.getUserById(profile_id);
  if (userErr || !targetUser?.user?.email) {
    return NextResponse.json({ error: 'Could not find that account.' }, { status: 404 });
  }

  const { data: targetProfile } = await db.from('profiles').select('full_name').eq('id', profile_id).single();

  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: targetUser.user.email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    console.error('view-as: generateLink failed', linkErr);
    return NextResponse.json({ error: 'Could not start View As session.' }, { status: 500 });
  }

  await db.from('admin_impersonation_log').insert({
    app_admin_id: auth.userId,
    target_profile_id: profile_id,
    target_name: targetProfile?.full_name ?? null,
  });

  return NextResponse.json({
    token_hash: link.properties.hashed_token,
    full_name: targetProfile?.full_name ?? 'Parent',
  });
}
