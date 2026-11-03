import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { renderPdfFromUrl } from '@/lib/evaluationPdf';

export const maxDuration = 30;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest, { params }: { params: Promise<{ evalId: string }> }) {
  const { evalId } = await params;
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Two callers hit this route: a coach/admin previewing in the browser
  // (their own JWT, scoped by the same RLS that already governs reading
  // this row everywhere else in the app) and the internal send script,
  // authenticated with the service-role key the same way every other
  // admin script in this project is. This call's only job is deciding
  // whether the caller may see this evaluation at all — the actual
  // render happens at /internal/eval-report, gated by the same key.
  const isInternal = token === process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = isInternal
    ? supabaseAdmin()
    : createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });

  const { data: row } = await sb.from('player_evaluations').select('id, players(full_name)').eq('id', evalId).single();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const internalUrl = `${req.nextUrl.origin}/internal/eval-report/${evalId}?key=${encodeURIComponent(process.env.SUPABASE_SERVICE_ROLE_KEY!)}`;

  let pdf: Buffer;
  try {
    pdf = await renderPdfFromUrl(internalUrl);
  } catch (err) {
    console.error('evaluation pdf render failed:', err);
    return NextResponse.json({ error: 'PDF rendering failed' }, { status: 500 });
  }

  const playerName = (row as unknown as { players: { full_name: string } | null }).players?.full_name ?? 'evaluation';
  const filename = `${playerName.replace(/[^a-z0-9]+/gi, '-')}-evaluation.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
