// Converts a wall-clock date + time believed to be in a given IANA timezone
// into the real UTC instant it represents. Needed anywhere the CLUB's own
// local time matters (RSVP lock deadlines) rather than the viewing
// device's — a coach traveling in a different timezone than their club
// would otherwise get every deadline computed against the wrong clock.
//
// Throws immediately on unparseable input or an unresolvable timezone,
// rather than silently returning a NaN-based Invalid Date that only fails
// several steps later at whatever `.toISOString()` call happens to be
// downstream — that delayed failure is exactly what made a bad date/time
// from an AI-parsed schedule import crash with no useful error message.
// Callers with untrusted input (AI-parsed text, free text) MUST wrap this
// in a try/catch; callers with trusted input (native date/time pickers)
// should still guard defensively since a timezone lookup can fail too.
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
