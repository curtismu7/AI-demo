import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { applyThemeTokens } from './applyThemeTokens';

export const VerticalContext = createContext(null);

// Trailing throttle: leading call runs immediately; bursts within `delay` ms
// collapse into one trailing call.
function useTrailingThrottle(fn, delay) {
  const timer = useRef(null);
  const pending = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback((...args) => {
    if (timer.current) { pending.current = true; return; }
    fnRef.current(...args);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (pending.current) { pending.current = false; fnRef.current(...args); }
    }, delay);
  }, [delay]);
}

export function VerticalProvider({ children }) {
  const [state, setState] = useState(null);

  const doFetch = useCallback(async () => {
    try {
      const res = await fetch('/api/verticals/me', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setState(data);
      if (data.pageManifest) {
        applyThemeTokens(data.pageManifest.theme.cssVars);
        document.title = data.pageManifest.identity.documentTitle
          || `${data.pageManifest.identity.displayName} · PingOne AI`;
      }
    } catch (_) {
      // Network errors are silent — SSE will trigger another refetch on the next event.
    }
  }, []);

  const refetch = useTrailingThrottle(doFetch, 250);

  useEffect(() => {
    refetch();
    const es = new EventSource('/api/verticals/stream', { withCredentials: true });
    es.addEventListener('vertical-switched', refetch);
    es.addEventListener('vertical-edited', refetch);
    es.addEventListener('vertical-list-changed', () => {
      window.dispatchEvent(new CustomEvent('vertical-list-changed'));
    });
    return () => es.close();
  }, [refetch]);

  if (!state) return null;
  return (
    <VerticalContext.Provider value={{ ...state, refetch: doFetch }}>
      {children}
    </VerticalContext.Provider>
  );
}
