import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

// How long a disconnected reading has to persist before we actually tell
// the user — a brief blip (a cold-start reachability probe still settling,
// a momentary wifi/cell handoff) shouldn't flash the banner; only a real,
// sustained drop should.
const OFFLINE_DEBOUNCE_MS = 4000;

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const offlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      // isConnected is a radio-level check ("is the device attached to a
      // network interface") — on one bar of signal a phone reads as fully
      // "connected" while requests actually time out or fail, so the
      // offline banner never appeared in exactly the scenario it exists
      // for. isInternetReachable is an actual reachability probe. Treat
      // `null` (unknown / still probing — normal right when this listener
      // first attaches) the same as connected rather than offline, so the
      // banner doesn't flash on every cold start before NetInfo has had a
      // chance to resolve reachability.
      const rawConnected = state.isInternetReachable !== false;

      if (rawConnected) {
        // Reconnecting (or never dropped) — reflect it immediately, no
        // reason to make the user wait for good news, and cancel any
        // pending "go offline" timer from a blip that's since recovered.
        if (offlineTimer.current) { clearTimeout(offlineTimer.current); offlineTimer.current = null; }
        setIsConnected(true);
        return;
      }

      // Only start a debounce timer if one isn't already running — a
      // string of repeated "still offline" events (NetInfo can fire more
      // than once per real state) shouldn't each restart the clock.
      if (!offlineTimer.current) {
        offlineTimer.current = setTimeout(() => {
          offlineTimer.current = null;
          setIsConnected(false);
        }, OFFLINE_DEBOUNCE_MS);
      }
    });
    return () => {
      unsub();
      if (offlineTimer.current) clearTimeout(offlineTimer.current);
    };
  }, []);

  return { isConnected };
}
