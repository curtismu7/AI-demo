// banking_api_ui/src/context/TokenChainContext.js
//
// Shares live RFC 8693 token chain events across the UI.
// Events are produced by callMcpTool() (bankingAgentService) and consumed by
// TokenChainPanel and BankingAgent (inline chat messages).
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

const TokenChainContext = createContext(null);

const TOKEN_CHAIN_HISTORY_KEY = 'tokenChainHistory';

export function TokenChainProvider({ children }) {
  // Array of token event objects — latest tool call only (replaced on each call)
  const [events, setEvents] = useState([]);
  // Current session token event — shown when no tool events (e.g., on dashboard load)
  const [sessionTokenEvent, setSessionTokenEvent] = useState(null);
  // MCP tool call delegation trail (fetched from /api/token-chain)
  const [mcpToolCalls, setMCPToolCalls] = useState([]);
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
    setEvents(newEvents);
    // Clear session token event when a tool runs (tool events take precedence)
    setSessionTokenEvent(null);
    setHistory(prev => [
      { tool, timestamp: new Date().toISOString(), events: newEvents },
      ...prev.slice(0, 19), // keep last 20 calls
    ]);
  }, []);

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

  // Fetch MCP tool calls from /api/token-chain on mount and poll every 15s
  useEffect(() => {
    let cancelled = false;
    const fetchMCPToolCalls = async () => {
      try {
        const res = await fetch('/api/token-chain', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMCPToolCalls(data.mcpToolCallsChain || []);
        }
      } catch {
        // Silently fail — user may not be authenticated
      }
    };
    fetchMCPToolCalls();
    const pollInterval = setInterval(fetchMCPToolCalls, 15000);
    return () => { cancelled = true; clearInterval(pollInterval); };
  }, []);

  const value = useMemo(
    () => {
      // Use tool events if available, otherwise show session token
      const displayEvents = events.length > 0 ? events : (sessionTokenEvent ? [sessionTokenEvent] : []);
      return { events: displayEvents, history, mcpToolCalls, setTokenEvents, clearEvents, setSessionToken, clearHistory };
    },
    [events, sessionTokenEvent, history, mcpToolCalls, setTokenEvents, clearEvents, setSessionToken, clearHistory]
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
