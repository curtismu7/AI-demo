'use strict';

const {
  CAPABILITY_CATALOG,
  buildCatalogMessage,
  parseHeuristic,
} = require('../services/nlIntentParser');

describe('capability catalog', () => {
  it('exports CAPABILITY_CATALOG as a non-empty string array', () => {
    expect(Array.isArray(CAPABILITY_CATALOG)).toBe(true);
    expect(CAPABILITY_CATALOG.length).toBeGreaterThan(0);
    expect(CAPABILITY_CATALOG.every((c) => typeof c === 'string')).toBe(true);
  });

  it('buildCatalogMessage returns a message containing every catalog item', () => {
    const msg = buildCatalogMessage();
    CAPABILITY_CATALOG.forEach((item) => {
      expect(msg).toContain(item);
    });
  });

  it('message has bullet formatting and the heuristics-only note', () => {
    const msg = buildCatalogMessage();
    expect(msg).toContain('•');
    expect(msg).toContain('Heuristics-only mode');
  });

  it('catalog covers core handled actions incl. deposit/withdraw', () => {
    expect(buildCatalogMessage()).toContain('deposit');
  });
});

// Absolute rule (user, 2026-05-29): EVERY agent path must work with EVERY
// vertical. The heuristic path was banking-only; these guard the manifest-driven
// catalog so non-banking verticals never leak banking terminology.
describe('vertical-aware catalog (all verticals)', () => {
  const sportingCtx = {
    terminology: { accounts: 'Loyalty Accounts', balance: 'Reward Points', transactions: 'Purchases', highValueAction: 'Team Order' },
    chips: [
      { key: 'balance', label: 'Reward Points' },
      { key: 'accounts', label: 'My Gear' },
      { key: 'transactions', label: 'Purchase History' },
      { key: 'transfer', label: 'Place Order' },
    ],
  };
  const healthcareCtx = {
    terminology: { accounts: 'Patient Records', balance: 'Coverage', transactions: 'Appointments', highValueAction: 'Release Records' },
    chips: [
      { key: 'balance', label: 'Check Coverage' },
      { key: 'accounts', label: 'My Records' },
      { key: 'transactions', label: 'Appointments' },
      { key: 'transfer', label: 'Release Records' },
    ],
  };

  it('banking catalog (no ctx) is unchanged — regression-safe default', () => {
    const msg = buildCatalogMessage();
    expect(msg).toContain('show my checking balance');
    expect(msg).toContain('mortgage');
  });

  it('sporting-goods catalog speaks the vertical and leaks no banking terms', () => {
    const msg = buildCatalogMessage(sportingCtx);
    expect(msg).toContain('Reward Points');
    expect(msg).toContain('My Gear');
    expect(msg).not.toMatch(/checking|savings|mortgage/i);
  });

  it('healthcare catalog speaks the vertical and leaks no banking terms', () => {
    const msg = buildCatalogMessage(healthcareCtx);
    expect(msg).toContain('Coverage');
    expect(msg).toContain('My Records');
    expect(msg).not.toMatch(/checking|savings|mortgage/i);
  });

  it('parseHeuristic no-match returns the vertical-aware catalog', () => {
    const res = parseHeuristic('hello there friend', 'sporting-goods', sportingCtx);
    expect(res.kind).toBe('none');
    expect(res.message).toContain('Reward Points');
    expect(res.message).not.toMatch(/mortgage/i);
  });

  it('parseHeuristic no-match for banking is unchanged', () => {
    const res = parseHeuristic('hello there friend', 'banking');
    expect(res.kind).toBe('none');
    expect(res.message).toContain('mortgage');
  });
});
