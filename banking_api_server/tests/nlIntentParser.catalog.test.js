// banking_api_server/tests/nlIntentParser.catalog.test.js
const parser = require('../services/nlIntentParser');

describe('capability catalog', () => {
  test('exports CAPABILITY_CATALOG as a non-empty string array', () => {
    expect(Array.isArray(parser.CAPABILITY_CATALOG)).toBe(true);
    expect(parser.CAPABILITY_CATALOG.length).toBeGreaterThan(3);
    parser.CAPABILITY_CATALOG.forEach((c) => expect(typeof c).toBe('string'));
  });
  test('buildCatalogMessage returns a message containing every catalog item', () => {
    const msg = parser.buildCatalogMessage();
    parser.CAPABILITY_CATALOG.forEach((c) => expect(msg).toContain(c));
    expect(msg).toMatch(/can help/i);
  });
});
