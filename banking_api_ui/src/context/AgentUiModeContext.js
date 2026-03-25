// banking_api_ui/src/context/AgentUiModeContext.js
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const STORAGE_KEY = 'banking_agent_ui_mode';

const AgentUiModeContext = createContext({
  mode: 'floating',
  setMode: () => {},
});

/**
 * floating — FAB + overlay panel (default).
 * embedded — inline chat on dashboard home only (not shown with floating).
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

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <AgentUiModeContext.Provider value={value}>{children}</AgentUiModeContext.Provider>;
}

export function useAgentUiMode() {
  return useContext(AgentUiModeContext);
}
