// Groups a flat team list into age-group sections for display — used
// anywhere an org_admin browses every team in the club (that list gets
// genuinely huge for multi-team academies), so a flat unsorted scroll
// stops being usable. Sections sort by age band; within each section,
// boys sort before girls before mixed/unset, then alphabetically.
export type SectionedTeams<T> = { title: string; data: T[] }[];

// Number of teams above which a flat sorted list stops being fast to scan
// and a club is better served by collapsible per-age-group sections —
// below this, the grouping overhead (headers, tap-to-expand) outweighs
// what it saves, so callers should just render a flat sorted list instead.
export const TEAM_GROUPING_THRESHOLD = 12;

// Some clubs' age_group values aren't "U12" at all — internal squad codes
// like "G12DB" (girls U12, squad D/B) or "G09B" carry the age as a 1-2
// digit number right after a leading gender letter instead. Pulling the
// number out of either shape means a girls team coded "G12B" lands in the
// same U12 group as the boys teams named "U12", instead of getting its own
// stray one-team section that never merges with anything.
function extractAgeNumber(ageGroup: string): number | null {
  const uMatch = ageGroup.match(/U\s*(\d+)/i);
  if (uMatch) return parseInt(uMatch[1], 10);
  const codeMatch = ageGroup.match(/^[GB](\d{1,2})/i);
  if (codeMatch) return parseInt(codeMatch[1], 10);
  return null;
}

// The grouping key/display title for an age_group value — "U{n}" whenever
// an age can be extracted (regardless of source format), so teams that are
// the same age but recorded differently still land in one section.
function normalizeAgeGroupTitle(ageGroup: string | null): string {
  if (!ageGroup?.trim()) return 'Other';
  const n = extractAgeNumber(ageGroup);
  return n !== null ? `U${n}` : ageGroup.trim();
}

function ageGroupRank(ageGroup: string | null): number {
  if (!ageGroup) return Number.MAX_SAFE_INTEGER;
  const n = extractAgeNumber(ageGroup);
  return n !== null ? n : Number.MAX_SAFE_INTEGER - 1;
}

const GENDER_RANK: Record<string, number> = { boys: 0, girls: 1, mixed: 2 };
function genderRank(gender: string | null | undefined): number {
  return gender && gender in GENDER_RANK ? GENDER_RANK[gender] : 3; // unset sorts last
}

function sortTeams<T extends { name: string; gender?: string | null }>(teams: T[]): T[] {
  return [...teams].sort((a, b) => {
    const g = genderRank(a.gender) - genderRank(b.gender);
    return g !== 0 ? g : a.name.localeCompare(b.name);
  });
}

export function groupTeamsByAgeGroup<T extends { age_group: string | null; name: string; gender?: string | null }>(teams: T[]): SectionedTeams<T> {
  const byGroup = new Map<string, T[]>();
  for (const t of teams) {
    const key = normalizeAgeGroupTitle(t.age_group);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(t);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => {
      const ra = ageGroupRank(a === 'Other' ? null : a);
      const rb = ageGroupRank(b === 'Other' ? null : b);
      return ra !== rb ? ra - rb : a.localeCompare(b);
    })
    .map(([title, data]) => ({ title, data: sortTeams(data) }));
}

// Same age-then-gender ordering as groupTeamsByAgeGroup, flattened with no
// section boundaries — for the below-threshold case, where the list is
// short enough that headers/accordions would just be overhead but the
// ordering itself is still worth keeping.
export function sortTeamsByAgeAndGender<T extends { age_group: string | null; name: string; gender?: string | null }>(teams: T[]): T[] {
  return groupTeamsByAgeGroup(teams).flatMap((s) => s.data);
}
