import * as Location from 'expo-location';
import { zonedTimeToUtc } from './timezone';

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
function toDepartureTimestamp(eventDate: string | undefined, eventTime: string | null | undefined, timezone: string): number {
  const nowSec = Math.floor(Date.now() / 1000);
  if (!eventDate) return nowSec;
  try {
    // Anchored to the club's own timezone, not this device's — otherwise a
    // parent traveling in a different timezone than their club gets traffic
    // predicted for the wrong actual moment.
    const target = zonedTimeToUtc(eventDate, `${eventTime ?? '12:00'}:00`, timezone);
    const targetSec = Math.floor(target.getTime() / 1000);
    return Number.isFinite(targetSec) ? Math.max(targetSec, nowSec) : nowSec;
  } catch {
    // Bad/unresolvable date, time, or timezone -- predicting for "now" beats
    // giving up on the drive time estimate entirely.
    return nowSec;
  }
}

// The paid "Advanced" Distance Matrix tier (triggered by sending
// departure_time at all) only gets requested within this window of the
// actual departure. Google's traffic-predicted duration is pattern-based
// for any future departure_time — it doesn't get progressively more "live"
// the closer departure gets, except right near the actual moment, where
// current observed conditions genuinely factor in. A prediction for 2
// hours from now and one for 2 weeks from now are both just historical
// pattern estimates, so there's no real accuracy to trade away by using
// the cheaper Basic tier outside this short window — only a departure
// that's essentially imminent benefits from the live-influenced number.
const ADVANCED_TIER_WINDOW_SEC = 2 * 60 * 60;

function resolveDeparture(eventDate: string | undefined, eventTime: string | null | undefined, timezone: string): { departure: number; useAdvanced: boolean } {
  const departure = toDepartureTimestamp(eventDate, eventTime, timezone);
  const nowSec = Math.floor(Date.now() / 1000);
  return { departure, useAdvanced: departure - nowSec <= ADVANCED_TIER_WINDOW_SEC };
}

// In-memory only (resets on app restart) — still covers the dominant cost
// pattern, which is the same handful of results being re-requested
// repeatedly within one session (switching tabs back and forth, pulling to
// refresh, returning to Home). Departure time is rounded to the nearest 15
// minutes for the cache key only — the real API call still uses the precise
// timestamp — so two lookups a few minutes apart hit the same entry instead
// of missing on a technicality.
type CacheEntry = { duration: string; expiresAt: number };
const driveTimeCache = new Map<string, CacheEntry>();
const DRIVE_TIME_TTL_MS = 45 * 60 * 1000;

function roundOrigin(origin: string): string {
  const [lat, lng] = origin.split(',').map(Number);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return origin;
  // ~1.1km grid at mid-latitudes — far finer than a drive-time estimate
  // needs, but stable across the small GPS jitter between repeat reads of
  // an otherwise-stationary device.
  return `${Math.round(lat * 100) / 100},${Math.round(lng * 100) / 100}`;
}

function driveTimeCacheKey(origin: string, destination: string, departure: number, useAdvanced: boolean): string {
  const roundedDeparture = Math.round(departure / 900) * 900;
  return `${roundOrigin(origin)}|${destination}|${roundedDeparture}|${useAdvanced ? 'adv' : 'basic'}`;
}

function getCachedDuration(key: string): string | null {
  const entry = driveTimeCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { driveTimeCache.delete(key); return null; }
  return entry.duration;
}

function setCachedDuration(key: string, duration: string) {
  driveTimeCache.set(key, { duration, expiresAt: Date.now() + DRIVE_TIME_TTL_MS });
}

// Prefers the traffic-adjusted duration Google returns when departure_time
// is set; falls back to the plain duration if traffic data isn't available
// for this route (happens occasionally, e.g. transit-only areas) or wasn't
// requested at all (events outside the Advanced-tier window).
function bestDuration(element: any): string | null {
  return element?.duration_in_traffic?.text ?? element?.duration?.text ?? null;
}

