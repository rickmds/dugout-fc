const WEATHER_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY ?? '';

export type WeatherData = {
  temp_c: number;
  temp_f: number;
  condition: string;
  icon: string;
  precip_chance: number;
  wind_kph: number;
  wind_mph: number;
};

function conditionToEmoji(text: string, isDay: boolean): string {
  const t = text.toLowerCase();
  if (t.includes('thunder'))                                   return '⛈️';
  if (t.includes('blizzard') || t.includes('snow'))           return '❄️';
  if (t.includes('sleet') || t.includes('freezing'))          return '🌨️';
  if (t.includes('heavy rain') || t.includes('torrential'))   return '🌧️';
  if (t.includes('rain') || t.includes('drizzle') || t.includes('shower')) return '🌦️';
  if (t.includes('fog') || t.includes('mist') || t.includes('haze'))       return '🌫️';
  if (t.includes('overcast'))                                  return '☁️';
  if (t.includes('cloudy'))                                    return '⛅';
  if (t.includes('partly') || t.includes('partial'))          return '⛅';
  if (t.includes('sunny') || t.includes('clear'))             return isDay ? '☀️' : '🌙';
  return '🌡️';
}

// location: "lat,lng" string OR an address / place name — WeatherAPI handles both
export async function fetchEventWeather(
  location: string,
  eventDate: string,   // YYYY-MM-DD
  eventTime: string | null,
): Promise<WeatherData | null> {
  if (!WEATHER_KEY || !location) return null;
  try {
    const q = encodeURIComponent(location);
    const todayStr = new Date().toISOString().split('T')[0];

    if (eventDate === todayStr) {
      // forecast.json with dt=today is unreliable — use current conditions instead
      const res = await fetch(`https://api.weatherapi.com/v1/current.json?key=${WEATHER_KEY}&q=${q}&aqi=no`);
      if (!res.ok) return null;
      const json = await res.json();
      const cur = json.current;
      if (!cur) return null;
      const conditionText: string = cur.condition?.text ?? '';
      return {
        temp_c: Math.round(cur.temp_c),
        temp_f: Math.round(cur.temp_f),
        condition: conditionText,
        icon: conditionToEmoji(conditionText, cur.is_day === 1),
        precip_chance: 0,
        wind_kph: Math.round(cur.wind_kph),
        wind_mph: Math.round(cur.wind_mph),
      };
    }

    // Future event: use forecast.json. The hours array is indexed 0-23 by hour of day.
    const targetHour = eventTime ? parseInt(eventTime.split(':')[0], 10) : 12;
    const res = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_KEY}&q=${q}&dt=${eventDate}&aqi=no`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const hours: Record<string, number | string | { text: string }>[] = json.forecast?.forecastday?.[0]?.hour ?? [];
    const hour = hours[targetHour] ?? hours[12];
    if (!hour) return null;
    const conditionText: string = (hour.condition as { text: string })?.text ?? '';
    return {
      temp_c: Math.round(hour.temp_c as number),
      temp_f: Math.round(hour.temp_f as number),
      condition: conditionText,
      icon: conditionToEmoji(conditionText, hour.is_day === 1),
      precip_chance: (hour.chance_of_rain as number) ?? 0,
      wind_kph: Math.round(hour.wind_kph as number),
      wind_mph: Math.round(hour.wind_mph as number),
    };
  } catch {
    return null;
  }
}

// WeatherAPI free plan: 3-day forecast
export function isWeatherForecastable(eventDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const evDate = new Date(eventDate + 'T00:00:00');
  const diffDays = (evDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 3;
}
