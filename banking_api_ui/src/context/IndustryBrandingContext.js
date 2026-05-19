// banking_api_ui/src/context/IndustryBrandingContext.js
// SHIM: superseded by ThemeContext. Kept so existing imports keep working
// during incremental migration; removed in the cleanup task once unused.
import { useTheme } from './ThemeContext';

export function IndustryBrandingProvider({ children }) {
  return children;
}

export function useIndustryBranding() {
  const t = useTheme();
  const id = t.themeId || 'bx_finance';
  return {
    industryId: id,
    preset: { id, shortName: t.identity ? t.identity.displayName : 'Super Banking' },
    setIndustryId: () => {},
    applyIndustryId: () => {},
  };
}
