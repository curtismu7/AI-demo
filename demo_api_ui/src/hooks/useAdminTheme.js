import { useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

const ADMIN_CSS_VARS = {
  '--app-primary-red': '#1e293b',
  '--app-primary-red-hover': '#0f172a',
  '--app-primary-red-mid': '#334155',
  '--app-primary-red-border': '#0f172a',
  '--brand-dashboard-header-start': '#0f172a',
  '--brand-dashboard-header-end': '#1e3a5f',
  '--brand-app-shell-hero-start': '#0f172a',
  '--brand-app-shell-hero-end': '#1e3a5f',
  '--theme-accent': '#f59e0b',
  '--brand-dashboard-header-text': '#f1f5f9',
};

export function useAdminTheme() {
  const { cssVars } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const previous = {};

    // Stash current values
    Object.keys(ADMIN_CSS_VARS).forEach((k) => {
      previous[k] = root.style.getPropertyValue(k);
    });

    // Apply admin palette
    Object.entries(ADMIN_CSS_VARS).forEach(([k, v]) => {
      root.style.setProperty(k, v);
    });

    const prevIndustry = root.dataset.industry;
    root.dataset.industry = 'admin';

    return () => {
      // Restore previous values
      Object.entries(previous).forEach(([k, v]) => {
        if (v) {
          root.style.setProperty(k, v);
        } else {
          root.style.removeProperty(k);
        }
      });
      root.dataset.industry = prevIndustry || '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
