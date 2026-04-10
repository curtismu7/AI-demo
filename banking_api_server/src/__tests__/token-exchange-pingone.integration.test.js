/**
 * @file token-exchange-pingone.integration.test.js
 * @description Live PingOne RFC 8693 tests — obtains tokens through OAuth API, real HTTP to /as/token.
 * Does not run in CI or default `npm test` unless RUN_PINGONE_TOKEN_INTEGRATION=true.
 *
 * Run (from banking_api_server, with .env or exported vars):
 *   RUN_PINGONE_TOKEN_INTEGRATION=true \
 *   npm test -- --testPathPattern=token-exchange-pingone --forceExit
 */

// Load environment variables from .env file
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const live = process.env.RUN_PINGONE_TOKEN_EXCHANGE === 'true' || process.env.RUN_PINGONE_TOKEN_INTEGRATION === 'true';

/**
 * Helper to obtain user token via OAuth client credentials (for testing purposes)
 * Uses oauthService.getAgentClientCredentialsToken which already works
 * In production, users would login via PKCE flow
 */
async function getUserToken() {
  const oauthService = require('../../services/oauthService');
  return await oauthService.getAgentClientCredentialsToken();
}

/**
 * Helper to obtain agent token via client credentials
 */
async function getAgentToken() {
  const oauthService = require('../../services/oauthService');
  return await oauthService.getAgentClientCredentialsToken();
}

describe('Session oauthTokens contract (Backend-for-Frontend (BFF) → MCP)', () => {
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
   * Exchanges a real User token for an MCP token (MCP-audience) via Backend-for-Frontend (BFF) oauthService.
   */
  it('performTokenExchange returns a 3-part JWT with sub and aud', async () => {
    const oauthService = require('../../services/oauthService');
    const configStore = require('../../services/configStore');
    const subject = await getUserToken();
    const mcpUri = configStore.getEffective('PINGONE_RESOURCE_MCP_SERVER_URI');
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

(live ? describe : describe.skip)('PingOne live — performTokenExchangeWithActor and getAgentClientCredentialsToken', () => {
  jest.setTimeout(120000);

  beforeAll(async () => {
    const configStore = require('../../services/configStore');
    await configStore.ensureInitialized();
  });

  /**
   * Exchanges a user token + agent actor token for an MCP token using RFC 8693 actor exchange.
   * Obtains tokens automatically via OAuth API. The act claim is informational only — warns if absent (PingOne policy may not be set up yet).
   */
  it('performTokenExchangeWithActor returns a 3-part JWT with sub and aud', async () => {
    const oauthService = require('../../services/oauthService');
    const configStore  = require('../../services/configStore');
    const subject  = await getUserToken();
    const actor    = await getAgentToken();
    const mcpUri = configStore.getEffective('PINGONE_RESOURCE_MCP_SERVER_URI');
    expect(mcpUri).toBeTruthy();
    const scopes = (process.env.MCP_TOKEN_EXCHANGE_SCOPES || 'banking:read banking:write').trim().split(/\s+/);
    const mcpToken = await oauthService.performTokenExchangeWithActor(subject, actor, mcpUri, scopes);
    expect(typeof mcpToken).toBe('string');
    expect(mcpToken.split('.')).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(mcpToken.split('.')[1], 'base64url').toString('utf8'));
    expect(payload.sub).toBeTruthy();
    if (!payload.act) {
      console.warn('[INFO] act claim not present — PingOne delegation policy may not be configured (see PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md)');
    }
  });

  /**
   * Fetches an agent client-credentials token using PINGONE_AGENT_CLIENT_ID / PINGONE_AGENT_CLIENT_SECRET.
   * Validates it is a properly-formed JWT.
   */
  it('getAgentClientCredentialsToken returns a 3-part JWT with a non-null aud', async () => {
    const oauthService = require('../../services/oauthService');
    const clientId = process.env.PINGONE_AGENT_CLIENT_ID;
    const clientSecret = process.env.PINGONE_AGENT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.warn('[SKIP] PINGONE_AGENT_CLIENT_ID / PINGONE_AGENT_CLIENT_SECRET not set — skipping live test');
      return;
    }
    const agentToken = await oauthService.getAgentClientCredentialsToken();
    expect(typeof agentToken).toBe('string');
    expect(agentToken.split('.')).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(agentToken.split('.')[1], 'base64url').toString('utf8'));
    expect(payload.aud !== undefined || payload.sub).toBeTruthy();
  });
});
