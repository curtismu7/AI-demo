// banking_api_ui/src/context/ThemeContext.js
import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
  useLayoutEffect,
} from 'react';

/** Keep in sync with inline script in `public/index.html` (first-paint theme). */
export const THEME_STORAGE_KEY = 'banking_ui_theme';

/** Agent panel only: `auto` follows page theme; `light` / `dark` override. */
export const AGENT_APPEARANCE_STORAGE_KEY = 'banking_agent_appearance';

const ThemeContext = createContext(null);

// ---------------------------------------------------------------------------
// Light / dark helpers (unchanged from original)
// ---------------------------------------------------------------------------

function readStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)?.trim();
    if (v === 'dark' || v === 'light') return v;
  } catch {
    // ignore (e.g. disabled storage)
  }
  try {
    const v = sessionStorage.getItem(THEME_STORAGE_KEY)?.trim();
    if (v === 'dark' || v === 'light') return v;
  } catch {
    // ignore
  }
  return 'light';
}

function writeStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  try {
    sessionStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

function readAgentAppearance() {
  try {
    const v = localStorage.getItem(AGENT_APPEARANCE_STORAGE_KEY)?.trim();
    if (v === 'auto' || v === 'light' || v === 'dark') return v;
  } catch {
    // ignore
  }
  try {
    const v = sessionStorage.getItem(AGENT_APPEARANCE_STORAGE_KEY)?.trim();
    if (v === 'auto' || v === 'light' || v === 'dark') return v;
  } catch {
    // ignore
  }
  return 'auto';
}

function writeAgentAppearance(value) {
  try {
    localStorage.setItem(AGENT_APPEARANCE_STORAGE_KEY, value);
  } catch {
    // ignore
  }
  try {
    sessionStorage.setItem(AGENT_APPEARANCE_STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Manifest / vertical helpers
// ---------------------------------------------------------------------------

function applyCssVars(cssVars) {
  if (!cssVars || typeof document === 'undefined') return;
  const root = document.documentElement;
  Object.entries(cssVars).forEach(([k, v]) => root.style.setProperty(k, v));
}

// ---------------------------------------------------------------------------
// ThemeProvider — merges light/dark toggle + manifest fetch
// ---------------------------------------------------------------------------

export function ThemeProvider({ children }) {
  // --- light / dark ---
  const [theme, setThemeState] = useState(readStoredTheme);
  const [agentAppearance, setAgentAppearanceState] = useState(readAgentAppearance);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStoredTheme(theme);
  }, [theme]);

  useLayoutEffect(() => {
    writeAgentAppearance(agentAppearance);
  }, [agentAppearance]);

  /** Other tabs / windows: keep theme in sync. */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue != null) {
        const v = e.newValue.trim();
        if (v === 'dark' || v === 'light') setThemeState(v);
      }
      if (e.key === AGENT_APPEARANCE_STORAGE_KEY && e.newValue != null) {
        const v = e.newValue.trim();
        if (v === 'auto' || v === 'light' || v === 'dark') setAgentAppearanceState(v);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next) => {
    setThemeState(next === 'dark' ? 'dark' : 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const setAgentAppearance = useCallback((next) => {
    const v = next === 'light' || next === 'dark' || next === 'auto' ? next : 'auto';
    setAgentAppearanceState(v);
  }, []);

  const effectiveAgentTheme = useMemo(() => {
    if (agentAppearance === 'light') return 'light';
    if (agentAppearance === 'dark') return 'dark';
    // Embedded bottom dock: "Match page" + dark UI made the agent unreadable and
    // globalTheme.css forced dark chrome on the wrapper. Default to light unless
    // the user explicitly chose Agent: Dark (handled above).
    try {
      const v2raw = localStorage.getItem('banking_agent_ui_v2');
      let embedLike = false;
      if (v2raw) {
        const o = JSON.parse(v2raw);
        embedLike = o?.placement === 'bottom' || o?.placement === 'middle';
      } else if (localStorage.getItem('banking_agent_ui_mode') === 'embedded') {
        embedLike = true;
      }
      if (embedLike && theme === 'dark') {
        return 'light';
      }
    } catch {
      // ignore
    }
    return theme;
  }, [agentAppearance, theme]);

  // --- manifest / vertical ---
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchManifest = useCallback(async () => {
    try {
      const res = await fetch('/api/config/vertical', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const m = data.manifest || null;
        setManifest(m);
        if (m) {
          applyCssVars(m.theme && m.theme.cssVars);
          if (m.identity && m.identity.documentTitle) {
            document.title = m.identity.documentTitle;
          }
          if (m.id && typeof document !== 'undefined') {
            document.documentElement.dataset.industry = m.id;
          }
        }
      }
    } catch (err) {
      // Non-fatal: app renders with CSS defaults if manifest fetch fails.
      console.warn('[ThemeContext] manifest fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchManifest(); }, [fetchManifest]);

  const switchTheme = useCallback(async (id) => {
    const res = await fetch('/api/config/vertical', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verticalId: id }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    await fetchManifest();
  }, [fetchManifest]);

  const mapTerm = useCallback(
    (term) => (manifest && manifest.terminology && manifest.terminology[term]) || term,
    [manifest],
  );

  const value = useMemo(() => ({
    // light / dark fields (preserved)
    theme,
    setTheme,
    toggleTheme,
    agentAppearance,
    setAgentAppearance,
    effectiveAgentTheme,
    // manifest / vertical fields (new)
    loading,
    manifest,
    themeId: manifest ? manifest.id : null,
    identity: manifest ? manifest.identity : null,
    cssVars: manifest && manifest.theme ? manifest.theme.cssVars : null,
    terminology: manifest ? manifest.terminology : null,
    agent: manifest ? manifest.agent : null,
    dashboard: manifest ? manifest.dashboard : null,
    featurePage: manifest ? manifest.featurePage : null,
    mapTerm,
    switchTheme,
  }), [
    theme, setTheme, toggleTheme, agentAppearance, setAgentAppearance, effectiveAgentTheme,
    manifest, loading, mapTerm, switchTheme,
  ]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      // light / dark defaults
      theme: 'light',
      setTheme: () => {},
      toggleTheme: () => {},
      agentAppearance: 'auto',
      setAgentAppearance: () => {},
      effectiveAgentTheme: 'auto',
      // manifest defaults
      loading: false,
      manifest: null,
      themeId: null,
      identity: null,
      cssVars: null,
      terminology: null,
      agent: null,
      dashboard: null,
      featurePage: null,
      mapTerm: (t) => t,
      switchTheme: async () => {},
    };
  }
  return ctx;
}
