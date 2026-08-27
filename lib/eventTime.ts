/**
 * Parses a time string that might be 12-hour ("6:00 PM", "6:00pm", "6 PM",
 * "6:00 p.m.") or 24-hour ("18:00", "06:00"). Only converts when an AM/PM
 * marker is actually present — a bare "6:00" is trusted as already being
 * 24-hour (6am), which is both the correct reading and idempotent for
 * genuinely-24-hour input. Returns null for anything that isn't a real time
 * (e.g. "TBD"), rather than silently producing NaN that only fails much
 * later at a `.toISOString()` call several steps downstream.
 *
 * This exists because AI-parsed schedule uploads are told to return 24-hour
 * time but aren't guaranteed to — this is the client-side safety net.
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

/**
 * Given an event's kickoff time ("HH:MM") and how many minutes early a
 * coach wants players to arrive, returns the arrival time as a 12-hour
 * clock string (e.g. "9:40 AM").
 */
export function computeArriveBy(timeStr: string, bufferMins: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = h * 60 + m - bufferMins;
  const normalized = ((totalMins % 1440) + 1440) % 1440;
  const arrH = Math.floor(normalized / 60);
  const arrM = normalized % 60;
  const period = arrH >= 12 ? 'PM' : 'AM';
  const displayH = arrH % 12 || 12;
  return `${displayH}:${String(arrM).padStart(2, '0')} ${period}`;
}

/**
 * Given an event's kickoff time ("HH:MM"), arrival buffer, drive time, and
 * a parking buffer, returns the suggested departure time as a 12-hour clock
 * string — i.e. when to leave to arrive by the "arrive by" time.
 */
export function computeLeaveBy(
  timeStr: string,
  arrivalBufferMins: number,
  driveMins: number,
  parkingBufferMins: number = 5,
): string {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = h * 60 + m - arrivalBufferMins - driveMins - parkingBufferMins;
  const normalized = ((totalMins % 1440) + 1440) % 1440;
  const leaveH = Math.floor(normalized / 60);
  const leaveM = normalized % 60;
  const period = leaveH >= 12 ? 'PM' : 'AM';
  const displayH = leaveH % 12 || 12;
  return `${displayH}:${String(leaveM).padStart(2, '0')} ${period}`;
}
