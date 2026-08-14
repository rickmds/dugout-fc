import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';

// STRIPE_PLATFORM_FEE_PCT is server-only (no NEXT_PUBLIC_ prefix), so the
// super-admin revenue dashboard can't read it directly — it used to just
// hardcode 0 with a comment saying "keep in sync by hand." This exposes
// the real, current value instead of a second copy that can drift.
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['app_admin']);
  if (!auth.ok) return auth.response;

  const pct = parseFloat(process.env.STRIPE_PLATFORM_FEE_PCT ?? '0');
  return NextResponse.json({ pct: Number.isFinite(pct) ? pct : 0 });
}
