import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NCSA_URL = 'https://www.ncsanj.com/gameSchedule.cfm';
const STANDINGS_URL = 'https://www.ncsanj.com/standings.cfm';

// The division code embedded in every team's own raw name (the same
// [B|G]+age+flight segment ncsa-team-lookup parses out) is exactly what
// standings.cfm's own `div` form field expects — no separate lookup needed.
const DIVISION_RE = /^.+-([BG]\d{2}[A-Z0-9]*)-.+$/;
const STANDINGS_ROW_RE = /<tr class="standings_row">([\s\S]*?)<\/tr>/g;
const STANDINGS_TD_RE = /<TD[^>]*>([\s\S]*?)<\/TD>/g;

interface StandingsRow {
  teamRawName: string;
  gp: number; w: number; l: number; d: number; pts: number; gf: number; ga: number;
}

// Every game row's "Add to Calendar" button carries these as plain HTML
// data attributes — confirmed against real Maroons schedule pages. This is
// deterministic extraction, not an AI guess: NCSA's own markup already
// gives us a stable per-game id, so a reschedule (same id, new date/time —
// confirmed this is how NCSA actually represents a rained-out game moving,
// not a cancel + new id) updates the existing row instead of duplicating it.
const ATTR_RE = /data-field-id="[^"]*"\s+data-game-id="(\d+)"\s+data-date="([\d/]+)"\s+data-time="([^"]*)"\s+data-field="([^"]*)"\s+data-home-team="([^"]*)"\s*data-away-team="([^"]*)"/;
// Score, address, and surface all live in the same per-game HTML block as
// the calendar button above (confirmed present for every game, including
// away venues) — splitting on that button isolates one game's full block
// so these can be pulled from the SAME fetch rather than a second request.
const HOME_SCORE_RE = /game_home_score">\s*<span[^>]*>[^<]*<\/span>\s*(\d*)/;
const AWAY_SCORE_RE = /game_visitor_score">\s*<span[^>]*>[^<]*<\/span>\s*(\d*)/;
const ADDRESS_RE = /Address:<\/span>\s*([^<]+)<br>\s*([^<]+)<\/li>/;
const SURFACE_RE = /Field Details:<\/span>\s*([^<]+)/;
const FIELD_SIZE_RE = /Field Size:<\/span>\s*([^<]+)/;

interface ParsedGame {
  gameId: string;
  date: string;
  time: string;
  field: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  address: string | null;
  fieldType: 'turf' | 'grass' | null;
  fieldSize: string | null;
}

interface NcsaLink {
  id: string;
  team_id: string;
  ncsa_team_id: string;
  ncsa_raw_name: string;
  competition: string;
}

function toIsoDate(mmddyyyy: string): string {
  const [mm, dd, yyyy] = mmddyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

// NCSA uses "12:00 AM" as this legacy system's placeholder for "time not
// yet set" (confirmed by cross-checking several such rows against the
// site's own display), not a genuine midnight kickoff — mapped to null
// rather than a misleading literal time.
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

function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function parseScore(m: RegExpMatchArray | null): number | null {
  const raw = m?.[1]?.trim();
  return raw ? parseInt(raw, 10) : null;
}

function parseSurface(raw: string | undefined): 'turf' | 'grass' | null {
  if (!raw) return null;
  if (/artificial|turf/i.test(raw)) return 'turf';
  if (/grass|natural/i.test(raw)) return 'grass';
  return null;
}

async function fetchGames(ncsaTeamId: string): Promise<ParsedGame[]> {
  const res = await fetch(NCSA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: `BY=tm&teamID=${encodeURIComponent(ncsaTeamId)}`,
  });
  const html = await res.text();

  // Each game's full block runs from its own "Add to Calendar" button up to
  // (but not including) the next one — everything about that one game
  // (score, field address/surface) lives inside that span.
  const blocks = html.split(/(?=<button class="calendar_trigger")/);
  const games: ParsedGame[] = [];
  for (const block of blocks) {
    const attrMatch = ATTR_RE.exec(block);
    if (!attrMatch) continue;
    const [, gameId, date, time, field, home, away] = attrMatch;

    const addrMatch = ADDRESS_RE.exec(block);
    const address = addrMatch ? cleanWhitespace(`${addrMatch[1]}, ${addrMatch[2]}`) : null;
    const surfaceMatch = SURFACE_RE.exec(block);
    const sizeMatch = FIELD_SIZE_RE.exec(block);

    games.push({
      gameId, date, time, field, home, away,
      homeScore: parseScore(HOME_SCORE_RE.exec(block)),
      awayScore: parseScore(AWAY_SCORE_RE.exec(block)),
      address,
      fieldType: parseSurface(surfaceMatch?.[1]),
      fieldSize: sizeMatch ? cleanWhitespace(sizeMatch[1]) : null,
    });
  }
  return games;
}

