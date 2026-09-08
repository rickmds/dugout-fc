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

// Human-facing label for a resolved gender value — used by pills/badges,
// never the raw 'boys'/'girls' enum value.
export const GENDER_DISPLAY_LABELS: Record<string, string> = { boys: 'Boys', girls: 'Girls', mixed: 'Mixed' };

// Common ways a team's own name already spells out its gender in plain
// English ("U11 Boys Premier") — used to skip a redundant Male/Female
// header or pill when the name already makes it obvious.
const GENDER_NAME_WORDS: Record<string, string[]> = {
  boys: ['boys', 'male', 'men'],
  girls: ['girls', 'female', 'women'],
};

// Some clubs never set teams.gender at all, but encode it in their own
// shorthand naming convention: a leading B/G code paired with the age
// ("BU9 Madrid" = Boys U9, "GU9 Madrid" = Girls U9). Recognize that one
// common pattern as a fallback guess ONLY when there's no real value —
// never overrides an actual gender the club entered.
function guessGenderFromName(name: string): 'boys' | 'girls' | null {
  if (/\bB\s*U\s*\d+\b/i.test(name)) return 'boys';
  if (/\bG\s*U\s*\d+\b/i.test(name)) return 'girls';
  return null;
}

/** The gender to treat a team as, for sorting/grouping/display — the real
 * value when the club set one, else a best-effort guess from the name. */
export function resolveTeamGender(team: { name: string; gender?: string | null }): string | null {
  return team.gender ?? guessGenderFromName(team.name);
}

/** True when `name` already spells out `gender` in plain English — so a
 * caller can skip showing it again as a separate label/pill. A guessed
 * gender (from a "BU9"-style code) does NOT count as already-said, since
 * that code isn't legible as "Boys" to someone just reading the name. */
export function nameAlreadySaysGender(name: string, gender: string | null): boolean {
  if (!gender || !(gender in GENDER_NAME_WORDS)) return false;
  const lower = name.toLowerCase();
  return GENDER_NAME_WORDS[gender].some((word) => lower.includes(word));
}

/** True when `name` already contains its own age_group text ("U12 Boys
 * Premier" already says "U12") — so a caller can skip a redundant pill. */
export function nameAlreadySaysAgeGroup(name: string, ageGroup: string | null): boolean {
  return !!ageGroup && name.toLowerCase().includes(ageGroup.toLowerCase());
}

const GENDER_RANK: Record<string, number> = { boys: 0, girls: 1, mixed: 2 };
function genderRank(gender: string | null): number {
  return gender && gender in GENDER_RANK ? GENDER_RANK[gender] : 3; // unset sorts last
}

function sortTeams<T extends { name: string; gender?: string | null }>(teams: T[]): T[] {
  return [...teams].sort((a, b) => {
    const g = genderRank(resolveTeamGender(a)) - genderRank(resolveTeamGender(b));
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
