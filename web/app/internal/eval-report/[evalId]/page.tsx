import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { EvaluationReportCard, type EvalRow } from '@/components/dashboard/evaluation/EvaluationReportCard';

// Without this, Next statically pre-renders this page at build time, when
// there's no real `key` to check against — notFound() fires during that
// build-time pass, and the resulting 404 gets cached and served to every
// real request afterward regardless of the actual key. Forcing dynamic
// rendering makes every request run the key check fresh, for real.
export const dynamic = 'force-dynamic';

// Render-only target for the PDF pipeline (web/lib/evaluationPdf.tsx) —
// Puppeteer navigates here and prints the result. Never a page a person
// browses to: the access decision already happened in
// /api/evaluations/[evalId]/pdf (RLS-scoped user fetch, or the service-role
// path for the internal send script) before it ever asks Puppeteer to load
// this URL, so this page's only gate is requiring that same service-role
// key back as `key` — proof the request came from that trusted caller, not
// a second, independent permission check.
const SELECT = `
  id, player_id, season_label, period_label, status,
  rating_technical, rating_tactical, rating_physical, rating_mental,
  report_data, final_text, published_at, scheduled_publish_at,
  players(full_name, jersey_number, photo_url),
  teams:team_id(name),
  clubs:club_id(name, logo_url, primary_color)
`;

export default async function InternalEvalReportPage({
  params, searchParams,
}: {
  params: Promise<{ evalId: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { evalId } = await params;
  const { key } = await searchParams;
  if (!key || key !== process.env.SUPABASE_SERVICE_ROLE_KEY) notFound();

  const sb = supabaseAdmin();
  const { data: row } = await sb.from('player_evaluations').select(SELECT).eq('id', evalId).single();
  if (!row) notFound();

  const clubRow = row.clubs as unknown as { name: string; logo_url: string | null; primary_color: string | null } | null;
  if (!clubRow) notFound();

  const primary = clubRow.primary_color && clubRow.primary_color !== '#000000' ? clubRow.primary_color : '#22C55E';

  return (
    <div style={{ background: '#f1f5f9', padding: '20px', minHeight: '100vh' }}>
      <EvaluationReportCard
        ev={row as unknown as EvalRow}
        primary={primary}
        clubLogoUrl={clubRow.logo_url}
        clubName={clubRow.name}
      />
    </div>
  );
}