async function fetchStandings(division: string): Promise<StandingsRow[]> {
  const res = await fetch(STANDINGS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: `div=${encodeURIComponent(division)}`,
  });
  const html = await res.text();

  // Row order in NCSA's own response IS the rank order (their tiebreaker
  // rules, whatever they are beyond points/goal difference, are already
  // applied) — trusted directly rather than re-sorted, so this never
  // silently disagrees with what NCSA's own site shows.
  const rows: StandingsRow[] = [];
  for (const rowMatch of html.matchAll(STANDINGS_ROW_RE)) {
    const cells = [...rowMatch[1].matchAll(STANDINGS_TD_RE)]
      .map((c) => c[1].replace(/<[^>]+>/g, '').trim());
    if (cells.length < 8) continue;
    const [teamRawName, gp, w, l, d, pts, gf, ga] = cells;
    rows.push({ teamRawName, gp: +gp, w: +w, l: +l, d: +d, pts: +pts, gf: +gf, ga: +ga });
  }
  return rows;
}

async function syncStandingsForLink(supabase: ReturnType<typeof createClient>, link: NcsaLink) {
  const division = DIVISION_RE.exec(link.ncsa_raw_name)?.[1];
  if (!division) return;
  try {
    const rows = await fetchStandings(division);
    if (!rows.length) return; // no false-positive risk here — nothing to overwrite existing rows with

    await supabase.from('ncsa_standings').delete().eq('team_ncsa_link_id', link.id);
    await supabase.from('ncsa_standings').insert(
      rows.map((r, i) => ({
        team_id: link.team_id,
        team_ncsa_link_id: link.id,
        division,
        rank: i + 1,
        team_raw_name: r.teamRawName,
        is_self: r.teamRawName === link.ncsa_raw_name,
        games_played: r.gp, wins: r.w, losses: r.l, draws: r.d,
        points: r.pts, goals_for: r.gf, goals_against: r.ga,
      }))
    );
  } catch {
    // Standings are a nice-to-have layered on top of the schedule sync —
    // never let a standings-fetch failure affect that sync's own result or
    // log entry; the stale (or absent) standings just sit unchanged until
    // the next run succeeds.
  }
}

// send-team-email takes an already-resolved recipient list — it does NOT
// resolve team_id to parent emails itself (lib/emailTeam.ts's client-side
// equivalent does that via /api/team/parent-emails, which requires a real
// user session and isn't reachable from here). Replicates the core of that
// resolution directly against the DB — team_members parents only, not
// still-pending invites, which is an acceptable gap for an automated
// schedule-change notice (someone who hasn't joined yet has no way to
// receive it either way).
async function resolveParentEmails(
  supabase: ReturnType<typeof createClient>,
  teamId: string,
): Promise<{ email: string; name: string }[]> {
  const { data: members } = await supabase
    .from('team_members')
    .select('profile_id')
    .eq('team_id', teamId)
    .eq('role', 'parent');
  const profileIds = new Set((members ?? []).map((m: any) => m.profile_id as string));
  if (!profileIds.size) return [];

  const recipients: { email: string; name: string }[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (profileIds.has(u.id) && u.email) recipients.push({ email: u.email, name: '' });
    }
    hasMore = (data?.users?.length ?? 0) === 1000;
    page++;
  }
  return recipients;
}

async function notifyTeam(
  supabase: ReturnType<typeof createClient>,
  teamId: string,
  title: string,
  body: string,
  type: string,
) {
  await supabase.functions.invoke('send-push', {
    body: { team_id: teamId, title, body, data: { type } },
  });

  const to = await resolveParentEmails(supabase, teamId);
  if (!to.length) return;

  const { data: team } = await supabase
    .from('teams')
    .select('name, clubs(name, logo_url, primary_color)')
    .eq('id', teamId)
    .single();
  const club = (team as any)?.clubs;
  await supabase.functions.invoke('send-team-email', {
    body: {
      to, cc: [], subject: title, body, reply_to: null, from_name: 'Pulse FC',
      team_name: (team as any)?.name ?? '', attachments: [],
      club_logo_url: club?.logo_url ?? null, club_name: club?.name ?? null, primary_color: club?.primary_color ?? null,
    },
  });
}

