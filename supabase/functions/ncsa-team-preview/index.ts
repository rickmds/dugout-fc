import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NCSA_URL = 'https://www.ncsanj.com/gameSchedule.cfm';
const ATTR_RE = /data-field-id="[^"]*"\s+data-game-id="(\d+)"\s+data-date="([\d/]+)"\s+data-time="([^"]*)"\s+data-field="([^"]*)"\s+data-home-team="([^"]*)"\s*data-away-team="([^"]*)"/;
// Same per-game block/score extraction sync-ncsa-schedule uses — reused
// here so this endpoint can also answer "show me this team's results" from
// the standings screen (tapping any team, not just the one we're linked
// to), not only the pre-link schedule preview it was originally built for.
const HOME_SCORE_RE = /game_home_score">\s*<span[^>]*>[^<]*<\/span>\s*(\d*)/;
const AWAY_SCORE_RE = /game_visitor_score">\s*<span[^>]*>[^<]*<\/span>\s*(\d*)/;

function parseScore(m: RegExpMatchArray | null): number | null {
  const raw = m?.[1]?.trim();
  return raw ? parseInt(raw, 10) : null;
}

function toIsoDate(mmddyyyy: string): string {
  const [mm, dd, yyyy] = mmddyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

function to24hTime(t: string): string | null {
  if (t.trim().toUpperCase() === '12:00 AM') return null;
  const m = t.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === 'AM') hh = hh === 12 ? 0 : hh;
  else hh = hh === 12 ? 12 : hh + 12;
  return `${String(hh).padStart(2, '0')}:${mm}:00`;
}

function opponentDisplay(rawTeamName: string): string {
  return rawTeamName.split('-')[0] || rawTeamName;
}

// Read-only, on purpose — this exists so a coach can see what they're
// about to link BEFORE anything is written anywhere. It never touches
// team_ncsa_links, events, or any other table; browsing candidates here
// carries zero risk of creating stray data. Also reused (unmodified) by
// the standings screen to show any division opponent's results, not just
// the pre-link preview it was originally built for.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  let body: { ncsa_team_id?: string; ncsa_raw_name?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  const { ncsa_team_id, ncsa_raw_name } = body;
  if (!ncsa_team_id || !ncsa_raw_name) {
    return new Response(JSON.stringify({ error: 'ncsa_team_id and ncsa_raw_name required' }), { status: 400, headers: CORS });
  }

  const res = await fetch(NCSA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: `BY=tm&teamID=${encodeURIComponent(ncsa_team_id)}`,
  });
  const html = await res.text();

  const games: {
    date: string; time: string | null; field: string; opponent: string; homeAway: 'home' | 'away';
    ourScore: number | null; oppScore: number | null; played: boolean;
  }[] = [];
  const blocks = html.split(/(?=<button class="calendar_trigger")/);
  for (const block of blocks) {
    const m = ATTR_RE.exec(block);
    if (!m) continue;
    const [, , date, time, field, home, away] = m;
    const isHome = home === ncsa_raw_name;
    const opponent = isHome ? away : home;
    const homeScore = parseScore(HOME_SCORE_RE.exec(block));
    const awayScore = parseScore(AWAY_SCORE_RE.exec(block));
    const ourScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;
    games.push({
      date: toIsoDate(date), time: to24hTime(time), field,
      opponent: opponentDisplay(opponent), homeAway: isHome ? 'home' : 'away',
      ourScore, oppScore, played: ourScore !== null && oppScore !== null,
    });
  }

  return new Response(JSON.stringify({ games }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
