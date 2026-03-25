/**
 * @file token-exchange-pingone.integration.test.js
 * @description Opt-in live PingOne RFC 8693 tests — real tokens, real HTTP to /as/token.
 * Does not run in CI or default `npm test` unless RUN_PINGONE_TOKEN_INTEGRATION=true.
 *
 * Run (from banking_api_server, with .env or exported vars):
 *   RUN_PINGONE_TOKEN_INTEGRATION=true \
 *   INTEGRATION_SUBJECT_ACCESS_TOKEN='<paste User token JWT>' \
 *   npm test -- --testPathPattern=token-exchange-pingone --forceExit
 */

const live =
  process.env.RUN_PINGONE_TOKEN_INTEGRATION === 'true' &&
  String(process.env.INTEGRATION_SUBJECT_ACCESS_TOKEN || '').trim().length > 0;

describe('Session oauthTokens contract (BFF → MCP)', () => {
  /**
   * Same shape as production: routes/oauth persist accessToken for mcpWebSocketClient.getSessionAccessToken.
   */
  it('getSessionAccessToken reads oauthTokens.accessToken', () => {
    const { getSessionAccessToken } = require('../../services/mcpWebSocketClient');
    const req = {
      session: {
        oauthTokens: {
          accessToken: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0In0.',
          refreshToken: 'refresh',
        },
      },
    };
    expect(getSessionAccessToken(req)).toBe(req.session.oauthTokens.accessToken);
  });
});

(live ? describe : describe.skip)('PingOne live token exchange (RFC 8693)', () => {
  jest.setTimeout(120000);

  beforeAll(async () => {
    const configStore = require('../../services/configStore');
    await configStore.ensureInitialized();
  });

  /**
   * Exchanges a real User token for an MCP token (MCP-audience) via BFF oauthService.
   */
  it('performTokenExchange returns a 3-part JWT with sub and aud', async () => {
    const oauthService = require('../../services/oauthService');
    const configStore = require('../../services/configStore');
    const subject = process.env.INTEGRATION_SUBJECT_ACCESS_TOKEN;
    const mcpUri = configStore.getEffective('mcp_resource_uri');
    expect(mcpUri).toBeTruthy();
    const scopes = (process.env.MCP_TOKEN_EXCHANGE_SCOPES || 'banking:read banking:write')
      .trim()
      .split(/\s+/);
    const mcpToken = await oauthService.performTokenExchange(subject, mcpUri, scopes);
    expect(typeof mcpToken).toBe('string');
    expect(mcpToken.split('.')).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(mcpToken.split('.')[1], 'base64url').toString('utf8'));
    expect(payload.sub).toBeTruthy();
    expect(payload.aud !== undefined || payload.scope).toBeTruthy();
  });
});
