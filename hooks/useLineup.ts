import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GameFormat,
  Formation,
  DEFAULT_FAVOURITES,
  DEFAULT_FORMATION_PER_FORMAT,
  FORMATIONS_BY_FORMAT,
  detectFormat,
  getFormationById,
} from '../constants/formations';

const FAV_STORAGE_KEY = 'pulse_favourite_formations';

export function useLineup(teamAgeGroup?: string | null) {
  const [format, setFormat] = useState<GameFormat>(() => detectFormat(teamAgeGroup));
  const [selectedFormationId, setSelectedFormationId] = useState<string>(
    () => DEFAULT_FORMATION_PER_FORMAT[detectFormat(teamAgeGroup)]
  );

  // Re-detect format when teamAgeGroup first loads (it starts undefined, then resolves async)
  useEffect(() => {
    if (!teamAgeGroup) return;
    const detected = detectFormat(teamAgeGroup);
    setFormat(detected);
    // Only reset selected formation if it belongs to the wrong format
    setSelectedFormationId(prev => {
      const current = getFormationById(prev);
      if (current && current.format === detected) return prev;
      return DEFAULT_FORMATION_PER_FORMAT[detected];
    });
  }, [teamAgeGroup]);
  const [favourites, setFavourites] = useState<string[]>(DEFAULT_FAVOURITES);
  const [favsLoaded, setFavsLoaded] = useState(false);

  // Load favourites from AsyncStorage on first call
  const loadFavourites = useCallback(async () => {
    if (favsLoaded) return;
    try {
      const stored = await AsyncStorage.getItem(FAV_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFavourites(parsed as string[]);
        }
      }
    } catch {
      // keep defaults
    } finally {
      setFavsLoaded(true);
    }
  }, [favsLoaded]);

  const toggleFavourite = useCallback(async (id: string) => {
    setFavourites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      AsyncStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  function changeFormat(next: GameFormat) {
    setFormat(next);
    // Switch to the default formation for the new format
    setSelectedFormationId(DEFAULT_FORMATION_PER_FORMAT[next]);
  }

  const selectedFormation: Formation | undefined = getFormationById(selectedFormationId);
  const formationsForFormat: Formation[] = FORMATIONS_BY_FORMAT[format];
  const favouriteFormations: Formation[] = favourites
    .map((id) => getFormationById(id))
    .filter((f): f is Formation => f !== undefined);

  return {
    format,
    setFormat: changeFormat,
    selectedFormationId,
    setSelectedFormationId,
    selectedFormation,
    formationsForFormat,
    favourites,
    favouriteFormations,
    toggleFavourite,
    loadFavourites,
  };
}
