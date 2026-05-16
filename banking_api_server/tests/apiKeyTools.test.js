/**
 * Unit: apiKeyTools — single source of truth that mirrors the gateway's
 * APIKEY_TOOLS set (banking_mcp_gateway/src/router.ts).
 */
const { API_KEY_TOOLS, isApiKeyTool } = require('../services/apiKeyTools');

describe('apiKeyTools', () => {
  test('isApiKeyTool is true for show_mortgage', () => {
    expect(isApiKeyTool('show_mortgage')).toBe(true);
  });

  test('isApiKeyTool is false for a normal OAuth-delegated tool', () => {
    expect(isApiKeyTool('get_my_transactions')).toBe(false);
  });

  test('isApiKeyTool is false for unknown/undefined input', () => {
    expect(isApiKeyTool('not_a_tool')).toBe(false);
    expect(isApiKeyTool(undefined)).toBe(false);
  });

  test('API_KEY_TOOLS is a Set containing show_mortgage', () => {
    expect(API_KEY_TOOLS instanceof Set).toBe(true);
    expect(API_KEY_TOOLS.has('show_mortgage')).toBe(true);
  });
});
