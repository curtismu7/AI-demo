// banking_api_ui/src/context/DemoTourContext.js
import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

export const TOUR_STEPS = [
  {
    title: 'Super Banking AI Banking Demo',
    body: 'This 5-minute tour walks through three distinct authentication flows and shows RFC 8693 token exchange in action.',
    action: null,
  },
  {
    title: 'Flow 1 — Customer Login',
    body: 'A customer logs in via Authorization Code + PKCE. Their tokens stay on the server. The browser only gets a session cookie.',
    action: { label: 'Log in as customer', route: '/marketing' },
  },
  {
    title: 'Tokens held server-side',
    body: 'After login, the customer reaches the dashboard. No token appears in the browser — the BFF holds it securely.',
    action: { label: 'View dashboard', route: '/dashboard' },
  },
  {
    title: 'Agent makes a tool call',
    body: 'When the agent runs a banking tool, the BFF performs RFC 8693 token exchange — narrowing the audience to the MCP server.',
    action: { label: 'Open agent panel', hint: "Type 'show my accounts' in the agent" },
  },
  {
    title: 'Flow 2 — CIBA / Out-of-band approval',
    body: 'For high-value transfers, the agent triggers a CIBA push. The user approves on their device. The agent unblocks automatically.',
    action: { label: 'Try a transfer over $500', hint: 'Set CIBA threshold in demo settings, then transfer' },
  },
  {
    title: 'Polling for approval',
    body: 'The app polls /api/ciba/status every 5 seconds. When the user approves (email link or push), the token arrives and the agent continues.',
    action: null,
  },
  {
    title: 'Flow 3 — Inline auth challenge',
    body: "If the agent's session expires mid-flow, an inline login prompt appears. After the user re-authenticates, the agent continues automatically.",
    action: { hint: 'This triggers automatically on session expiry' },
  },
  {
    title: 'Token Exchange showcase',
    body: 'Toggle the exchange mode to see the difference: 1-exchange (user token only) vs 2-exchange (user + agent actor — act claim appears).',
    action: { label: 'Open token inspector', hint: "Look for the 'Exchange mode' toggle" },
  },
  {
    title: 'Tour complete',
    body: "You've seen all 3 auth flows and RFC 8693 token exchange. Use the EducationBar (top-right menu) to explore any concept in depth.",
    action: { label: 'Explore education panels', hint: 'Click the menu icon in the top-right' },
  },
];

const DemoTourContext = createContext(null);

export function DemoTourProvider({ children }) {
  const [step, setStep] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const start = useCallback(() => {
    setStep(0);
    setIsOpen(true);
  }, []);

  const next = useCallback(() => {
    setStep((s) => Math.min(s + 1, TOUR_STEPS.length - 1));
  }, []);

  const prev = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const goTo = useCallback((n) => {
    setStep(Math.max(0, Math.min(n, TOUR_STEPS.length - 1)));
  }, []);

  const value = useMemo(
    () => ({
      step,
      total: TOUR_STEPS.length,
      isOpen,
      start,
      next,
      prev,
      close,
      goTo,
    }),
    [step, isOpen, start, next, prev, close, goTo],
  );

  return <DemoTourContext.Provider value={value}>{children}</DemoTourContext.Provider>;
}

export function useDemoTour() {
  const ctx = useContext(DemoTourContext);
  if (!ctx) throw new Error('useDemoTour must be used inside DemoTourProvider');
  return ctx;
}

export default DemoTourContext;
