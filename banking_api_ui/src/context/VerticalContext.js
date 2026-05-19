// banking_api_ui/src/context/VerticalContext.js
// SHIM: superseded by ThemeContext. Removed in the cleanup task once unused.
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
