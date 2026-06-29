// US Soccer age group calculation (Aug 1 – July 31 cutoff, changed 2024-25)
// For a given season start year, a player born Aug 1 of year Y through July 31 of year Y+1
// is in the age group: U(seasonYear - Y)

export function calcAgeGroup(dob: string, seasonYear: number): string {
  const date = new Date(dob + 'T12:00:00');
  if (isNaN(date.getTime())) return 'Unknown';
  const month = date.getMonth() + 1; // 1–12
  const year = date.getFullYear();
  // Aug–Dec → base year = birth year; Jan–Jul → base year = birth year - 1
  const baseYear = month >= 8 ? year : year - 1;
  const num = seasonYear - baseYear;
  if (num < 4 || num > 19) return 'Unknown';
  return `U${num}`;
}

// Parse season label like "2026-27" → start year 2026
export function seasonLabelToYear(label: string): number {
  const match = label.match(/^(\d{4})/);
  return match ? parseInt(match[1]) : new Date().getFullYear();
}

// Available season options shown in dropdown (current season ± 3 years)
export function seasonOptions(): string[] {
  const base = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => {
    const y = base - 1 + i;
    return `${y}-${String(y + 1).slice(-2)}`;
  });
}

export const AGE_GROUPS = ['U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','U19'];
