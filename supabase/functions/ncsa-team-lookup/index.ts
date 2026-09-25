import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// "Club-Division-CoachLastName", e.g. "Maroons-B09A-Breheny". The division
// segment is [B|G] + two age digits + a flight code that's either plain
// (A, B4, C, D4, DW, E, ...) or "X"-prefixed for NCSA Cup, or ends in "R"
// for an EDP team whose NCSA listing exists only for referee assignment —
// see team_ncsa_links' competition column and sync-ncsa-schedule's
// sync_games gate, which this classification feeds directly.
const TEAM_RE = /^(?<club>.+)-(?<gender>[BG])(?<age>\d{2})(?<flight>[A-Z0-9]*)-(?<coach>.+)$/;

type Competition = 'league' | 'cup' | 'ref_only';

function classify(flight: string): Competition {
  if (flight.startsWith('X')) return 'cup';
  if (flight.endsWith('R')) return 'ref_only';
  return 'league';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Lightweight auth: this only returns public team-name data (nothing
  // club/roster-specific), so any signed-in Pulse FC user is enough —
  // no need for the heavier per-team coach check sync-ncsa-schedule does.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  const res = await fetch('https://www.ncsanj.com/gameschedule.cfm?by=tm', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  const html = await res.text();

  const teams: { ncsaTeamId: string; rawName: string; club: string; gender: string; ageGroup: string; flight: string; coach: string; competition: Competition }[] = [];
  const optionRe = /<option value="(\d+)"\s*>([^<]+)<\/option>/g;
  for (const m of html.matchAll(optionRe)) {
    const [, id, rawName] = m;
    const parsed = TEAM_RE.exec(rawName.trim());
    if (!parsed?.groups) continue;
    const { club, gender, age, flight, coach } = parsed.groups;
    teams.push({
      ncsaTeamId: id,
      rawName: rawName.trim(),
      club, gender, ageGroup: `U${parseInt(age, 10)}`, flight, coach,
      competition: classify(flight),
    });
  }

  return new Response(JSON.stringify({ teams }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
