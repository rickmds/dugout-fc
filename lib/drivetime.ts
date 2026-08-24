import * as Location from 'expo-location';

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';

async function getUserOrigin(): Promise<string | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[drivetime] location permission not granted:', status);
      return null;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return `${pos.coords.latitude},${pos.coords.longitude}`;
  } catch (err) {
    console.warn('[drivetime] getCurrentPositionAsync failed:', err);
    return null;
  }
}

// Google predicts traffic for a given departure_time (Unix seconds) rather
// than using live conditions — for a future event that's exactly what we
// want (predicted traffic at kickoff, not traffic right now). departure_time
// can't be in the past, so anything that resolves earlier than "now" (a
// past event, or one with no time set) just falls back to live traffic.
function toDepartureTimestamp(eventDate?: string, eventTime?: string | null): number {
  const nowSec = Math.floor(Date.now() / 1000);
  if (!eventDate) return nowSec;
  const target = new Date(`${eventDate}T${eventTime ?? '12:00'}:00`);
  const targetSec = Math.floor(target.getTime() / 1000);
  return Number.isFinite(targetSec) ? Math.max(targetSec, nowSec) : nowSec;
}

// Resolve a venue name / address to "lat,lng" using Google Geocoding
export async function geocodeAddress(query: string): Promise<string | null> {
  if (!PLACES_KEY || !query) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${PLACES_KEY}`
    );
    const json = await res.json();
    const loc = json.results?.[0]?.geometry?.location;
    return loc ? `${loc.lat},${loc.lng}` : null;
  } catch {
    return null;
  }
}

// Parse a Google Distance Matrix duration string (e.g. "1 hour 5 mins",
// "45 mins") into total minutes.
export function parseDurationText(durationText: string): number | null {
  const hourMatch = durationText.match(/(\d+)\s*hour/);
  const minMatch = durationText.match(/(\d+)\s*min/);
  if (!hourMatch && !minMatch) return null;
  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
  const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
  return hours * 60 + mins;
}

// Prefers the traffic-adjusted duration Google returns when departure_time
// is set; falls back to the plain duration if traffic data isn't available
// for this route (happens occasionally, e.g. transit-only areas).
function bestDuration(element: any): string | null {
  return element?.duration_in_traffic?.text ?? element?.duration?.text ?? null;
}

// Single destination: "lat,lng" or address string. Pass the event's own
// date/time so Google predicts traffic for then, not for right now.
export async function fetchDriveTime(
  destination: string,
  eventDate?: string,
  eventTime?: string | null,
): Promise<string | null> {
  if (!PLACES_KEY || !destination) return null;
  const origin = await getUserOrigin();
  if (!origin) return null;
  try {
    const departure = toDepartureTimestamp(eventDate, eventTime);
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${encodeURIComponent(destination)}&mode=driving&departure_time=${departure}&key=${PLACES_KEY}`
    );
    const json = await res.json();
    const duration = bestDuration(json.rows?.[0]?.elements?.[0]);
    if (!duration) console.warn('[drivetime] no duration in Distance Matrix response:', json.status, json.rows?.[0]?.elements?.[0]?.status);
    return duration;
  } catch (err) {
    console.warn('[drivetime] fetchDriveTime request failed:', err);
    return null;
  }
}

// Single point-to-point drive time between two address strings (for inter-game travel)
export async function fetchDriveTimeBetween(
  originAddress: string,
  destinationAddress: string,
  eventDate?: string,
  eventTime?: string | null,
): Promise<string | null> {
  if (!PLACES_KEY || !originAddress || !destinationAddress) return null;
  try {
    const departure = toDepartureTimestamp(eventDate, eventTime);
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(originAddress)}&destinations=${encodeURIComponent(destinationAddress)}&mode=driving&departure_time=${departure}&key=${PLACES_KEY}`
    );
    const json = await res.json();
    return bestDuration(json.rows?.[0]?.elements?.[0]);
  } catch {
    return null;
  }
}

// Parallel calls using a saved home address string as origin (for Weekend Outlook)
export async function fetchDriveTimesFromAddress(
  originAddress: string,
  items: Array<{ id: string; location: string; eventDate?: string; eventTime?: string | null }>,
): Promise<Record<string, string>> {
  if (!PLACES_KEY || !items.length || !originAddress) return {};
  const origin = await geocodeAddress(originAddress);
  if (!origin) return {};
  const results = await Promise.all(
    items.map(async d => {
      try {
        const departure = toDepartureTimestamp(d.eventDate, d.eventTime);
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${encodeURIComponent(d.location)}&mode=driving&departure_time=${departure}&key=${PLACES_KEY}`
        );
        const json = await res.json();
        const text = bestDuration(json.rows?.[0]?.elements?.[0]);
        return text ? { id: d.id, t: text } : null;
      } catch {
        return null;
      }
    })
  );
  const map: Record<string, string> = {};
  for (const r of results) { if (r) map[r.id] = r.t; }
  return map;
}

// Parallel individual calls — same origin fetched once, one request per destination
export async function fetchDriveTimes(
  items: Array<{ id: string; location: string; eventDate?: string; eventTime?: string | null }>,
): Promise<Record<string, string>> {
  if (!PLACES_KEY || !items.length) return {};
  const origin = await getUserOrigin();
  if (!origin) return {};
  const results = await Promise.all(
    items.map(async d => {
      try {
        const departure = toDepartureTimestamp(d.eventDate, d.eventTime);
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${encodeURIComponent(d.location)}&mode=driving&departure_time=${departure}&key=${PLACES_KEY}`
        );
        const json = await res.json();
        const text = bestDuration(json.rows?.[0]?.elements?.[0]);
        return text ? { id: d.id, t: text } : null;
      } catch {
        return null;
      }
    })
  );
  const map: Record<string, string> = {};
  for (const r of results) { if (r) map[r.id] = r.t; }
  return map;
}
