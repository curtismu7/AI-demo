// banking_api_ui/src/context/IndustryBrandingContext.js
// COMPATIBILITY LAYER (permanent): delegates to ThemeContext/useTheme().
// ThemeContext is the single source of truth for all theme state; this
// thin adapter preserves the historical useIndustryBranding() API for its
// many consumers. Intentionally retained — not slated for removal.
import { useTheme } from './ThemeContext';

export function IndustryBrandingProvider({ children }) {
  return children;
}

export function useIndustryBranding() {
  const t = useTheme();
  const id = t.themeId || 'bx_finance';
  return {
    industryId: id,
    preset: { id, shortName: t.identity ? t.identity.displayName : 'Super Banking', logoPath: t.identity ? t.identity.logoPath : '/super-bank-icon.png' },
    setIndustryId: () => {},
    applyIndustryId: () => {},
  };
}
