// Converts a wall-clock date + time believed to be in a given IANA timezone
// into the real UTC instant it represents. Needed anywhere the CLUB's own
// local time matters (RSVP lock deadlines) rather than the viewing
// device's — a coach traveling in a different timezone than their club
// would otherwise get every deadline computed against the wrong clock.
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateStr}T${timeStr}Z`);
  const tzString = naiveUtc.toLocaleString('en-US', { timeZone });
  const tzDate = new Date(tzString);
  const offset = naiveUtc.getTime() - tzDate.getTime();
  return new Date(naiveUtc.getTime() + offset);
}
