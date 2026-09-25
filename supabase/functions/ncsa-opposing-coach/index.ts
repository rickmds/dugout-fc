import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ncsaLogin, ncsaFetch, USER_AGENT } from '../_shared/ncsaAuth.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLUB_TEAMS_URL = 'https://www.ncsanj.com/clubTeams.cfm';

function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// Strips generic club-name filler words before stripping punctuation/
// spaces, so "Ridgefield Park Soccer Association" and "Ridgefield FC"
// normalize to two genuinely different strings rather than one swallowing
// the other. Longer phrases are listed first in the alternation so they
// match before their shorter substrings do (e.g. "soccer club" before
// "club" alone).
const GENERIC_WORDS = /\b(soccer club|soccer association|football club|youth soccer|association|united|club|fc|sc)\b/gi;
function normalizeClubName(s: string): string {
  return s.toLowerCase().replace(GENERIC_WORDS, '').replace(/[^a-z0-9]/g, '');
}

interface ClubOption { clubid: string; name: string }

function parseClubDropdown(html: string): ClubOption[] {
  const clubs: ClubOption[] = [];
  const optRe = /<option value="(\d+)"\s*[^>]*>([^<]+)<\/option>/g;
  let m: RegExpExecArray | null;
  while ((m = optRe.exec(html))) {
    if (m[1] === '0') continue; // "Select a Club..." placeholder
    clubs.push({ clubid: m[1], name: cleanWhitespace(m[2]) });
  }
  return clubs;
}

// Exact-normalized match wins outright when unique. Otherwise falls back
// to substring containment (either direction — NCSA's own compressed
// team-name club segments, like "RdgfldPk", often aren't a clean substring
// match either way, which is expected and handled by the caller treating
// zero candidates the same as an ambiguous match: don't guess, let the
// coach pick).
function findClubCandidates(rawClubSegment: string, clubs: ClubOption[]): ClubOption[] {
  const target = normalizeClubName(rawClubSegment);
  const exact = clubs.filter((c) => normalizeClubName(c.name) === target);
  if (exact.length === 1) return exact;
  const substr = clubs.filter((c) => {
    const n = normalizeClubName(c.name);
    return n.includes(target) || target.includes(n);
  });
  if (substr.length === 1) return substr;
  if (exact.length > 1) return exact;
  if (substr.length > 1) return substr;
  return [];
}

interface TeamCoachRow {
  division: string;
  team: string;
  coaches: { coachId: string; name: string; role: string }[];
}

const ROLE_BY_COLUMN: Record<string, string> = {
  coach_column: 'Head Coach',
  asst_coach_column: 'Assistant Coach',
};

function parseClubTeams(html: string): TeamCoachRow[] {
  const rows: TeamCoachRow[] = [];
  const rowBlocks = html.split(/<tr>/i).slice(1);
  for (const block of rowBlocks) {
    const divisionMatch = /division_column">\s*<span[^>]*>[^<]*<\/span>\s*([^<]+)/i.exec(block);
    const teamMatch = /team_column">\s*<span[^>]*>[^<]*<\/span>\s*([^<]+)/i.exec(block);
    if (!divisionMatch || !teamMatch) continue;

    const coaches: TeamCoachRow['coaches'] = [];
    const cellRe = /(coach_column|asst_coach_column)">([\s\S]*?)<\/td>/gi;
    let m: RegExpExecArray | null;
    while ((m = cellRe.exec(block))) {
      const [, columnClass, cell] = m;
      const idMatch = /data-coach-id="(\d+)"/.exec(cell);
      if (!idMatch) continue; // blank assistant-coach slot
      const nameMatch = /<\/span>\s*([\s\S]*?)\s*<div class="more_info"/i.exec(cell);
      const name = cleanWhitespace((nameMatch?.[1] ?? '').replace(/<[^>]+>/g, ''));
      if (!name) continue;
      coaches.push({ coachId: idMatch[1], name, role: ROLE_BY_COLUMN[columnClass] ?? 'Assistant Coach' });
    }
    rows.push({
      division: cleanWhitespace(divisionMatch[1]),
      team: cleanWhitespace(teamMatch[1]),
      coaches,
    });
  }
  return rows;
}

