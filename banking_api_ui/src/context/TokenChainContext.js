// banking_api_ui/src/context/TokenChainContext.js
//
// Shares live RFC 8693 token chain events across the UI.
// Events are produced by callMcpTool() (bankingAgentService) and consumed by
// TokenChainPanel and BankingAgent (inline chat messages).
// Also provides resolvedIdentity — friendly user/actor labels derived from the
// current BFF session, cached here so all token surfaces share one fetch.
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { isTokenChainRoute } from '../utils/embeddedAgentFabVisibility';
import { postAppEvent } from '../services/appEventClient';

const TokenChainContext = createContext(null);

const TOKEN_CHAIN_HISTORY_KEY = 'tokenChainHistory';

export function TokenChainProvider({ children, activePath = "" }) {
  // Array of token event objects — latest tool call only (replaced on each call)
  const [events, setEvents] = useState([]);
  // Current session token event — shown when no tool events (e.g., on dashboard load)
  const [sessionTokenEvent, setSessionTokenEvent] = useState(null);
  // MCP tool call delegation trail (fetched from /api/token-chain)
  const [mcpToolCalls, setMCPToolCalls] = useState([]);
  // Current BFF token validation mode ('introspection' | 'jwt' | null)
  const [validationMode, setValidationMode] = useState(null);
  // Resolved identity — friendly user/actor names derived from current BFF session.
  // { currentUser: { sub, name, email } | null, knownClients: { [clientId]: label } }
  const [resolvedIdentity, setResolvedIdentity] = useState(null);
  // History: array of { tool, timestamp, events[] } — hydrated from localStorage on mount
  const [history, setHistory] = useState(() => {
    try {
      const stored = localStorage.getItem(TOKEN_CHAIN_HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Write-through to localStorage (debounced 300ms to avoid thrashing on rapid tool calls)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(TOKEN_CHAIN_HISTORY_KEY, JSON.stringify(history));
      } catch (e) {
        console.warn('[TokenChain] localStorage write failed:', e.message);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [history]);

  /**
   * Called by bankingAgentService after each MCP tool call.
   * Replaces current events and prepends to history.
   */
  const setTokenEvents = useCallback((tool, newEvents) => {
    if (!Array.isArray(newEvents) || newEvents.length === 0) { return; }
    // Always persist to history so it's available when the user navigates to a token-chain page.
    setHistory(prev => [
      { tool, timestamp: new Date().toISOString(), events: newEvents },
      ...prev.slice(0, 19),
    ]);
    // Only update the live events display on token-chain pages to avoid unnecessary re-renders.
    if (!isTokenChainRoute(activePath)) { return; }
    setEvents(newEvents);
    setSessionTokenEvent(null);
  }, [activePath]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  /** Set the current user session token event (shown on dashboard before any tool calls). */
  const setSessionToken = useCallback((tokenEvent) => {
    setSessionTokenEvent(tokenEvent);
  }, []);

  /** Clears history from both state and localStorage (called on logout). */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setEvents([]);
    setSessionTokenEvent(null);
    setMCPToolCalls([]);
    try { localStorage.removeItem(TOKEN_CHAIN_HISTORY_KEY); } catch {}
  }, []);

  // Fetch MCP tool calls from /api/token-chain — only after authentication and
  // only on routes that actually render token-chain UI.
  useEffect(() => {
    let cancelled = false;
    let pollInterval = null;

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const fetchMCPToolCalls = async () => {
      if (!isTokenChainRoute(activePath)) {
        stopPolling();
        return;
      }
      try {
        postAppEvent('token_exchange', 'info', 'Token exchange in flight', { tag: 'token_exchange/frontend-exchange-start' });
        const res = await fetch('/api/token-chain', { credentials: 'include', _silent: true });
        if (!res.ok) return;
        const data = await res.json();
        postAppEvent('token_exchange', 'info', 'Token exchange complete', { tag: 'token_exchange/frontend-exchange-end' });
        if (!cancelled) {
          setMCPToolCalls(data.mcpToolCallsChain || []);
          if (data.validationMode) setValidationMode(data.validationMode);
        }
      } catch {
        // Silently fail — user may not be authenticated
      }
    };

    const startPolling = () => {
      if (!isTokenChainRoute(activePath)) {
        stopPolling();
        return;
      }
      void fetchMCPToolCalls();
      if (!pollInterval) pollInterval = setInterval(fetchMCPToolCalls, 15000);
    };

    const syncPollingForRoute = () => {
      if (isTokenChainRoute(activePath)) {
        startPolling();
      } else {
        stopPolling();
      }
    };

    // Only start polling after confirming authentication to avoid 401 noise.
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.authenticated && !cancelled) syncPollingForRoute(); })
      .catch(() => {});

    window.addEventListener('userAuthenticated', startPolling);

    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener('userAuthenticated', startPolling);
    };
  }, [activePath]);

  // Real-time MCP result updates via SSE — prepend new result immediately so the
  // MCP Results tab updates without waiting for the 15-second poll cycle.
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      if (!data || !data.toolName) return;
      setMCPToolCalls(prev => [{
        id: `sse-${Date.now()}`,
        timestamp: data.timestamp || new Date().toISOString(),
        toolName: data.toolName,
        status: data.status || 'success',
        duration: data.duration || 0,
        chainIndex: prev.length,
        isDelegated: !!data.isDelegated,
        scopes: [],
        resultJson: data.resultJson || null,
        resultSummary: data.resultSummary || null,
      }, ...prev]);
    };
    window.addEventListener('mcp-tool-result-sse', handler);
    return () => window.removeEventListener('mcp-tool-result-sse', handler);
  }, []);

  /** Fetch resolved identity once on mount (and on re-auth). Shared across all token surfaces. */
  const loadResolvedIdentity = useCallback(async () => {
    try {
      // Check session first; only load config if authenticated to avoid 401 loop
      const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
      if (!sessionRes.ok) {
        // Not authenticated — skip config to avoid 401 loop
        setResolvedIdentity({ currentUser: null, knownClients: {} });
        return;
      }
      const configRes = await fetch('/api/pingone-test/config', { credentials: 'include' });
      const sessionData = await sessionRes.json();
      const configData  = configRes.ok  ? await configRes.json()  : null;
      const identity = { currentUser: null, knownClients: {} };
      if (sessionData?.authenticated && sessionData.user) {
        const u = sessionData.user;
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.username || '';
        identity.currentUser = { sub: u.id, name, email: u.email };
      }
      if (configData) {
        const clientLabels = {
          adminClientId:             'Super Banking BFF (Admin)',
          userClientId:              'Super Banking BFF (User)',
          mcpTokenExchangerClientId: 'MCP Token Exchanger',
          aiAgentClientId:           'AI Agent',
        };
        for (const [key, label] of Object.entries(clientLabels)) {
          const id = configData[key];
          if (id) identity.knownClients[id] = label;
        }
      }
      setResolvedIdentity(identity);
    } catch { /* non-fatal — falls back to raw UUIDs */ }
  }, []);

  useEffect(() => {
    void loadResolvedIdentity();
  }, [loadResolvedIdentity]);

  // Re-fetch identity after login (e.g., session expiry re-auth)
  useEffect(() => {
    const onAuth = () => void loadResolvedIdentity();
    window.addEventListener('userAuthenticated', onAuth);
    return () => window.removeEventListener('userAuthenticated', onAuth);
  }, [loadResolvedIdentity]);

  const value = useMemo(
    () => {
      // Use tool events if available, otherwise show session token
      const displayEvents = events.length > 0 ? events : (sessionTokenEvent ? [sessionTokenEvent] : []);
      return { events: displayEvents, history, mcpToolCalls, validationMode, resolvedIdentity, setTokenEvents, clearEvents, setSessionToken, clearHistory };
    },
    [events, sessionTokenEvent, history, mcpToolCalls, validationMode, resolvedIdentity, setTokenEvents, clearEvents, setSessionToken, clearHistory]
  );

  return (
    <TokenChainContext.Provider value={value}>
      {children}
    </TokenChainContext.Provider>
  );
}

export function useTokenChain() {
  const ctx = useContext(TokenChainContext);
  if (!ctx) {
    throw new Error('useTokenChain must be used within TokenChainProvider');
  }
  return ctx;
}

/** Safe hook — returns null outside provider (e.g. tests) */
export function useTokenChainOptional() {
  return useContext(TokenChainContext);
}
