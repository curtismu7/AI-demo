// demo_api_ui/src/context/SessionTokenContext.js
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const SessionTokenContext = createContext(null);

export function SessionTokenProvider({ children }) {
  const [tokenSecondsLeft, setTokenSecondsLeft] = useState(null);
  const [openTokenModal, setOpenTokenModal] = useState(null); // stores a callback fn

  const publishTokenState = useCallback((seconds, openModalFn) => {
    setTokenSecondsLeft(seconds);
    setOpenTokenModal(() => openModalFn); // wrap in arrow so useState doesn't call it
  }, []);

  const value = useMemo(() => ({
    tokenSecondsLeft,
    openTokenModal,
    publishTokenState,
  }), [tokenSecondsLeft, openTokenModal, publishTokenState]);

  return (
    <SessionTokenContext.Provider value={value}>
      {children}
    </SessionTokenContext.Provider>
  );
}

export function useSessionToken() {
  const ctx = useContext(SessionTokenContext);
  if (!ctx) throw new Error('useSessionToken must be used within SessionTokenProvider');
  return ctx;
}
