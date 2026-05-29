let _lastKeys = new Set();

export function applyThemeTokens(cssVars) {
  const root = document.documentElement;
  const newKeys = new Set(Object.keys(cssVars || {}));
  for (const key of _lastKeys) {
    if (!newKeys.has(key)) root.style.removeProperty(key);
  }
  for (const [key, value] of Object.entries(cssVars || {})) {
    root.style.setProperty(key, value);
  }
  _lastKeys = newKeys;
}

// Test-only helper to reset the in-module state.
export function _resetThemeTokens() { _lastKeys = new Set(); }
