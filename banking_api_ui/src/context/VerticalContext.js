// banking_api_ui/src/context/VerticalContext.js
// COMPATIBILITY LAYER (permanent): delegates to ThemeContext/useTheme().
// ThemeContext is the single source of truth for all theme state; this
// thin adapter preserves the historical useVertical() API for its
// consumers. Intentionally retained — not slated for removal.
import { useTheme } from './ThemeContext';

export function VerticalProvider({ children }) {
  return children;
}

export function useVertical() {
  const t = useTheme();
  return {
    vertical: t.terminology ? { terminology: t.terminology } : null,
    loading: t.loading,
    error: null,
    switchVertical: t.switchTheme,
    mapTerm: t.mapTerm,
  };
}
