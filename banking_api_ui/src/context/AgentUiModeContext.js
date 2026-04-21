// banking_api_ui/src/context/AgentUiModeContext.js
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY_LEGACY = 'banking_agent_ui_mode';
const STORAGE_KEY_V2 = 'banking_agent_ui_v2';

/**
 * @typedef {object} AgentUiState
 * @property {'middle' | 'bottom' | 'none' | 'right-dock' | 'left-dock'} placement — Middle = split column agent; Bottom = dock; none = float-only; right-dock = collapsible right sidebar (width-resizable); left-dock = collapsible left sidebar.
 * @property {boolean} fab — Also show floating FAB on dashboard routes (invalid with placement none unless true).
 */

const defaultState = /** @type {AgentUiState} */ ({
  placement: 'middle',
  fab: true,
});

function readLegacyMode() {
  try {
    const m = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (m === 'embedded') return { placement: 'bottom', fab: false };
    if (m === 'both') return { placement: 'bottom', fab: true };
    return { placement: 'middle', fab: true };
  } catch {
    return { ...defaultState };
  }
}

/** Keep ThemeContext + older code that reads `banking_agent_ui_mode` in sync. */
function syncLegacyString(state) {
  try {
    if (state.placement === 'none') {
      localStorage.setItem(STORAGE_KEY_LEGACY, 'floating');
      return;
    }
    if (state.placement === 'bottom' && !state.fab) {
      localStorage.setItem(STORAGE_KEY_LEGACY, 'embedded');
      return;
    }
    if (state.placement === 'bottom' && state.fab) {
      localStorage.setItem(STORAGE_KEY_LEGACY, 'both');
      return;
    }
    if (state.placement === 'middle' && !state.fab) {
      localStorage.setItem(STORAGE_KEY_LEGACY, 'embedded');
      return;
    }
    if (state.placement === 'right-dock') {
      localStorage.setItem(STORAGE_KEY_LEGACY, 'both');
      return;
    }
    if (state.placement === 'left-dock') {
      localStorage.setItem(STORAGE_KEY_LEGACY, 'both');
      return;
    }
    localStorage.setItem(STORAGE_KEY_LEGACY, 'both');
  } catch {
    /* ignore */
  }
}

/**
 * @returns {AgentUiState}
 */
function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const o = JSON.parse(raw);
      const p = o?.placement;
      const fab = o?.fab;
      if (
        (p === 'middle' || p === 'bottom' || p === 'none' || p === 'right-dock' || p === 'left-dock') &&
        typeof fab === 'boolean'
      ) {
        if (p === 'none' && !fab) {
          return { placement: 'none', fab: true };
        }
        return { placement: p, fab };
      }
      // Dock types with non-boolean fab default to true
      if ((p === 'right-dock' || p === 'left-dock') && typeof fab !== 'boolean') {
        return { placement: p, fab: true };
      }
    }
  } catch {
    /* fall through */
  }
  return readLegacyMode();
}

const AgentUiModeContext = createContext({
  placement: 'middle',
  fab: true,
  setAgentUi: () => {},
  webMcpLastResult: null,
  setWebMcpLastResult: () => {},
});

/**
 * Middle — embedded assistant in dashboard split column (token | agent | banking).
 * Bottom — full-width bottom dock on dashboard routes (+ /config).
 * Float — corner FAB only (no embedded chrome); fab is always true.
 * Right-dock — agent in collapsible right sidebar (width-resizable).
 * fab — when Middle or Bottom, also show the floating FAB (Middle+Float or Bottom+Float; never Middle+Bottom).
 */
export function AgentUiModeProvider({ children }) {
  const [state, setState] = useState(() => readState());
  const [webMcpLastResult, setWebMcpLastResult] = useState(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY_V2)) {
        const s = readState();
        localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(s));
      }
      syncLegacyString(readState());
    } catch {
      /* ignore */
    }
  }, []);

  const setAgentUi = useCallback((next) => {
    setState((prev) => {
      const placement = next.placement !== undefined ? next.placement : prev.placement;
      let fab = next.fab !== undefined ? next.fab : prev.fab;
      if (placement === 'none') {
        fab = true;
      }
      const out = { placement, fab };
      try {
        localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(out));
      } catch {
        /* ignore */
      }
      syncLegacyString(out);
      try {
        window.dispatchEvent(
          new CustomEvent('banking-agent-ui-mode', { detail: out })
        );
      } catch {
        /* ignore */
      }
      return out;
    });
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY_V2 || e.newValue == null) return;
      try {
        const o = JSON.parse(e.newValue);
        if (o?.placement && typeof o.fab === 'boolean') {
          setState(o);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({
      placement: state.placement,
      fab: state.fab,
      setAgentUi,
      webMcpLastResult,
      setWebMcpLastResult,
    }),
    [state.placement, state.fab, setAgentUi, webMcpLastResult, setWebMcpLastResult]
  );

  return (
    <AgentUiModeContext.Provider value={value}>{children}</AgentUiModeContext.Provider>
  );
}

export function useAgentUiMode() {
  return useContext(AgentUiModeContext);
}
