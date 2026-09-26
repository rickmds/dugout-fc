// Club/team/coach directory parsing against clubTeams.cfm — extracted out
// of ncsa-opposing-coach (which needs it to find one opponent's coach) so
// ncsa-sync-club-coaches (which needs it to find a club's OWN full
// roster) can reuse the exact same parsing instead of a second copy.

export function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// Strips generic club-name filler words before stripping punctuation/
// spaces, so "Ridgefield Park Soccer Association" and "Ridgefield FC"
// normalize to two genuinely different strings rather than one swallowing
// the other. Longer phrases are listed first in the alternation so they
// match before their shorter substrings do (e.g. "soccer club" before
// "club" alone).
const GENERIC_WORDS = /\b(soccer club|soccer association|football club|youth soccer|association|united|club|fc|sc)\b/gi;
export function normalizeClubName(s: string): string {
  return s.toLowerCase().replace(GENERIC_WORDS, '').replace(/[^a-z0-9]/g, '');
}

export interface ClubOption { clubid: string; name: string }

export function parseClubDropdown(html: string): ClubOption[] {
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
// zero candidates the same as an ambiguous match: don't guess, let a
// human pick).
export function findClubCandidates(rawClubSegment: string, clubs: ClubOption[]): ClubOption[] {
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

export interface TeamCoachRow {
  division: string;
  team: string;
  coaches: { coachId: string; name: string; role: string }[];
}

const ROLE_BY_COLUMN: Record<string, string> = {
  coach_column: 'Head Coach',
  asst_coach_column: 'Assistant Coach',
};

export function parseClubTeams(html: string): TeamCoachRow[] {
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
