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

// Regression: the LIVE path resolves ctx via resolveActiveVerticalCtx() after
// verticalManifest.init(). Banking's manifest carries a terminology block, so a
// naive `if (m.terminology)` check would treat banking like a themed vertical and
// collapse its 10-item hand-authored catalog to 6 chip labels. resolveActiveVerticalCtx
// must return null for banking. These tests exercise the real resolver (NOT a passed
// ctx), which is the gap that let the original regression ship green.
describe('resolveActiveVerticalCtx — live banking path (regression)', () => {
  const { resolveActiveVerticalCtx } = require('../services/nlIntentParser');
  const { verticalManifest } = require('../services/verticalManifest');

  let prevActive;
  beforeAll(() => {
    verticalManifest.init();
    prevActive = verticalManifest.resolver.activeId();
    verticalManifest.resolver.setActive('banking');
  });
  afterAll(() => {
    if (prevActive) verticalManifest.resolver.setActive(prevActive);
  });

  it('returns null for the banking vertical (selects the verbatim catalog)', () => {
    expect(resolveActiveVerticalCtx()).toBeNull();
  });

  it('live banking catalog keeps the full 10-item hand-authored list (deposit/withdraw/mortgage)', () => {
    const ctx = resolveActiveVerticalCtx();
    const msg = buildCatalogMessage(ctx);
    expect(msg).toContain('deposit');
    expect(msg).toContain('withdraw');
    expect(msg).toContain('mortgage');
    // verbatim (null ctx) === explicit-no-arg; both must equal the CAPABILITY_CATALOG render
    expect(msg).toBe(buildCatalogMessage());
  });
});
