import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { geocodeAddress } from '../lib/drivetime';

// Tournaments only ever stored a free-text `location` — no coordinates to
// center a satellite thumbnail on. If lat/lng are already saved, use them
// immediately; otherwise geocode the location text once and cache the
// result back onto the row, so every later view of this tournament (by
// anyone) renders the map instantly instead of re-geocoding every time.
// The write-back is best-effort: tournaments_update requires
// is_team_coach, so a parent viewing this just re-geocodes next time
// instead of erroring — the map still shows either way.
export function useTournamentCoords(
  tournamentId: string,
  location: string | null,
  lat: number | null,
  lng: number | null,
): { lat: number; lng: number } | null {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    lat != null && lng != null ? { lat, lng } : null
  );

  useEffect(() => {
    if (lat != null && lng != null) {
      setCoords({ lat, lng });
      return;
    }
    if (!location) {
      setCoords(null);
      return;
    }
    let cancelled = false;
    geocodeAddress(location).then((result) => {
      if (cancelled || !result) return;
      const [gLat, gLng] = result.split(',').map(Number);
      if (Number.isNaN(gLat) || Number.isNaN(gLng)) return;
      setCoords({ lat: gLat, lng: gLng });
      supabase.from('tournaments').update({ lat: gLat, lng: gLng }).eq('id', tournamentId)
        .then(() => {}, () => {});
    });
    return () => { cancelled = true; };
  }, [tournamentId, location, lat, lng]);

  return coords;
}
