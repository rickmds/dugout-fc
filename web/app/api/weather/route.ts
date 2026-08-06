import { NextRequest, NextResponse } from 'next/server';

const KEY = process.env.WEATHER_API_KEY ?? '';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  if (!lat || !lng || !KEY) return NextResponse.json({ error: 'missing' }, { status: 400 });

  const res = await fetch(
    `https://api.weatherapi.com/v1/forecast.json?key=${KEY}&q=${lat},${lng}&days=3&aqi=no`,
    { next: { revalidate: 1800 } }
  );
  if (!res.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 });
  const data = await res.json();
  return NextResponse.json(data);
}
