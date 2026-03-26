// banking_api_ui/src/context/AgentUiModeContext.js
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'banking_agent_ui_mode';

const AgentUiModeContext = createContext({
  mode: 'floating',
  setMode: () => {},
});

/**
 * floating — FAB + overlay panel (default); hidden on Demo config (`/demo-data`).
 * embedded — bottom dock only on `/`, `/admin`, `/dashboard`; no FAB on other routes (logs, MCP, etc.).
 */
export function AgentUiModeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'embedded' ? 'embedded' : 'floating';
    } catch {
      return 'floating';
    }
  });

  const setMode = useCallback((next) => {
    const m = next === 'embedded' ? 'embedded' : 'floating';
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
      const m = e.newValue === 'embedded' ? 'embedded' : 'floating';
      setModeState(m);
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
