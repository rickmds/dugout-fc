// US Soccer age group calculation (Aug 1 – July 31 cutoff, changed 2024-25).
// Mirrors web/lib/ageGroup.ts — kept as a separate copy since the mobile
// app and the web dashboard are different codebases with no shared lib,
// but the two must compute the exact same age group for the exact same
// birth date or a player's group would differ depending which app
// touched their record last.
// For a given season start year, a player born Aug 1 of year Y through
// July 31 of year Y+1 is in the age group: U(seasonYear - Y)

export function calcAgeGroup(dob: string, seasonYear: number): string {
  const date = new Date(dob + 'T12:00:00');
  if (isNaN(date.getTime())) return 'Unknown';
  const month = date.getMonth() + 1; // 1–12
  const year = date.getFullYear();
  const baseYear = month >= 8 ? year : year - 1;
  const num = seasonYear - baseYear;
  if (num < 4 || num > 19) return 'Unknown';
  return `U${num}`;
}

// Parse season label like "2026-27" → start year 2026. Falls back to the
// current year if the label doesn't start with a 4-digit year (e.g. a
// club that labeled a period just "Fall" with no year prefix).
export function seasonLabelToYear(label: string): number {
  const match = label.match(/^(\d{4})/);
  return match ? parseInt(match[1]) : new Date().getFullYear();
}
