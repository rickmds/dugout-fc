// Converts a wall-clock date + time believed to be in a given IANA timezone
// into the real UTC instant it represents. Needed because `new Date(iso)`
// with no offset suffix always parses using the RUNTIME's own local
// timezone — correct on a device showing its own local time, wrong on a
// server (always UTC on Vercel/Node) evaluating a club's own local event
// time, which is the exact bug this fixes across the cron jobs.
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateStr}T${timeStr}Z`);
  const tzString = naiveUtc.toLocaleString('en-US', { timeZone });
  const tzDate = new Date(tzString);
  const offset = naiveUtc.getTime() - tzDate.getTime();
  return new Date(naiveUtc.getTime() + offset);
}

// The club's own local calendar date for a UTC instant (or "now") — 'en-CA'
// formats as YYYY-MM-DD. Needed anywhere a date-only column (due_date,
// closed_from/until) gets compared against "today": `new Date().toISOString()
// .slice(0,10)` gives today in UTC, which is already tomorrow from roughly
// mid-afternoon (Pacific) to early evening (Eastern) onward local time —
// flipping a same-day due date to overdue hours before local midnight.
export function zonedDateString(isoUtc: string, timeZone: string): string {
  return new Date(isoUtc).toLocaleDateString('en-CA', { timeZone });
}
