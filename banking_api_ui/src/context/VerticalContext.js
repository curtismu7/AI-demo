// banking_api_ui/src/context/VerticalContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const VerticalContext = createContext(null);

/**
 * Provides the active vertical config to the component tree.
 * Fetches from /api/config/vertical on mount.
 * switchVertical(id) calls PUT /api/config/vertical and updates local state + CSS vars.
 */
export function VerticalProvider({ children }) {
  const [vertical, setVertical] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applyTheme = useCallback((theme) => {
    if (!theme) return;
    const root = document.documentElement;
    if (theme.primary) root.style.setProperty('--vertical-primary', theme.primary);
    if (theme.accent) root.style.setProperty('--vertical-accent', theme.accent);
    if (theme.gradient) root.style.setProperty('--vertical-gradient', theme.gradient);
  }, []);

  const fetchVertical = useCallback(async () => {
    try {
      const res = await fetch('/api/config/vertical', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setVertical(data.config || null);
        if (data.config?.theme) applyTheme(data.config.theme);
      }
    } catch (err) {
      console.warn('[VerticalContext] Failed to fetch vertical config:', err.message);
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    fetchVertical();
  }, [fetchVertical]);

  const switchVertical = useCallback(async (verticalId) => {
    setError(null);
    try {
      const res = await fetch('/api/config/vertical', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verticalId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setVertical(data.config || null);
      if (data.config?.theme) applyTheme(data.config.theme);
      return data.config;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [applyTheme]);

  const mapTerm = useCallback((term) => {
    if (!vertical?.terminology) return term;
    return vertical.terminology[term] || term;
  }, [vertical]);

  return (
    <VerticalContext.Provider value={{ vertical, loading, error, switchVertical, mapTerm }}>
      {children}
    </VerticalContext.Provider>
  );
}

export function useVertical() {
  const ctx = useContext(VerticalContext);
  if (!ctx) {
    return { vertical: null, loading: false, error: null, switchVertical: () => {}, mapTerm: (t) => t };
  }
  return ctx;
}
