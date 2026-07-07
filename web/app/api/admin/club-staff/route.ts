import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: p } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if ((p as { role: string } | null)?.role !== 'app_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const clubId = req.nextUrl.searchParams.get('clubId');
  if (!clubId) return NextResponse.json({ error: 'Missing clubId' }, { status: 400 });

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('club_id', clubId)
    .in('role', ['org_admin', 'coach'])
    .order('role');

  if (!profiles?.length) return NextResponse.json({ staff: [] });

  const staffWithEmails = await Promise.all(
    (profiles as { id: string; full_name: string | null; role: string | null }[]).map(async (prof) => {
      const { data: { user: u } } = await admin.auth.admin.getUserById(prof.id);
      return { ...prof, email: u?.email ?? null };
    })
  );

  return NextResponse.json({ staff: staffWithEmails });
}
