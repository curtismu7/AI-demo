// banking_api_ui/src/context/AgentUiModeContext.js
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'banking_agent_ui_mode';

const AgentUiModeContext = createContext({
  mode: 'floating',
  setMode: () => {},
});

function normalizeMode(v) {
  if (v === 'embedded') return 'embedded';
  // Legacy `both` — floating + dock together; we only support one at a time now.
  if (v === 'both') return 'floating';
  return 'floating';
}

/**
 * floating — FAB + overlay panel (default); hidden on Demo config (`/demo-data`).
 * embedded — bottom dock only on `/`, `/admin`, `/dashboard`; no FAB while signed in.
 */
export function AgentUiModeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    try {
      return normalizeMode(localStorage.getItem(STORAGE_KEY));
    } catch {
      return 'floating';
    }
  });

  /** One-time: rewrite legacy `both` in storage to `floating`. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const n = normalizeMode(raw);
      if (raw != null && raw !== n) localStorage.setItem(STORAGE_KEY, n);
    } catch {
      // ignore
    }
  }, []);

  const setMode = useCallback((next) => {
    const m = normalizeMode(next);
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // ignore
    }
    try {
      window.dispatchEvent(new CustomEvent('banking-agent-ui-mode', { detail: { mode: m } }));
    } catch {
      // ignore
    }
  }, []);

  /** Keep in sync when another tab changes localStorage (storage event does not fire in the writer tab). */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      setModeState(normalizeMode(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <AgentUiModeContext.Provider value={value}>{children}</AgentUiModeContext.Provider>;
}

export function useAgentUiMode() {
  return useContext(AgentUiModeContext);
}
