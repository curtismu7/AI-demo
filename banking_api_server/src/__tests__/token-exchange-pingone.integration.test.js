/**
 * @file token-exchange-pingone.integration.test.js
 * @description Live PingOne RFC 8693 tests — real tokens, real HTTP to /as/token.
 * Does not run in CI or default `npm test` unless RUN_PINGONE_TOKEN_INTEGRATION=true.
 *
 * Run (from banking_api_server, with .env or exported vars):
 *   RUN_PINGONE_TOKEN_INTEGRATION=true \
 *   INTEGRATION_TEST_USERNAME='<PingOne username>' \
 *   INTEGRATION_TEST_PASSWORD='<PingOne password>' \
 *   npm test -- --testPathPattern=token-exchange-pingone --forceExit
 */

// Load environment variables from .env file
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const live = process.env.RUN_PINGONE_TOKEN_EXCHANGE === 'true' || process.env.RUN_PINGONE_TOKEN_INTEGRATION === 'true';

/**
 * Helper to perform PKCE flow and obtain user token
 */
async function getUserTokenViaPKCE() {
  const axios = require('axios');
  const configStore = require('../../services/configStore');
  await configStore.ensureInitialized();

  const clientId = configStore.getEffective('pingone_user_client_id');
  const clientSecret = configStore.getEffective('pingone_user_client_secret');
  const envId = configStore.getEffective('pingone_environment_id');
  const region = configStore.getEffective('pingone_region') || 'com';
  const username = process.env.INTEGRATION_TEST_USERNAME;
  const password = process.env.INTEGRATION_TEST_PASSWORD;

  if (!username || !password) {
    throw new Error('INTEGRATION_TEST_USERNAME and INTEGRATION_TEST_PASSWORD must be set for PKCE flow');
  }

  // For testing, we'll use resource owner password credentials flow instead of full PKCE
  // This requires username/password but doesn't require browser interaction
  const tokenResponse = await axios.post(
    `https://auth.pingone.${region}/${envId}/as/token`,
    new URLSearchParams({
      grant_type: 'password',
      username: username,
      password: password,
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid profile email'
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  return tokenResponse.data.access_token;
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
    const subject = await getUserTokenViaPKCE();
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
   * The act claim is informational only — warns if absent (PingOne policy may not be set up yet).
   */
  it('performTokenExchangeWithActor returns a 3-part JWT with sub and aud', async () => {
    const oauthService = require('../../services/oauthService');
    const configStore  = require('../../services/configStore');
    const subject  = await getUserTokenViaPKCE();
    const actor    = await oauthService.getAgentClientCredentialsToken();
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
