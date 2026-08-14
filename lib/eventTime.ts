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
