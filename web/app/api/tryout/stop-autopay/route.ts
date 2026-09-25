import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole, hasClubAccess } from '@/lib/apiAuth';

// Same fix as /api/registration/stop-autopay, for tryout offer installments.
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { assignment_id } = await req.json();
  if (!assignment_id) return NextResponse.json({ error: 'assignment_id required' }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: assignment } = await supabase
    .from('tryout_assignments').select('id, club_id').eq('id', assignment_id).single();
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  if (!(await hasClubAccess(auth, assignment.club_id, ['org_admin']))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await supabase.from('tryout_assignments').update({
    autopay_consent: false, stripe_customer_id: null, stripe_payment_method_id: null,
  }).eq('id', assignment_id);

  return NextResponse.json({ ok: true });
}
