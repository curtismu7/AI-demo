import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

/**
 * ExchangeModeContext — Manages RFC 8693 token exchange mode state
 *
 * Provides global state for whether to use 1-exchange (subject-only) or
 * 2-exchange (subject + agent actor) mode. Shares mode across all components
 * without prop drilling.
 *
 * Usage:
 *   <ExchangeModeProvider>
 *     <YourApp />
 *   </ExchangeModeProvider>
 *
 *   In any component:
 *   const { mode, setMode, loading, error } = useExchangeMode();
 */

const ExchangeModeContext = createContext(null);

export function useExchangeMode() {
  const ctx = useContext(ExchangeModeContext);
  if (!ctx) {
    throw new Error('useExchangeMode must be used within ExchangeModeProvider');
  }
  return ctx;
}

export function ExchangeModeProvider({ children }) {
  const [mode, setModeState] = useState('single'); // 'single' or 'double'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load initial mode from server on mount
  useEffect(() => {
    const loadInitialMode = async () => {
      setLoading(true);
      try {
        const response = await axios.get('/api/mcp/exchange-mode');
        const initialMode = response.data.mode === 'double' ? 'double' : 'single';
        setModeState(initialMode);
        setError(null);
      } catch (err) {
        console.warn('Failed to load exchange mode:', err.message);
        setError(err.message);
        // Keep default 'single' mode on error
      } finally {
        setLoading(false);
      }
    };

    loadInitialMode();
  }, []);

  /**
   * Update exchange mode (calls API to persist)
   */
  const setMode = async (newMode) => {
    if (!['single', 'double'].includes(newMode)) {
      console.error(`ExchangeModeContext: Invalid mode "${newMode}"`);
      return;
    }

    setModeState(newMode);
    setLoading(true);

    try {
      const response = await axios.post('/api/mcp/exchange-mode', { mode: newMode });
      const confirmedMode = response.data.mode === 'double' ? 'double' : 'single';
      setModeState(confirmedMode);
      setError(null);
    } catch (err) {
      console.warn('Failed to update exchange mode:', err.message);
      setError(err.message);
      // Revert to previous mode on failure
      setModeState(mode);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    mode,
    setMode,
    loading,
    error,
  };

  return (
    <ExchangeModeContext.Provider value={value}>
      {children}
    </ExchangeModeContext.Provider>
  );
}

// Export context for advanced use cases (ref, etc.)
export { ExchangeModeContext };
