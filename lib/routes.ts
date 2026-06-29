const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY!;

type Waypoint = { lat: number; lng: number } | string;

function toWaypoint(loc: Waypoint) {
  return typeof loc === 'string'
    ? { address: loc }
    : { location: { latLng: { latitude: loc.lat, longitude: loc.lng } } };
}

export async function getDrivingMinutes(origin: Waypoint, destination: Waypoint): Promise<number | null> {
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_KEY,
        'X-Goog-FieldMask': 'routes.duration',
      },
      body: JSON.stringify({
        origin: toWaypoint(origin),
        destination: toWaypoint(destination),
        travelMode: 'DRIVE',
      }),
    });
    const data = await res.json();
    const secs = parseInt(data.routes?.[0]?.duration ?? '0');
    return secs > 0 ? Math.ceil(secs / 60) : null;
  } catch {
    return null;
  }
}
