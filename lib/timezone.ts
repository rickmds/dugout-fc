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
//
// Every step below is built from an explicit 'Z' (UTC) suffix or an
// Intl API's own `timeZone` option — never from parsing a bare,
// timezone-less string via `new Date(...)`, which silently resolves
// against the RUNNING DEVICE's own local timezone. An earlier version of
// this function did exactly that (via `new Date(naiveUtc.toLocaleString(...))`),
// which happened to produce correct results only when the device itself
// was set to UTC — true for a server, never true for a coach's own phone
// — so on mobile this was silently off by however many hours separated
// the device's timezone from the club's, corrupting every RSVP deadline
// it computed.
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateStr}T${timeStr}Z`);
  if (isNaN(naiveUtc.getTime())) {
    throw new Error(`zonedTimeToUtc: invalid date/time "${dateStr}T${timeStr}"`);
  }
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(naiveUtc).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {} as Record<string, string>);
  // What naiveUtc's instant reads as in the target zone, re-parsed with
  // its own explicit 'Z' — this is the piece that must stay
  // device-timezone-independent for the offset below to be correct.
  const hour24 = parts.hour === '24' ? '00' : parts.hour; // some locales render midnight as "24:00"
  const tzAsUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${hour24}:${parts.minute}:${parts.second}Z`);
  const offset = naiveUtc.getTime() - tzAsUtc.getTime();
  const result = new Date(naiveUtc.getTime() + offset);
  if (isNaN(result.getTime())) {
    throw new Error(`zonedTimeToUtc: could not resolve timezone "${timeZone}" for ${dateStr}T${timeStr}`);
  }
  return result;
}
