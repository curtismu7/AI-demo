// banking_api_ui/src/config/industryPresets.js
/**
 * Industry / white-label presets: logos, colors, display names.
 * Keys must match server `ui_industry_preset` (configStore FIELD_DEFS).
 */

/** @typedef {{ id: string, label: string, shortName: string, tagline?: string, description: string, logoPath: string, cssVars: Record<string, string> }} IndustryPreset */

/** @type {IndustryPreset[]} */
export const INDUSTRY_PRESETS = [
  {
    id: 'bx_finance',
    label: 'Super Banking (default)',
    shortName: 'Super Banking',
    tagline: 'PingOne AI IAM Core',
    description:
      'Default demo branding: crimson primary actions and blue dashboard header. Matches the stock logo at /logo.svg.',
    logoPath: '/logo.svg',
    cssVars: {
      '--app-primary-red': '#b91c1c',
      '--app-primary-red-hover': '#991b1b',
      '--app-primary-red-mid': '#dc2626',
      '--app-primary-red-border': '#7f1d1d',
      '--brand-dashboard-header-start': '#1e3a8a',
      '--brand-dashboard-header-end': '#1e40af',
      '--brand-app-shell-hero-start': '#1e3a8a',
      '--brand-app-shell-hero-end': '#2563eb',
    },
  },
  {
    id: 'funnybank',
    label: 'FunnyBank (demo)',
    shortName: 'FunnyBank',
    tagline: 'Serious security, silly name',
    description:
      'Purple / violet primary actions and indigo header for a distinct demo tenant. Uses /branding/funnybank-logo.svg.',
    logoPath: '/branding/funnybank-logo.svg',
    cssVars: {
      '--app-primary-red': '#6d28d9',
      '--app-primary-red-hover': '#5b21b6',
      '--app-primary-red-mid': '#7c3aed',
      '--app-primary-red-border': '#4c1d95',
      '--brand-dashboard-header-start': '#4c1d95',
      '--brand-dashboard-header-end': '#6366f1',
      '--brand-app-shell-hero-start': '#5b21b6',
      '--brand-app-shell-hero-end': '#7c3aed',
    },
  },
];

export const DEFAULT_INDUSTRY_ID = 'bx_finance';

/** @param {string} [id] */
export function getIndustryPreset(id) {
  const found = INDUSTRY_PRESETS.find((p) => p.id === id);
  return found || INDUSTRY_PRESETS[0];
}
