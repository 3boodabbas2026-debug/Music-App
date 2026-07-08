import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { API_BASE_URL } from '../config';

const POLL_MS = 20000;
const TIMEOUT_MS = 4000;

/**
 * Two distinct signals, because they fail independently:
 *  - `networkOnline`: does this device have a network path at all? Reactive
 *    on web via the browser's online/offline events; native has no free
 *    equivalent without adding a NetInfo dependency, so it stays `true`
 *    there and the health poll below is what actually catches "no network".
 *  - `backendOnline`: is *our* API reachable right now (server awake, not
 *    just "the internet works")? Polled, since there's no push signal.
 */
export function useOnlineStatus() {
  const [networkOnline, setNetworkOnline] = useState(
    Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const goOnline = () => setNetworkOnline(true);
    const goOffline = () => setNetworkOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function ping() {
      if (inFlight.current) return;
      inFlight.current = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
        if (alive) setBackendOnline(res.ok);
      } catch {
        if (alive) setBackendOnline(false);
      } finally {
        clearTimeout(timer);
        inFlight.current = false;
      }
    }

    ping();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') ping();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') ping();
    });

    return () => {
      alive = false;
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  return { networkOnline, backendOnline, isOnline: networkOnline && backendOnline !== false };
}