// The one place every public function below actually calls Google — cached
// and tiered, so all four call sites get both behaviors uniformly instead
// of each needing its own copy of this logic.
async function distanceMatrixLookup(
  origin: string,
  destination: string,
  eventDate?: string,
  eventTime?: string | null,
  timezone: string = 'America/New_York',
): Promise<string | null> {
  if (!PLACES_KEY || !origin || !destination) return null;
  const { departure, useAdvanced } = resolveDeparture(eventDate, eventTime, timezone);
  const key = driveTimeCacheKey(origin, destination, departure, useAdvanced);
  const cached = getCachedDuration(key);
  if (cached) return cached;
  try {
    const departureParam = useAdvanced ? `&departure_time=${departure}` : '';
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving${departureParam}&key=${PLACES_KEY}`
    );
    const json = await res.json();
    const duration = bestDuration(json.rows?.[0]?.elements?.[0]);
    if (duration) setCachedDuration(key, duration);
    else console.warn('[drivetime] no duration in Distance Matrix response:', json.status, json.rows?.[0]?.elements?.[0]?.status);
    return duration;
  } catch (err) {
    console.warn('[drivetime] distance matrix request failed:', err);
    return null;
  }
}

// Resolve a venue name / address to "lat,lng" using Google Geocoding.
// Cached with a long TTL — a venue's address is effectively static, so
// there's no reason to pay for the same geocode twice in one app session.
const geocodeCache = new Map<string, { latLng: string | null; expiresAt: number }>();
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;

export async function geocodeAddress(query: string): Promise<string | null> {
  if (!PLACES_KEY || !query) return null;
  const cached = geocodeCache.get(query);
  if (cached && Date.now() < cached.expiresAt) return cached.latLng;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${PLACES_KEY}`
    );
    const json = await res.json();
    const loc = json.results?.[0]?.geometry?.location;
    const latLng = loc ? `${loc.lat},${loc.lng}` : null;
    geocodeCache.set(query, { latLng, expiresAt: Date.now() + GEOCODE_TTL_MS });
    return latLng;
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

// Single destination: "lat,lng" or address string. Pass the event's own
// date/time so Google predicts traffic for then, not for right now.
export async function fetchDriveTime(
  destination: string,
  eventDate?: string,
  eventTime?: string | null,
  timezone: string = 'America/New_York',
): Promise<string | null> {
  if (!destination) return null;
  const origin = await getUserOrigin();
  if (!origin) return null;
  return distanceMatrixLookup(origin, destination, eventDate, eventTime, timezone);
}

// Single point-to-point drive time between two address strings (for inter-game travel)
export async function fetchDriveTimeBetween(
  originAddress: string,
  destinationAddress: string,
  eventDate?: string,
  eventTime?: string | null,
  timezone: string = 'America/New_York',
): Promise<string | null> {
  if (!originAddress || !destinationAddress) return null;
  return distanceMatrixLookup(originAddress, destinationAddress, eventDate, eventTime, timezone);
}

// Parallel calls using a saved home address string as origin (for Weekend Outlook)
export async function fetchDriveTimesFromAddress(
  originAddress: string,
  items: Array<{ id: string; location: string; eventDate?: string; eventTime?: string | null }>,
  timezone: string = 'America/New_York',
): Promise<Record<string, string>> {
  if (!PLACES_KEY || !items.length || !originAddress) return {};
  const origin = await geocodeAddress(originAddress);
  if (!origin) return {};
  const results = await Promise.all(
    items.map(async d => {
      const text = await distanceMatrixLookup(origin, d.location, d.eventDate, d.eventTime, timezone);
      return text ? { id: d.id, t: text } : null;
    })
  );
  const map: Record<string, string> = {};
  for (const r of results) { if (r) map[r.id] = r.t; }
  return map;
}

// Parallel individual calls — same origin fetched once, one request per destination
export async function fetchDriveTimes(
  items: Array<{ id: string; location: string; eventDate?: string; eventTime?: string | null }>,
  timezone: string = 'America/New_York',
): Promise<Record<string, string>> {
  if (!PLACES_KEY || !items.length) return {};
  const origin = await getUserOrigin();
  if (!origin) return {};
  const results = await Promise.all(
    items.map(async d => {
      const text = await distanceMatrixLookup(origin, d.location, d.eventDate, d.eventTime, timezone);
      return text ? { id: d.id, t: text } : null;
    })
  );
  const map: Record<string, string> = {};
  for (const r of results) { if (r) map[r.id] = r.t; }
  return map;
}
