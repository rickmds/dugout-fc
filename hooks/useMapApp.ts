import { useState, useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MapApp = 'apple' | 'google' | 'waze';

export type MapTarget = {
  query: string;
  lat?: number | null;
  lng?: number | null;
};

const STORAGE_KEY = 'pulse_preferred_map_app_v2';

function buildUrl(app: MapApp, target: MapTarget): string {
  const hasCoords = target.lat != null && target.lng != null;
  const encoded = encodeURIComponent(target.query);
  const coords = hasCoords ? `${target.lat},${target.lng}` : null;

  switch (app) {
    case 'apple':
      return hasCoords
        ? `maps://?ll=${coords}&q=${encoded}`
        : `maps://?q=${encoded}`;
    case 'google':
      return hasCoords
        ? `comgooglemaps://?daddr=${coords}`
        : `comgooglemaps://?q=${encoded}`;
    case 'waze':
      return hasCoords
        ? `waze://?ll=${coords}&navigate=yes`
        : `waze://?q=${encoded}&navigate=yes`;
  }
}

function buildFallbackUrl(app: MapApp, target: MapTarget): string {
  const encoded = encodeURIComponent(
    target.lat != null && target.lng != null
      ? `${target.lat},${target.lng}`
      : target.query
  );
  switch (app) {
    case 'apple':   return `https://maps.apple.com/?q=${encoded}`;
    case 'google':  return `https://maps.google.com/?q=${encoded}`;
    case 'waze':    return `https://waze.com/ul?q=${encoded}`;
  }
}

function openWithApp(app: MapApp, target: MapTarget) {
  const url = buildUrl(app, target);
  Linking.openURL(url).catch(() =>
    Linking.openURL(buildFallbackUrl(app, target))
  );
}

export function useMapApp() {
  const [preference, setPreference] = useState<MapApp | null>(null);
  const [prefLoaded, setPrefLoaded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<MapTarget | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === 'apple' || val === 'google' || val === 'waze') {
        setPreference(val);
      }
      setPrefLoaded(true);
    });
  }, []);

  // Process any tap that arrived before AsyncStorage finished loading
  useEffect(() => {
    if (!prefLoaded || !pendingTarget || showPicker) return;
    if (Platform.OS !== 'ios') {
      openWithApp('google', pendingTarget);
      setPendingTarget(null);
      return;
    }
    if (preference) {
      openWithApp(preference, pendingTarget);
      setPendingTarget(null);
    } else {
      setShowPicker(true);
    }
  }, [prefLoaded]);

  function open(target: MapTarget) {
    if (!prefLoaded) {
      setPendingTarget(target);
      return;
    }
    if (Platform.OS !== 'ios') {
      openWithApp('google', target);
      return;
    }
    if (preference) {
      openWithApp(preference, target);
    } else {
      setPendingTarget(target);
      setShowPicker(true);
    }
  }

  function confirm(app: MapApp, remember: boolean) {
    if (remember) {
      AsyncStorage.setItem(STORAGE_KEY, app);
      setPreference(app);
    }
    setShowPicker(false);
    if (pendingTarget) openWithApp(app, pendingTarget);
    setPendingTarget(null);
  }

  function dismiss() {
    setShowPicker(false);
    setPendingTarget(null);
  }

  function clearPreference() {
    AsyncStorage.removeItem(STORAGE_KEY);
    setPreference(null);
  }

  return { open, showPicker, confirm, dismiss, preference, clearPreference };
}