// NCSA Cup games are the same roster as their league counterpart (confirmed
// — a "cup" link always shares team_id with its league link, set up by the
// linking screen's own suggestion flow), so they must NOT read as
// standalone games on that team's plain schedule — they're a knockout
// bracket, exactly this app's existing "State Cup"/undated-tournament
// concept. Routed into a tournament named "NCSA Cup" instead, found once
// per team and reused (never duplicated) rather than created per game.
async function findOrCreateCupTournament(supabase: ReturnType<typeof createClient>, teamId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('tournaments')
    .select('id')
    .eq('team_id', teamId)
    .eq('name', 'NCSA Cup')
    .maybeSingle();
  if (existing) return (existing as any).id;

  const { data: created } = await supabase
    .from('tournaments')
    .insert({ team_id: teamId, name: 'NCSA Cup' })
    .select('id')
    .single();
  return (created as any).id;
}

async function syncOneLink(supabase: ReturnType<typeof createClient>, link: NcsaLink) {
  let created = 0, updated = 0, cancelledCount = 0;
  // A write failure (a constraint violation, a transient DB error) must
  // never be silently miscounted as success — this is exactly how the
  // events_external_unique scoping bug hid itself: every insert "ran" with
  // no error check, so games that failed to save were still counted as
  // created. Collected here and surfaced in the log entry instead.
  const writeErrors: string[] = [];
  try {
    const tournamentId = link.competition === 'cup'
      ? await findOrCreateCupTournament(supabase, link.team_id)
      : null;

    const games = await fetchGames(link.ncsa_team_id);

    // Scoped to THIS link, not just the team — a team with both a league
    // and a cup link shares one team_id, and scoping by team_id alone would
    // make syncing one link see the other link's games as "not in this
    // fetch" and wrongly cancel them (this happened for real: every merged
    // team's games ended up cancelled because both links kept cancelling
    // each other's the moment either one synced).
    const { data: existingEvents } = await supabase
      .from('events')
      .select('id, event_date, event_time, location, address, field_type, home_away, score_home, score_away, external_id, cancelled_at, title')
      .eq('external_source', 'ncsa')
      .eq('team_ncsa_link_id', link.id)
      .not('external_id', 'is', null);

    const existingByGameId = new Map((existingEvents ?? []).map((e: any) => [e.external_id as string, e]));
    const seenGameIds = new Set<string>();

    // A fetch that comes back with zero games for a link that previously had
    // real ones is far more likely NCSA being down, a captcha/error page, or
    // a site layout change breaking the parser than "the league genuinely
    // deleted the entire schedule." Without this check, that failure mode
    // would fall straight into the "game disappeared" branch below and
    // soft-cancel every game on the team at once, notifying every parent
    // their whole schedule was wiped — worse than doing nothing.
    if (games.length === 0 && existingByGameId.size > 0) {
      await supabase.from('league_sync_log').insert({
        team_ncsa_link_id: link.id, status: 'error',
        error_message: `Fetch returned 0 games but ${existingByGameId.size} were previously synced — likely a fetch/parse failure, not a real empty schedule. Skipped to avoid mass-cancelling real games.`,
      });
      return;
    }

    for (const g of games) {
      seenGameIds.add(g.gameId);
      const isHome = g.home === link.ncsa_raw_name;
      const opponent = isHome ? g.away : g.home;
      const eventDate = toIsoDate(g.date);
      const eventTime = to24hTime(g.time);
      const title = `vs ${opponentDisplay(opponent)}`;
      const homeAway = isHome ? 'home' : 'away';
      // events.score_home/score_away don't mean "the literal home team's
      // score" despite the name — the match tracker's own established
      // convention (lib/tournaments.ts getGameResult) is score_home = OUR
      // score, score_away = opponent's, regardless of home_away. NCSA's
      // home/visitor scores need swapping whenever we were actually away,
      // or a game we won away looks like a loss everywhere results are
      // computed from these two columns.
      const ourScore = isHome ? g.homeScore : g.awayScore;
      const oppScore = isHome ? g.awayScore : g.homeScore;

      const existing = existingByGameId.get(g.gameId) as any;
      if (!existing) {
        // Before creating a new row, check whether the coach already
        // entered this exact game by hand. Date alone isn't reliable
        // enough on its own — a real team can have more than one game on
        // the same day (a tournament, a doubleheader), and blindly taking
        // whichever same-date row comes back first could merge NCSA's data
        // into a completely unrelated game instead of duplicating it,
        // which is a worse outcome than a duplicate. Cross-checked against
        // the opponent name too (either direction — a coach's own typed
        // text won't exactly match NCSA's cleaned name, so this only needs
        // to be a substring match, not exact); if that leaves more than one
        // candidate, or zero, this deliberately does NOT guess — it falls
        // through to creating a new row rather than risk corrupting the
        // wrong one.
        // Normalized (lowercased, spaces/punctuation stripped) before
        // comparing — confirmed necessary against real data: a coach's
        // "World Class FC" didn't substring-match NCSA's cleaned
        // "WorldClassFC" until spacing was normalized away, and produced a
        // real duplicate instead of a merge.
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const opponentName = normalize(opponentDisplay(opponent));
        const { data: sameDateMatches } = await supabase
          .from('events')
          .select('id, title, home_away, uniform')
          .eq('team_id', link.team_id)
          .eq('type', 'game')
          .eq('event_date', eventDate)
          .is('external_source', null);
        const sameDate = (sameDateMatches ?? []) as any[];
        // A single same-date manual game is unambiguous on the date alone —
        // there's nothing else it could be, so match it even if the
        // opponent text doesn't line up. Confirmed necessary against real
        // data: NCSA abbreviates "Ridgefield Park" as "RdgfldPk", which
        // doesn't substring-match either direction even after normalizing
        // spacing/punctuation (unlike the "World Class FC" case below,
        // this isn't a formatting difference — the coach's own manual
        // entry produced a real duplicate against a lone same-date game
        // before this fallback existed). The opponent-name check below
        // still gates every case where more than one manual game shares a
        // date, which is the actual disambiguation risk this exists for.
        let manualMatch: any = sameDate.length === 1 ? sameDate[0] : null;
        if (!manualMatch && sameDate.length > 1) {
          const candidates = sameDate.filter((e) => {
            const t = normalize((e.title as string).replace(/^(vs|@)\s*/i, ''));
            return t.includes(opponentName) || opponentName.includes(t);
          });
          manualMatch = candidates.length === 1 ? candidates[0] : null;
        }

        if (manualMatch) {
          const mm = manualMatch as any;
          const { error: mergeErr } = await supabase.from('events').update({
            // location and event_time must be written here, not left as
            // whatever the coach's manual entry had (often blank, or a
            // shorthand that doesn't match NCSA's exact field name) — this
            // was a real bug: the very next sync compares the row against
            // this same fetch, finds location "changed" from null/manual
            // text to NCSA's real field name, and fires a false "Game
            // rescheduled" push to every parent even though nothing
            // actually moved. Confirmed live against a real team.
            location: g.field, event_time: eventTime,
            address: g.address, field_type: g.fieldType, field_notes: g.fieldSize,
            score_home: ourScore, score_away: oppScore, tournament_id: tournamentId,
            external_source: 'ncsa', external_id: g.gameId, team_ncsa_link_id: link.id,
            opponent_raw_name: opponent,
            // Only fills these in if the coach's own entry left them blank
            // — never overrides a value they actually set.
            ...(mm.home_away == null ? { home_away: homeAway } : {}),
            ...(mm.uniform == null ? { uniform: homeAway } : {}),
          }).eq('id', mm.id);
          if (mergeErr) writeErrors.push(`merge ${g.gameId}: ${mergeErr.message}`);
          else updated++;
          continue;
        }

        const { error: insertErr } = await supabase.from('events').insert({
          team_id: link.team_id, title, type: 'game',
          event_date: eventDate, event_time: eventTime,
          location: g.field, address: g.address, field_type: g.fieldType,
          field_notes: g.fieldSize, home_away: homeAway, uniform: homeAway,
          score_home: ourScore, score_away: oppScore, tournament_id: tournamentId,
          external_source: 'ncsa', external_id: g.gameId, team_ncsa_link_id: link.id,
          opponent_raw_name: opponent,
        });
        if (insertErr) writeErrors.push(`create ${g.gameId}: ${insertErr.message}`);
        else created++;
        continue;
      }

      // Schedule-affecting changes (what parents actually need a push/email
      // about) are tracked separately from everything else that can quietly
      // stay in sync — a score getting filled in after the game is played,
      // or a field's address/surface being corrected upstream, isn't a
      // reschedule and shouldn't trigger the same notification.
      const scheduleChanged = existing.event_date !== eventDate || existing.event_time !== eventTime || existing.location !== g.field;
      const otherChanged = existing.address !== g.address || existing.field_type !== g.fieldType
        || existing.home_away !== homeAway || existing.score_home !== ourScore || existing.score_away !== oppScore;
      const wasCancelled = !!existing.cancelled_at;

      if (scheduleChanged || otherChanged || wasCancelled) {
        const { error: updateErr } = await supabase.from('events').update({
          event_date: eventDate, event_time: eventTime, location: g.field,
          address: g.address, field_type: g.fieldType, field_notes: g.fieldSize,
          home_away: homeAway, uniform: homeAway,
          score_home: ourScore, score_away: oppScore, tournament_id: tournamentId,
          team_ncsa_link_id: link.id, cancelled_at: null,
          opponent_raw_name: opponent,
        }).eq('id', existing.id);
        if (updateErr) {
          writeErrors.push(`update ${g.gameId}: ${updateErr.message}`);
        } else {
          updated++;
          if (scheduleChanged) {
            const when = eventTime ? `${eventDate} ${eventTime}` : `${eventDate} (time TBD)`;
            await notifyTeam(
              supabase, link.team_id, `Game rescheduled — ${title}`,
              `The league moved this game to ${when} at ${g.field}.`, 'event_updated',
            );
          }
        }
      }
    }

    // A game id we previously synced that no longer appears at all —
    // genuinely removed by the league (not just "already played," which
    // still shows on this page — confirmed past games with final scores
    // remain listed) — soft-cancel it, same as a manual cancel.
    for (const [gameId, existing] of existingByGameId as Map<string, any>) {
      if (!seenGameIds.has(gameId) && !existing.cancelled_at) {
        const { error: cancelErr } = await supabase.from('events').update({ cancelled_at: new Date().toISOString() }).eq('id', existing.id);
        if (cancelErr) {
          writeErrors.push(`cancel ${gameId}: ${cancelErr.message}`);
          continue;
        }
        cancelledCount++;
        await notifyTeam(
          supabase, link.team_id, `Game cancelled — ${existing.title}`,
          `The league removed this game from the schedule.`, 'event_cancelled',
        );
      }
    }

    await supabase.from('team_ncsa_links').update({ last_synced_at: new Date().toISOString() }).eq('id', link.id);
    await supabase.from('league_sync_log').insert({
      team_ncsa_link_id: link.id, status: writeErrors.length ? 'error' : 'success',
      games_found: games.length, games_created: created, games_updated: updated, games_cancelled: cancelledCount,
      error_message: writeErrors.length ? writeErrors.join('; ').slice(0, 2000) : null,
    });
  } catch (err) {
    await supabase.from('league_sync_log').insert({
      team_ncsa_link_id: link.id, status: 'error', error_message: String(err),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: { team_id?: string } = {};
  try { body = await req.json(); } catch { /* cron calls with an empty body */ }

  // Deployed with --no-verify-jwt (matches this project's other cron-
  // triggered functions), so the platform itself enforces nothing here —
  // without this check, ANY caller with the URL could trigger a sync for
  // any team, or (with no team_id) the entire database. The cron job
  // authenticates with the legacy service_role JWT — the same credential
  // every other cron-triggered function in this project already uses
  // (see e.g. the event-reminders cron) — which is NOT the same value as
  // Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') in this runtime: confirmed
  // directly that this project's edge functions now resolve that env var
  // to the newer sb_secret_ key format, a different (but equally valid)
  // credential. Comparing against the legacy JWT specifically is what
  // actually matches what the cron job sends. A coach-triggered manual
  // sync must present their own user JWT and can only ever target
  // their own team, checked the same way is_team_coach() would.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  // Legacy JWT service_role key — deliberately NOT Deno.env.get('SUPABASE_
  // SERVICE_ROLE_KEY') (see comment above). Same literal key already used
  // by this project's other cron migrations, still fully valid per this
  // project's own API keys listing (legacy, not deprecated).
  const legacyServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hbmRidXdvZ2F4bXJ6c3N0dHRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU3MDI0MywiZXhwIjoyMDk3MTQ2MjQzfQ.E6uuet4_AhAY9PH8LS1_crFG11obwv04ohGpv-BZgDk';

  if (token !== legacyServiceKey) {
    if (!body.team_id) {
      return new Response(JSON.stringify({ error: 'team_id required' }), { status: 400, headers: CORS });
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const callerId = userData.user.id;
    const { data: team } = await supabase.from('teams').select('club_id').eq('id', body.team_id).single();
    if (!team) return new Response(JSON.stringify({ error: 'Team not found' }), { status: 404, headers: CORS });
    const [{ data: profile }, { data: memberRow }, { data: adminRow }] = await Promise.all([
      supabase.from('profiles').select('role, club_id').eq('id', callerId).single(),
      supabase.from('team_members').select('id').eq('team_id', body.team_id).eq('profile_id', callerId).eq('role', 'coach').maybeSingle(),
      supabase.from('club_admins').select('id').eq('club_id', team.club_id).eq('profile_id', callerId).maybeSingle(),
    ]);
    const isCoach = !!memberRow || !!adminRow
      || profile?.role === 'app_admin'
      || (profile?.role === 'org_admin' && profile?.club_id === team.club_id);
    if (!isCoach) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS });
    }
  }

  // Only games that are actually a real schedule get synced — "ref_only"
  // NCSA entries (EDP teams whose NCSA listing exists purely so NCSA can
  // assign referees to their home games) are linked for roster purposes
  // but sync_games stays false forever, set by the linking UI itself, so
  // this query is the single place that rule is enforced.
  //
  // Ordered least-recently-synced first (never-synced links first of all)
  // rather than left at an arbitrary default order. This function used to
  // process every linked team strictly sequentially in one invocation —
  // confirmed live that at 56 linked teams, the run was hitting the edge
  // function's execution time limit partway through and silently never
  // reaching whichever teams happened to sort last, day after day, with no
  // error anywhere (each per-link failure IS logged, but a mid-run timeout
  // kills the whole invocation before it can log anything for the links it
  // never got to). This ordering means a team that gets cut off today is
  // the most-stale (and therefore first in line) tomorrow, instead of the
  // same teams being starved indefinitely.
  let query = supabase.from('team_ncsa_links')
    .select('id, team_id, ncsa_team_id, ncsa_raw_name, competition')
    .eq('sync_games', true)
    .order('last_synced_at', { ascending: true, nullsFirst: true });
  if (body.team_id) query = query.eq('team_id', body.team_id);
  const { data: links, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  }

  // Each link involves live network round-trips to NCSA's site (a schedule
  // fetch, plus a standings fetch for league links) — almost entirely
  // network-wait, not CPU, so running several concurrently cuts total
  // wall-clock time roughly by this factor instead of adding it up
  // per-link. Capped well short of hammering NCSA's server or risking
  // whatever anti-bot/rate-limiting it might have.
  //
  // Grouped by team_id, not flattened — a team with both a league and a cup
  // link shares one team_id, and syncOneLink's own "did the coach already
  // enter this game by hand" merge step reads-then-writes a shared
  // (team_id, event_date) match with no locking. Running those two links
  // truly concurrently could let both read the same manual event before
  // either writes, and both try to claim it — safe again once every link
  // for a given team only ever runs on one worker at a time, even though
  // different teams still run fully in parallel.
  const groups = new Map<string, NcsaLink[]>();
  for (const link of (links ?? []) as NcsaLink[]) {
    const g = groups.get(link.team_id);
    if (g) g.push(link); else groups.set(link.team_id, [link]);
  }
  const CONCURRENCY = 5;
  const groupQueue = [...groups.values()];
  async function worker() {
    for (;;) {
      const group = groupQueue.shift();
      if (!group) return;
      for (const link of group) {
        await syncOneLink(supabase, link);
        // Standings are a round-robin-table concept — NCSA Cup's bracket
        // format doesn't map onto this same table shape, so only 'league'
        // entries get one. 'ref_only' EDP entries are excluded upstream
        // already (sync_games is always false for those), so this filter
        // only ever excludes 'cup'.
        if (link.competition === 'league') {
          await syncStandingsForLink(supabase, link);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, groupQueue.length) }, () => worker()));

  return new Response(JSON.stringify({ synced: (links ?? []).length }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
