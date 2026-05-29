// banking_api_ui/src/context/AgentUiModeContext.js
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY_LEGACY = 'banking_agent_ui_mode';
const STORAGE_KEY_V2 = 'banking_agent_ui_v2';

/**
 * @typedef {object} AgentUiState
 * @property {'middle' | 'none'} placement — Middle = split-column agent host; none = float-only.
 * @property {boolean} fab — Also show floating FAB on dashboard routes (invalid with placement none unless true).
 */

const defaultState = /** @type {AgentUiState} */ ({
  placement: 'middle',
  fab: true,
});

function readLegacyMode() {
  try {
    const m = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (m === 'embedded') return { placement: 'middle', fab: false };
    if (m === 'both') return { placement: 'middle', fab: true };
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
    if (state.placement === 'middle' && !state.fab) {
      localStorage.setItem(STORAGE_KEY_LEGACY, 'embedded');
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
      if ((p === 'middle' || p === 'none') && typeof fab === 'boolean') {
        if (p === 'none' && !fab) {
          return { placement: 'none', fab: true };
        }
        return { placement: p, fab };
      }
      // Any persisted placement outside the valid {middle, none} set —
      // including the archived 'bottom' dock and the older 'right-dock' /
      // 'left-dock' — coerces to middle so a persisted value never yields a
      // no-agent state. Other unknown placements fall through to
      // readLegacyMode() below.
      if (p === 'bottom' || p === 'right-dock' || p === 'left-dock') {
        return { placement: 'middle', fab: typeof fab === 'boolean' ? fab : true };
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
  surfaceHostEl: null,
  setSurfaceHostEl: () => {},
  // ff_agent_clinical_split: TalkPane sets true on mount so App.js renders
  // BankingAgent with mode="inline" + splitColumnChrome (existing
  // .ba-mode-inline styles); cleared on unmount so the legacy floating dock
  // returns elsewhere.
  clinicalSplit: false,
  setClinicalSplit: () => {},
});

/**
 * Middle — embedded assistant in dashboard split column (token | agent | banking).
 * Float — corner FAB only (no embedded chrome); fab is always true.
 * fab — when Middle, also show the floating FAB (Middle+Float).
 */
export function AgentUiModeProvider({ children }) {
  const [state, setState] = useState(() => readState());
  const [webMcpLastResult, setWebMcpLastResult] = useState(null);
  const [surfaceHostEl, setSurfaceHostEl] = useState(null);
  const [clinicalSplit, setClinicalSplit] = useState(false);

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
      surfaceHostEl,
      setSurfaceHostEl,
      clinicalSplit,
      setClinicalSplit,
    }),
    // setters from useState are stable refs — excluded per react-hooks/exhaustive-deps
    [state.placement, state.fab, setAgentUi, webMcpLastResult, surfaceHostEl, clinicalSplit]
  );

  return (
    <AgentUiModeContext.Provider value={value}>{children}</AgentUiModeContext.Provider>
  );
}

export function useAgentUiMode() {
  return useContext(AgentUiModeContext);
}
