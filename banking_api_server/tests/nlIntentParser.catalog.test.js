// banking_api_server/tests/nlIntentParser.catalog.test.js
const parser = require('../services/nlIntentParser');

describe('capability catalog', () => {
  test('exports CAPABILITY_CATALOG as a non-empty string array', () => {
    expect(Array.isArray(parser.CAPABILITY_CATALOG)).toBe(true);
    expect(parser.CAPABILITY_CATALOG.length).toBeGreaterThanOrEqual(7);
    parser.CAPABILITY_CATALOG.forEach((c) => expect(typeof c).toBe('string'));
  });
  test('buildCatalogMessage returns a message containing every catalog item', () => {
    const msg = parser.buildCatalogMessage();
    parser.CAPABILITY_CATALOG.forEach((c) => expect(msg).toContain(c));
    expect(msg).toMatch(/can help/i);
  });
  test('message has bullet formatting and the heuristics-only note', () => {
    const msg = parser.buildCatalogMessage();
    expect(msg).toMatch(/•\s+balance/);
    expect(msg).toMatch(/Heuristics-only mode/i);
  });
  test('catalog covers core handled actions incl. deposit/withdraw', () => {
    const joined = parser.CAPABILITY_CATALOG.join(' ');
    ['balance', 'accounts', 'transaction', 'transfer', 'deposit', 'withdraw'].forEach((k) =>
      expect(joined.toLowerCase()).toContain(k));
  });
});
