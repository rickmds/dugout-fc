import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole, hasClubAccess } from '@/lib/apiAuth';

// Stress-test finding #13 (Medium): a family could opt into autopay, but
// there was no way for staff to turn it back off — the saved card just
// kept getting charged by the daily cron for every future installment
// until the schedule ran out. Clearing these three columns is enough: the
// cron's canAutoCharge check requires all three (autopay_consent,
// stripe_customer_id, stripe_payment_method_id) to attempt a charge.
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['org_admin', 'app_admin']);
  if (!auth.ok) return auth.response;

  const { submission_id } = await req.json();
  if (!submission_id) return NextResponse.json({ error: 'submission_id required' }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: submission } = await supabase
    .from('registration_submissions')
    .select('id, form_id, registration_forms(club_id)')
    .eq('id', submission_id)
    .single<{ id: string; form_id: string; registration_forms: { club_id: string } | null }>();
  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

  const clubId = submission.registration_forms?.club_id;
  if (!clubId || !(await hasClubAccess(auth, clubId, ['org_admin']))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await supabase.from('registration_submissions').update({
    autopay_consent: false, stripe_customer_id: null, stripe_payment_method_id: null,
  }).eq('id', submission_id);

  return NextResponse.json({ ok: true });
}
