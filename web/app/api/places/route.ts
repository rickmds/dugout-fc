import { NextRequest, NextResponse } from 'next/server';

const KEY = process.env.GOOGLE_PLACES_KEY ?? '';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const input    = searchParams.get('input');
  const placeId  = searchParams.get('place_id');

  if (!KEY) return NextResponse.json({ error: 'no key' }, { status: 500 });

  if (placeId) {
    const res  = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry,name&key=${KEY}`
    );
    const json = await res.json();
    return NextResponse.json(json);
  }

  if (input) {
    // No `types` restriction — matches the mobile app's query exactly.
    // types=geocode (the old value here) excludes "establishment" results,
    // which is what a named venue like a sports field is classified as, so
    // it silently fell back to loosely-matched street addresses instead.
    const res  = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${KEY}&components=country:us`
    );
    const json = await res.json();
    return NextResponse.json(json);
  }

  return NextResponse.json({ error: 'missing input or place_id' }, { status: 400 });
}
