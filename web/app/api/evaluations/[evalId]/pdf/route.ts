import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { renderEvaluationReportHtml, renderPdfFromHtml } from '@/lib/evaluationPdf';
import type { EvalRow } from '@/components/dashboard/evaluation/EvaluationReport';

export const maxDuration = 30;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const SELECT = `
  id, player_id, season_label, period_label, status,
  rating_technical, rating_tactical, rating_physical, rating_mental,
  report_data, final_text, published_at, scheduled_publish_at,
  players(full_name, jersey_number, photo_url),
  teams:team_id(name),
  clubs:club_id(name, logo_url, primary_color)
`;

export async function GET(req: NextRequest, { params }: { params: Promise<{ evalId: string }> }) {
  const { evalId } = await params;
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Two callers hit this route: a coach/admin previewing in the browser
  // (their own JWT, scoped by the same RLS that already governs reading
  // this row everywhere else in the app) and the internal send script,
  // authenticated with the service-role key the same way every other
  // admin script in this project is. Never a third, looser path.
  const isInternal = token === process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = isInternal
    ? supabaseAdmin()
    : createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });

  const { data: row } = await sb.from('player_evaluations').select(SELECT).eq('id', evalId).single();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const clubRow = row.clubs as unknown as { name: string; logo_url: string | null; primary_color: string | null } | null;
  if (!clubRow) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

  const primary = clubRow.primary_color && clubRow.primary_color !== '#000000' ? clubRow.primary_color : '#22C55E';
  const html = renderEvaluationReportHtml({
    ev: row as unknown as EvalRow,
    primary,
    clubLogoUrl: clubRow.logo_url,
    clubName: clubRow.name,
  });

  let pdf: Buffer;
  try {
    pdf = await renderPdfFromHtml(html);
  } catch (err) {
    console.error('evaluation pdf render failed:', err);
    return NextResponse.json({ error: 'PDF rendering failed' }, { status: 500 });
  }

  const playerName = (row as unknown as EvalRow).players?.full_name ?? 'evaluation';
  const filename = `${playerName.replace(/[^a-z0-9]+/gi, '-')}-evaluation.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
