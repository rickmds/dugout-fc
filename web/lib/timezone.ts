// Converts a wall-clock date + time believed to be in a given IANA timezone
// into the real UTC instant it represents. Needed because `new Date(iso)`
// with no offset suffix always parses using the RUNTIME's own local
// timezone — correct on a device showing its own local time, wrong on a
// server (always UTC on Vercel/Node) evaluating a club's own local event
// time, which is the exact bug this fixes across the cron jobs.
//
// Throws immediately on unparseable input or an unresolvable timezone,
// rather than silently returning a NaN-based Invalid Date that only fails
// several steps later at whatever `.toISOString()` call happens to be
// downstream. Callers with untrusted input (AI-parsed text, free text) MUST
// wrap this in a try/catch; callers iterating multiple events (cron jobs)
// should catch per-item so one bad row doesn't take down the whole run.
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateStr}T${timeStr}Z`);
  if (isNaN(naiveUtc.getTime())) {
    throw new Error(`zonedTimeToUtc: invalid date/time "${dateStr}T${timeStr}"`);
  }
  const tzString = naiveUtc.toLocaleString('en-US', { timeZone });
  const tzDate = new Date(tzString);
  const offset = naiveUtc.getTime() - tzDate.getTime();
  const result = new Date(naiveUtc.getTime() + offset);
  if (isNaN(result.getTime())) {
    throw new Error(`zonedTimeToUtc: could not resolve timezone "${timeZone}" for ${dateStr}T${timeStr}`);
  }
  return result;
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

/**
 * Parses a time string that might be 12-hour ("6:00 PM", "6:00pm", "6 PM",
 * "6:00 p.m.") or 24-hour ("18:00", "06:00"). Only converts when an AM/PM
 * marker is actually present — a bare "6:00" is trusted as already being
 * 24-hour (6am), which is both the correct reading and idempotent for
 * genuinely-24-hour input. Returns null for anything that isn't a real
 * time (e.g. "TBD"), rather than silently producing NaN that only fails
 * much later at a `.toISOString()` call several steps downstream.
 *
 * Mirrors lib/eventTime.ts's mobile version — this exists because
 * AI-parsed schedule uploads are told to return 24-hour time but aren't
 * guaranteed to. Keep both in lockstep if either changes.
 */
export function parseFlexibleTime(input: string | null | undefined): { h: number; m: number } | null {
  if (!input) return null;
  const s = input.trim();

  const twelveHour = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?$/);
  if (twelveHour) {
    let h = parseInt(twelveHour[1], 10);
    const m = twelveHour[2] ? parseInt(twelveHour[2], 10) : 0;
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    const isPM = twelveHour[3].toLowerCase() === 'p';
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return { h, m };
  }

  const twentyFourHour = s.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) {
    const h = parseInt(twentyFourHour[1], 10);
    const m = parseInt(twentyFourHour[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return { h, m };
  }

  return null;
}

/** Formats a parsed time back to the "HH:MM" 24-hour string the DB and the rest of the app expect. */
export function toTimeString(t: { h: number; m: number }): string {
  return `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`;
}
