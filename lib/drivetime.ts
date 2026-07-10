import * as Location from 'expo-location';

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';

async function getUserOrigin(): Promise<string | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return `${pos.coords.latitude},${pos.coords.longitude}`;
  } catch {
    return null;
  }
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

// Single destination: "lat,lng" or address string
export async function fetchDriveTime(destination: string): Promise<string | null> {
  if (!PLACES_KEY || !destination) return null;
  const origin = await getUserOrigin();
  if (!origin) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${encodeURIComponent(destination)}&mode=driving&key=${PLACES_KEY}`
    );
    const json = await res.json();
    return json.rows?.[0]?.elements?.[0]?.duration?.text ?? null;
  } catch {
    return null;
  }
}

// Single point-to-point drive time between two address strings (for inter-game travel)
export async function fetchDriveTimeBetween(
  originAddress: string,
  destinationAddress: string,
): Promise<string | null> {
  if (!PLACES_KEY || !originAddress || !destinationAddress) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(originAddress)}&destinations=${encodeURIComponent(destinationAddress)}&mode=driving&key=${PLACES_KEY}`
    );
    const json = await res.json();
    return json.rows?.[0]?.elements?.[0]?.duration?.text ?? null;
  } catch {
    return null;
  }
}

// Parallel calls using a saved home address string as origin (for Weekend Outlook)
export async function fetchDriveTimesFromAddress(
  originAddress: string,
  items: Array<{ id: string; location: string }>,
): Promise<Record<string, string>> {
  if (!PLACES_KEY || !items.length || !originAddress) return {};
  const origin = await geocodeAddress(originAddress);
  if (!origin) return {};
  const results = await Promise.all(
    items.map(async d => {
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${encodeURIComponent(d.location)}&mode=driving&key=${PLACES_KEY}`
        );
        const json = await res.json();
        const text = json.rows?.[0]?.elements?.[0]?.duration?.text;
        return text ? { id: d.id, t: text as string } : null;
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
  items: Array<{ id: string; location: string }>,
): Promise<Record<string, string>> {
  if (!PLACES_KEY || !items.length) return {};
  const origin = await getUserOrigin();
  if (!origin) return {};
  const results = await Promise.all(
    items.map(async d => {
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${encodeURIComponent(d.location)}&mode=driving&key=${PLACES_KEY}`
        );
        const json = await res.json();
        const text = json.rows?.[0]?.elements?.[0]?.duration?.text;
        return text ? { id: d.id, t: text as string } : null;
      } catch {
        return null;
      }
    })
  );
  const map: Record<string, string> = {};
  for (const r of results) { if (r) map[r.id] = r.t; }
  return map;
}
