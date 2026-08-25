import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);

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
      setIsConnected(state.isInternetReachable !== false);
    });
    return unsub;
  }, []);

  return { isConnected };
}
