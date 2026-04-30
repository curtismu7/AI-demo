import { useEffect, useRef } from 'react';
import { useTokenChainOptional } from '../context/TokenChainContext';

/**
 * Hook to seed the token chain panel with the real decoded session token on
 * dashboard load. Fetches from /api/tokens/session-preview which decodes the
 * actual PingOne JWT from the BFF session — gives real sub (UUID), aud, scope,
 * and jwtFullDecode for the inspector. Replaces the old approach of building a
 * synthetic event from /api/auth/oauth/user/status which only had the local DB
 * user.id (sequential integer) as sub and no jwtFullDecode.
 */
export function useCurrentUserTokenEvent() {
  const tokenChain = useTokenChainOptional();
  // Use a ref so the effect closure always has the latest context methods
  // without adding them to the dependency array (which would cause an
  // infinite loop: setSessionToken → new context value → effect re-runs).
  const tokenChainRef = useRef(tokenChain);
  useEffect(() => { tokenChainRef.current = tokenChain; });

  useEffect(() => {
    if (!tokenChainRef.current) return;

    let isMounted = true;

    const fetchSessionToken = async () => {
      try {
        const res = await fetch('/api/tokens/session-preview', { credentials: 'include', _silent: true });
        if (!isMounted || !res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        if (Array.isArray(data.tokenEvents) && data.tokenEvents.length > 0) {
          // Push the first event (user-token) as the session token so the
          // token chain panel shows the real decoded JWT.
          tokenChainRef.current?.setSessionToken(data.tokenEvents[0]);
        }
      } catch (err) {
        console.debug('[useCurrentUserTokenEvent] Could not fetch session token:', err?.message);
      }
    };

    fetchSessionToken();

    return () => {
      isMounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
