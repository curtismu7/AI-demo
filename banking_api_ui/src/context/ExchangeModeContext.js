import React, { createContext, useContext, useState } from 'react';
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

  // Don't fetch initial mode - always default to 'single' to prevent 401 errors
  // Mode is only fetched when user explicitly changes it

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
