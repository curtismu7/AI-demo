/**
 * Regression: api_key-disposition tools must SKIP RFC 8693 delegation.
 *
 * Bug: `show_mortgage` is an api_key-disposition tool. The MCP Gateway
 * (banking_mcp_gateway/src/router.ts APIKEY_TOOLS) dispatches it to
 * banking_mortgage_service via X-API-Key with NO OAuth delegation
 * (Phase 266 Path A / Phase 267). But the BFF unconditionally ran the
 * RFC 8693 two-exchange delegation for every tool, which has no valid
 * delegation chain for an api-key tool -> `delegation_chain_broken` ->
 * BFF fell into the `!mcpAccessToken` branch -> callToolLocal (no local
 * handler for show_mortgage) -> 502 "Delegation chain validation failed".
 *
 * Fix: for api_key-disposition tools, resolveMcpAccessTokenWithEvents
 * returns the PLAIN user token (exchange_mode='api_key_passthrough',
 * apiKeyTool:true) WITHOUT entering any exchange machinery, so server.js
 * proceeds down the normal gateway path and the gateway swaps to X-API-Key.
 *
 * Observable seam: RFC 7662 introspection (tokenIntrospectionService
 * .validateToken) is the first thing called AFTER the userToken guard and
 * BEFORE any exchange. The api_key early-return is placed before it, so
 * validateToken must NOT be called for `show_mortgage` but MUST be called
 * for a normal tool. This proves the exchange path was not entered.
 */

// --- Mock the exchange/introspection seams (no network) -----------------------
jest.mock('../services/tokenIntrospectionService', () => ({
  validateToken: jest.fn(async () => ({
    valid: true,
    sub: 'user-123',
    scopes: 'banking:read banking:write',
    exp: Math.floor(Date.now() / 1000) + 3600,
    aud: 'aud',
    client_id: 'client',
  })),
}));

jest.mock('../services/adminTokenService', () => ({
  shouldUseAdminTokenForTool: jest.fn(() => false),
  getAdminTokenFromSession: jest.fn(() => null),
}));

// Keep audit/telemetry side-effects inert
jest.mock('../services/exchangeAuditStore', () => ({ writeExchangeEvent: jest.fn() }));
jest.mock('../services/mcpTrafficLogger', () => ({ writeMcpTrafficEntry: jest.fn() }));
jest.mock('../services/tokenChainService', () => ({ trackTokenEvent: jest.fn() }));
jest.mock('../services/apiCallTrackerService', () => ({ trackToken: jest.fn() }));
jest.mock('../services/appEventService', () => ({ logEvent: jest.fn() }));

const tokenIntrospectionService = require('../services/tokenIntrospectionService');
const { resolveMcpAccessTokenWithEvents } = require('../services/agentMcpTokenService');

// Unsigned JWT (alg:none) — decodeJwt only reads the payload; no signature check here.
function makeJwt(claims) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return (
    b64({ alg: 'none', typ: 'JWT' }) +
    '.' +
    b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims }) +
    '.sig'
  );
}

const USER_TOKEN = makeJwt({
  sub: 'user-123',
  scope: 'banking:read banking:write banking:agent:invoke',
});

function fakeReq() {
  return {
    sessionID: 'sess-1',
    session: {
      oauthTokens: { accessToken: USER_TOKEN, scope: 'banking:read banking:write' },
    },
  };
}

describe('resolveMcpAccessTokenWithEvents — api_key-disposition tools skip RFC 8693', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('show_mortgage returns the PLAIN user token without entering the exchange path', async () => {
    const result = await resolveMcpAccessTokenWithEvents(fakeReq(), 'show_mortgage');

    // The plain user token is forwarded — NOT an exchanged token.
    expect(result.token).toBe(USER_TOKEN);
    expect(result.apiKeyTool).toBe(true);
    expect(result.exchange_mode).toBe('api_key_passthrough');
    expect(result.userSub).toBe('user-123');

    // Proof the exchange machinery was never entered: RFC 7662 introspection
    // (the first step after the userToken guard, before any exchange) is skipped.
    expect(tokenIntrospectionService.validateToken).not.toHaveBeenCalled();

    // A token event explains why no delegation happens.
    const ev = (result.tokenEvents || []).find(
      (e) => e && /api[_-]?key/i.test(e.id || '') || /api_key|X-API-Key/i.test(e.explanation || '')
    );
    expect(ev).toBeTruthy();
  });

  test('a normal tool (get_my_transactions) still enters the exchange path', async () => {
    // It is fine for the exchange to fail/throw later; we only assert the
    // exchange path was ENTERED — i.e. introspection ran (api_key early-return
    // did NOT short-circuit it).
    try {
      await resolveMcpAccessTokenWithEvents(fakeReq(), 'get_my_transactions');
    } catch (_e) {
      /* downstream exchange may throw without network — irrelevant here */
    }
    expect(tokenIntrospectionService.validateToken).toHaveBeenCalled();
  });
});