// On-demand, per-game lookup only — nothing this function returns is ever
// written to any Pulse FC table. See the plan for the full design
// rationale (why this can't be a background sync like the schedule data).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }
  const callerId = userData.user.id;

  let body: { event_id?: string; clubid_override?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  const { event_id, clubid_override } = body;
  if (!event_id) {
    return new Response(JSON.stringify({ error: 'event_id required' }), { status: 400, headers: CORS });
  }

  const { data: event } = await supabase.from('events').select('id, team_id, opponent_raw_name').eq('id', event_id).single();
  if (!event) return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404, headers: CORS });

  // Same inline coach-authorization block sync-ncsa-schedule uses — a
  // coach can only look up opponents for games on teams they actually
  // coach.
  const { data: team } = await supabase.from('teams').select('club_id').eq('id', event.team_id).single();
  if (!team) return new Response(JSON.stringify({ error: 'Team not found' }), { status: 404, headers: CORS });
  const [{ data: profile }, { data: memberRow }, { data: adminRow }] = await Promise.all([
    supabase.from('profiles').select('role, club_id').eq('id', callerId).single(),
    supabase.from('team_members').select('id').eq('team_id', event.team_id).eq('profile_id', callerId).eq('role', 'coach').maybeSingle(),
    supabase.from('club_admins').select('id').eq('club_id', team.club_id).eq('profile_id', callerId).maybeSingle(),
  ]);
  const isCoach = !!memberRow || !!adminRow
    || profile?.role === 'app_admin'
    || (profile?.role === 'org_admin' && profile?.club_id === team.club_id);
  if (!isCoach) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS });

  if (!event.opponent_raw_name) {
    return new Response(JSON.stringify({ error: 'no_opponent_data' }), { status: 200, headers: CORS });
  }
  const opponentRawName = event.opponent_raw_name as string;
  const clubSegment = opponentRawName.split('-')[0] ?? opponentRawName;

  let clubId = clubid_override;
  if (!clubId) {
    const dropdownRes = await fetch(CLUB_TEAMS_URL, { headers: { 'User-Agent': USER_AGENT } });
    const clubs = parseClubDropdown(await dropdownRes.text());
    const candidates = findClubCandidates(clubSegment, clubs);
    if (candidates.length !== 1) {
      return new Response(JSON.stringify({
        error: 'ambiguous_club',
        candidates: candidates.length > 0 ? candidates : clubs,
      }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    clubId = candidates[0].clubid;
  }

  const teamsRes = await fetch(CLUB_TEAMS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: `clubid=${encodeURIComponent(clubId)}`,
  });
  const rows = parseClubTeams(await teamsRes.text());
  const matchedTeam = rows.find((r) => r.team === opponentRawName);
  if (!matchedTeam || matchedTeam.coaches.length === 0) {
    return new Response(JSON.stringify({ error: 'coach_not_found' }), { status: 200, headers: CORS });
  }

  const { data: credRows, error: credErr } = await supabase.rpc('ncsa_get_credential', { p_profile_id: callerId });
  const cred = (credRows as { ncsa_username: string; ncsa_password: string }[] | null)?.[0];
  if (credErr || !cred) {
    return new Response(JSON.stringify({ error: 'not_connected' }), { status: 200, headers: CORS });
  }

  const session = await ncsaLogin(cred.ncsa_username, cred.ncsa_password);
  if (!session) {
    return new Response(JSON.stringify({ error: 'ncsa_login_failed' }), { status: 200, headers: CORS });
  }

  const contacts = await Promise.all(matchedTeam.coaches.map(async (c) => {
    try {
      const res = await ncsaFetch(
        `https://www.ncsanj.com/components/contact.cfc?method=getContactInfoJSON&contactID=${encodeURIComponent(c.coachId)}`,
        session,
      );
      const info = await res.json();
      return { role: c.role, first: info.first, last: info.last, email: info.email, cell: info.cell, homephone: info.homephone };
    } catch {
      return { role: c.role, first: c.name.split(' ')[0], last: c.name.split(' ').slice(1).join(' '), email: null, cell: null, homephone: null };
    }
  }));

  return new Response(JSON.stringify({ coaches: contacts }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
