// banking_api_ui/src/context/TokenChainContext.js
//
// Shares live RFC 8693 token chain events across the UI.
// Events are produced by callMcpTool() (bankingAgentService) and consumed by
// TokenChainPanel and BankingAgent (inline chat messages).
// Also provides resolvedIdentity — friendly user/actor labels derived from the
// current BFF session, cached here so all token surfaces share one fetch.
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import { isTokenChainRoute } from "../utils/embeddedAgentFabVisibility";

const TokenChainContext = createContext(null);

const TOKEN_CHAIN_HISTORY_KEY = "tokenChainHistory";
// Tracks which principal (user sub) owns the persisted history, so a
// different user logging in on the same browser cannot see stale history.
const TOKEN_CHAIN_HISTORY_OWNER_KEY = "tokenChainHistoryOwner";

export function TokenChainProvider({ children, activePath = "" }) {
  // Array of token event objects — latest tool call only (replaced on each call)
  const [events, setEvents] = useState([]);
  // NL routing info for the current request — set before token events arrive (step 0)
  const [nlRoutingEvent, setNlRoutingEventState] = useState(null);
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
        console.warn("[TokenChain] localStorage write failed:", e.message);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [history]);

  /**
   * Called by bankingAgentService after each MCP tool call.
   * Replaces current events and prepends to history.
   *
   * @param {string} tool
   * @param {Array<{ id, label, status, decoded, explanation, credentialPath?, specRef?, ... }>} newEvents
   *   credentialPath: 'oauth_bearer' | 'api_key' | 'dual_token' — Phase 266
   *   When absent, downstream renderers default to 'oauth_bearer'.
   *   specRef: e.g. 'RFC 6750 §3', 'RFC 8693', 'RFC 8693 + draft-ietf-oauth-identity-chaining' — Phase 266 R3
   *   Used by TokenChainDisplay to render spec-citation pills with hover/click explainers.
   */
  const setTokenEvents = useCallback(
    (tool, newEvents) => {
      if (!Array.isArray(newEvents) || newEvents.length === 0) {
        // A real tool call that produced no events (e.g. failed before any
        // step). Do NOT keep the previous call's chain on screen with the
        // live dot — that misrepresents stale data as the current call. Clear
        // the live view; skip the empty history entry (nothing to record).
        if (isTokenChainRoute(activePath)) {
          setEvents([]);
          setSessionTokenEvent(null);
        }
        return;
      }
      // Always persist to history so it's available when the user navigates to a token-chain page.
      setHistory((prev) => [
        { tool, timestamp: new Date().toISOString(), events: newEvents },
        ...prev.slice(0, 19),
      ]);
      // Only update the live events display on token-chain pages to avoid unnecessary re-renders.
      if (!isTokenChainRoute(activePath)) {
        return;
      }
      setEvents(newEvents);
      setSessionTokenEvent(null);
    },
    [activePath],
  );

  const clearEvents = useCallback(() => {
    setEvents([]);
    setNlRoutingEventState(null);
  }, []);

  /** Record the NL routing step (prompt + source + intent) for display as step 0 in the chain. */
  const setNlRoutingEvent = useCallback((event) => {
    setNlRoutingEventState(event);
  }, []);

  /** Set the current user session token event (shown on dashboard before any tool calls). */
  const setSessionToken = useCallback((tokenEvent) => {
    setSessionTokenEvent(tokenEvent);
  }, []);

  /** Clears history from both state and localStorage (called on logout). */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setEvents([]);
    setNlRoutingEventState(null);
    setSessionTokenEvent(null);
    setMCPToolCalls([]);
    try {
      localStorage.removeItem(TOKEN_CHAIN_HISTORY_KEY);
      localStorage.removeItem(TOKEN_CHAIN_HISTORY_OWNER_KEY);
    } catch {}
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
        // NOTE: previously emitted two postAppEvent observability pings around
        // this fetch ("Token exchange in flight" / "complete"). Removed: this
        // background poller runs every 15s on /dashboard, so each poll spawned
        // 3 OAuth-validated round-trips (1 GET + 2 POSTs) and the POSTs added
        // visible latency to dashboard interactions. The real token exchange
        // is the BFF's RFC 8693 call, which already logs server-side — we
        // don't need a client-side marker that fires on every poll.
        const res = await fetch("/api/token-chain", {
          credentials: "include",
          _silent: true,
        });
        if (!res.ok) return;
        const data = await res.json();
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
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.authenticated && !cancelled) syncPollingForRoute();
      })
      .catch(() => {});

    window.addEventListener("userAuthenticated", startPolling);

    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener("userAuthenticated", startPolling);
    };
  }, [activePath]);

  // Real-time MCP result updates via SSE — APPEND new result so live order
  // matches the server's chronological (oldest-first) order. Previously this
  // prepended newest-first while the 15s poll replaced the list oldest-first,
  // so the displayed call order flipped depending on data source. We also no
  // longer fabricate chainIndex from array length (collides/skips vs the
  // server ordinal) nor assert scopes:[] / isDelegated:false (which positively
  // misstated a delegated, scoped call as "Direct user token, no scopes" until
  // the next poll). Unknown fields are left undefined so the UI can render
  // "pending poll" rather than a false negative.
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      if (!data || !data.toolName) return;
      setMCPToolCalls((prev) => {
        const lastIdx = prev.reduce(
          (max, c) =>
            typeof c.chainIndex === "number" && c.chainIndex > max
              ? c.chainIndex
              : max,
          -1,
        );
        return [
          ...prev,
          {
            id: `sse-${Date.now()}`,
            timestamp: data.timestamp || new Date().toISOString(),
            toolName: data.toolName,
            status: data.status || "success",
            duration: data.duration || 0,
            chainIndex: lastIdx + 1,
            // Unknown until the authoritative poll arrives — do not assert.
            isDelegated:
              typeof data.isDelegated === "boolean"
                ? data.isDelegated
                : undefined,
            scopes: Array.isArray(data.scopes) ? data.scopes : undefined,
            pendingServerSync: true,
            resultJson: data.resultJson || null,
            resultSummary: data.resultSummary || null,
          },
        ];
      });
    };
    window.addEventListener("mcp-tool-result-sse", handler);
    return () => window.removeEventListener("mcp-tool-result-sse", handler);
  }, []);

  // Inject synthetic token events from external sources (e.g. kill switch, introspection denied).
  // Bypasses the isTokenChainRoute check so events appear immediately in any open Token Chain modal.
  useEffect(() => {
    const handler = (e) => {
      const { tool, events: injectedEvents } = e.detail || {};
      if (
        !tool ||
        !Array.isArray(injectedEvents) ||
        injectedEvents.length === 0
      )
        return;
      setHistory((prev) => [
        { tool, timestamp: new Date().toISOString(), events: injectedEvents },
        ...prev.slice(0, 19),
      ]);
      setEvents(injectedEvents);
      setSessionTokenEvent(null);
    };
    window.addEventListener("token-chain-inject", handler);
    return () => window.removeEventListener("token-chain-inject", handler);
  }, []);

  /** Fetch resolved identity once on mount (and on re-auth). Shared across all token surfaces. */
  const loadResolvedIdentity = useCallback(async () => {
    try {
      // Check session first; only load config if authenticated to avoid 401 loop
      const sessionRes = await fetch("/api/auth/session", {
        credentials: "include",
      });
      if (!sessionRes.ok) {
        // Not authenticated — skip config to avoid 401 loop
        setResolvedIdentity({ currentUser: null, knownClients: {} });
        return;
      }
      const configRes = await fetch("/api/pingone-test/config", {
        credentials: "include",
      });
      const sessionData = await sessionRes.json();
      const configData = configRes.ok ? await configRes.json() : null;
      const identity = { currentUser: null, knownClients: {} };
      if (sessionData?.authenticated && sessionData.user) {
        const u = sessionData.user;
        const name =
          [u.firstName, u.lastName].filter(Boolean).join(" ") ||
          u.email ||
          u.username ||
          "";
        identity.currentUser = { sub: u.id, name, email: u.email };
      }
      if (configData) {
        const clientLabels = {
          adminClientId: "AI Demo BFF (Admin)",
          userClientId: "AI Demo BFF (User)",
          mcpTokenExchangerClientId: "MCP Token Exchanger",
          aiAgentClientId: "AI Agent",
        };
        for (const [key, label] of Object.entries(clientLabels)) {
          const id = configData[key];
          if (id) identity.knownClients[id] = label;
        }
      }
      setResolvedIdentity(identity);
    } catch {
      /* non-fatal — falls back to raw UUIDs */
    }
  }, []);

  useEffect(() => {
    void loadResolvedIdentity();
  }, [loadResolvedIdentity]);

  // Identity-ownership guard: token-chain history is per-principal. If the
  // resolved current user differs from the principal that owns the persisted
  // history (e.g. user A logged out without a clean clearHistory — tab close,
  // session-expiry redirect — then user B logged in on the same browser),
  // wipe the stale history so user B never sees user A's tool calls and
  // decoded sub/scope claims. Owner sub is tracked in its own localStorage key
  // (the history payload itself is never trusted for ownership).
  useEffect(() => {
    const sub = resolvedIdentity?.currentUser?.sub || null;
    if (!sub) return; // unauthenticated / not yet resolved — leave as-is
    let owner = null;
    try {
      owner = localStorage.getItem(TOKEN_CHAIN_HISTORY_OWNER_KEY);
    } catch {}
    if (owner && owner !== sub) {
      // Different principal — clear everything tied to the previous user.
      setHistory([]);
      setEvents([]);
      setNlRoutingEventState(null);
      setSessionTokenEvent(null);
      setMCPToolCalls([]);
      try {
        localStorage.removeItem(TOKEN_CHAIN_HISTORY_KEY);
      } catch {}
    }
    if (owner !== sub) {
      try {
        localStorage.setItem(TOKEN_CHAIN_HISTORY_OWNER_KEY, sub);
      } catch {}
    }
  }, [resolvedIdentity]);

  // Re-fetch identity after login (e.g., session expiry re-auth)
  useEffect(() => {
    const onAuth = () => void loadResolvedIdentity();
    window.addEventListener("userAuthenticated", onAuth);
    return () => window.removeEventListener("userAuthenticated", onAuth);
  }, [loadResolvedIdentity]);

  const value = useMemo(() => {
    // Use tool events if available, otherwise show session token
    const displayEvents =
      events.length > 0 ? events : sessionTokenEvent ? [sessionTokenEvent] : [];
    return {
      events: displayEvents,
      nlRoutingEvent,
      history,
      mcpToolCalls,
      validationMode,
      resolvedIdentity,
      setTokenEvents,
      clearEvents,
      setNlRoutingEvent,
      setSessionToken,
      clearHistory,
    };
  }, [
    events,
    nlRoutingEvent,
    sessionTokenEvent,
    history,
    mcpToolCalls,
    validationMode,
    resolvedIdentity,
    setTokenEvents,
    clearEvents,
    setNlRoutingEvent,
    setSessionToken,
    clearHistory,
  ]);

  return (
    <TokenChainContext.Provider value={value}>
      {children}
    </TokenChainContext.Provider>
  );
}

export function useTokenChain() {
  const ctx = useContext(TokenChainContext);
  if (!ctx) {
    throw new Error("useTokenChain must be used within TokenChainProvider");
  }
  return ctx;
}

/** Safe hook — returns null outside provider (e.g. tests) */
export function useTokenChainOptional() {
  return useContext(TokenChainContext);
}
