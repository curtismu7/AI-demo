import { useEffect } from 'react';
import bffAxios from '../services/bffAxios';
import { useTokenChainOptional } from '../context/TokenChainContext';

/**
 * Hook to fetch current user token info from session on dashboard load
 * and display it in the token chain.
 */
export function useCurrentUserTokenEvent() {
  const tokenChain = useTokenChainOptional();

  useEffect(() => {
    if (!tokenChain) return; // Not in TokenChainProvider scope
    
    let isMounted = true;

    const fetchSessionToken = async () => {
      try {
        const res = await bffAxios.get('/api/auth/oauth/user/status');
        if (!isMounted) return;

        const { authenticated, user, oauthProvider } = res.data;
        if (!authenticated || !user) return;

        // Create a token event representing the current user session
        const sessionEvent = {
          id: 'session-user-token',
          label: `User access token — ${user.email}`,
          status: 'active',
          claims: {
            sub: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`.trim() || user.username,
          },
          explanation: `You are currently authenticated with ${oauthProvider || 'PingOne'}. ` +
            `This is your user access token stored securely in the Backend-for-Frontend (BFF) session. ` +
            `Click "Inspect" to decode the full JWT claims and perform an RFC 8693 token exchange to the MCP server.`,
          rfc: 'RFC 7519 · RFC 9068',
        };

        tokenChain.setSessionToken(sessionEvent);
      } catch (err) {
        console.debug('[useCurrentUserTokenEvent] Could not fetch session token:', err?.message);
        // Silent fail — user might not be authenticated or API might be down
      }
    };

    fetchSessionToken();

    return () => {
      isMounted = false;
    };
  }, [tokenChain]);
}
