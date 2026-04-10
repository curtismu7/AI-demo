// banking_api_ui/src/context/ThemeContext.js
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

/** Keep in sync with inline script in `public/index.html` (first-paint theme). */
export const THEME_STORAGE_KEY = 'banking_ui_theme';

/** Agent panel only: `auto` follows page theme; `light` / `dark` override. */
export const AGENT_APPEARANCE_STORAGE_KEY = 'banking_agent_appearance';

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
  agentAppearance: 'auto',
  setAgentAppearance: () => {},
  effectiveAgentTheme: 'auto',
});

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

/**
 * App-wide light / dark appearance. Persists to localStorage (+ sessionStorage
 * backup) so choice survives refresh; sets document.documentElement.dataset.theme
 * for CSS (see theme/globalTheme.css).
 */
export function ThemeProvider({ children }) {
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

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      agentAppearance,
      setAgentAppearance,
      effectiveAgentTheme,
    }),
    [theme, setTheme, toggleTheme, agentAppearance, setAgentAppearance, effectiveAgentTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
