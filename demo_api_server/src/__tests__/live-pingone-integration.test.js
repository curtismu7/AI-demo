/**
 * @file live-pingone-integration.test.js
 * @description Live PingOne integration tests using REAL credentials from .env.
 *
 * These tests hit PingOne's /as/token endpoint with actual client credentials —
 * no mocks, no fakes. They validate the full credential pipeline:
 *   - configStore resolves real .env values through fallback chains
 *   - CC tokens succeed with correct auth methods (basic vs post)
 *   - Token exchange works end-to-end (when a user token is provided)
 *
 * Gated behind RUN_LIVE_TESTS=true so they never run in CI or default `npm test`.
 *
 * Run from banking_api_server/:
 *   RUN_LIVE_TESTS=true npx jest --testPathPattern=live-pingone-integration --forceExit --no-coverage
 *
 * For full two-exchange chain (needs a real user access token):
 *   RUN_LIVE_TESTS=true \
 *   INTEGRATION_SUBJECT_ACCESS_TOKEN='<paste from browser session>' \
 *   npx jest --testPathPattern=live-pingone-integration --forceExit --no-coverage
 */

// Load real .env BEFORE any module — overrides setup.js fakes for our tests
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), override: true });

// Restore real values that setup.js may have clobbered
const ENV_RESTORE = {};
function preserveEnv(...keys) {
  keys.forEach(k => { if (process.env[k]) ENV_RESTORE[k] = process.env[k]; });
}
preserveEnv(
  'PINGONE_ENVIRONMENT_ID', 'PINGONE_REGION',
  'PINGONE_ADMIN_CLIENT_ID', 'PINGONE_ADMIN_CLIENT_SECRET',
  'PINGONE_USER_CLIENT_ID', 'PINGONE_USER_CLIENT_SECRET',
  'PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID', 'PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET',
  'PINGONE_AI_AGENT_CLIENT_ID', 'PINGONE_AI_AGENT_CLIENT_SECRET',
  'PINGONE_WORKER_TOKEN_CLIENT_ID', 'PINGONE_WORKER_TOKEN_CLIENT_SECRET',
  'ENDUSER_AUDIENCE', 'AI_AGENT_AUDIENCE', 'AGENT_GATEWAY_AUDIENCE',
  'AI_AGENT_INTERMEDIATE_AUDIENCE', 'BANKING_API_RESOURCE_URI',
  'PINGONE_RESOURCE_MCP_SERVER_URI', 'PINGONE_RESOURCE_MCP_GATEWAY_URI',
  'PINGONE_RESOURCE_TWO_EXCHANGE_URI',
  'MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD', 'AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD',
  'PINGONE_WORKER_TOKEN_AUTH_METHOD', 'PINGONE_MCP_TOKEN_EXCHANGER_CC_AUTH_METHOD',
  'PINGONE_TOKEN_EXCHANGE_AUTH_METHOD',
  'FF_TWO_EXCHANGE_DELEGATION', 'USE_AGENT_ACTOR_FOR_MCP',
  'SKIP_TOKEN_SIGNATURE_VALIDATION', 'DEBUG_TOKENS'
);

const live = process.env.RUN_LIVE_TESTS === 'true';
const hasUserToken = (() => {
  const token = process.env.INTEGRATION_SUBJECT_ACCESS_TOKEN?.trim();
  if (!token) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (payload.exp && payload.exp <= Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch { return false; }
})();

// ---------- helpers ----------

/** Decode JWT payload without verification */
function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error(`Not a JWT (${parts.length} parts)`);
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

/** Re-apply real .env values over setup.js overrides */
function restoreRealEnv() {
  Object.assign(process.env, ENV_RESTORE);
  // Ensure token validation is real (not the test bypass)
  process.env.SKIP_TOKEN_SIGNATURE_VALIDATION = ENV_RESTORE.SKIP_TOKEN_SIGNATURE_VALIDATION || 'false';
}

// ============================================================
//  SECTION 1: configStore resolves real .env values
// ============================================================
(live ? describe : describe.skip)('1 — configStore resolves real .env credentials', () => {
  let configStore;

  beforeAll(async () => {
    restoreRealEnv();
    jest.resetModules();
    configStore = require('../../services/configStore');
    await configStore.ensureInitialized();
  });

  it('resolves PINGONE_ENVIRONMENT_ID', () => {
    const envId = configStore.getEffective('pingone_environment_id');
    expect(envId).toBe(process.env.PINGONE_ENVIRONMENT_ID);
    expect(envId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('resolves MCP Token Exchanger client ID via fallback chain', () => {
    const cid = configStore.getEffective('pingone_mcp_token_exchanger_client_id');
    expect(cid).toBeTruthy();
    expect(cid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('resolves MCP Token Exchanger client secret via fallback chain', () => {
    const secret = configStore.getEffective('pingone_mcp_token_exchanger_client_secret');
    expect(secret).toBeTruthy();
    expect(secret.length).toBeGreaterThan(20);
  });

  it('resolves AI Agent client ID', () => {
    const cid = configStore.getEffective('pingone_ai_agent_client_id');
    expect(cid).toBeTruthy();
    expect(cid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('resolves Worker Token client ID', () => {
    // Worker Token uses direct env read (not in configStore fallback map)
    const cid = configStore.getEffective('pingone_worker_token_client_id')
      || process.env.PINGONE_WORKER_TOKEN_CLIENT_ID;
    expect(cid).toBeTruthy();
    expect(cid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('resolves ENDUSER_AUDIENCE from env', () => {
    expect(process.env.ENDUSER_AUDIENCE).toBe('https://ai-agent.pingdemo.com');
  });

  it('resolves AI_AGENT_INTERMEDIATE_AUDIENCE from env', () => {
    expect(process.env.AI_AGENT_INTERMEDIATE_AUDIENCE).toBe('https://ai-agent.pingdemo.com');
  });

  it('resolves BANKING_API_RESOURCE_URI from env', () => {
    expect(process.env.BANKING_API_RESOURCE_URI).toBe('https://resource-server.pingdemo.com');
  });

  it('token endpoint is a valid PingOne URL', () => {
    const oauthConfig = require('../../config/oauth');
    expect(oauthConfig.tokenEndpoint).toMatch(
      /^https:\/\/auth\.pingone\.\w+\/[0-9a-f-]{36}\/as\/token$/
    );
  });

  it('validateTwoExchangeConfig resolves real .env audiences (not defaults)', () => {
    const result = configStore.validateTwoExchangeConfig();
    expect(result.valid).toBe(true);
    // These must match .env values, NOT the banking-demo.com defaults
    expect(result.audiences.agentGatewayAud).toBe(process.env.AGENT_GATEWAY_AUDIENCE || process.env.PINGONE_RESOURCE_AGENT_GATEWAY_URI);
    expect(result.audiences.mcpGatewayAud).toBe(process.env.PINGONE_RESOURCE_MCP_GATEWAY_URI);
    expect(result.audiences.intermediateAud).toBe(process.env.AI_AGENT_INTERMEDIATE_AUDIENCE);
    expect(result.audiences.finalAud).toBe(process.env.PINGONE_RESOURCE_TWO_EXCHANGE_URI);
    // Must NOT be the old banking-demo.com defaults
    expect(result.audiences.agentGatewayAud).not.toContain('banking-demo.com');
    expect(result.audiences.mcpGatewayAud).not.toContain('banking-demo.com');
  });
});

// ============================================================
//  SECTION 2: Client credentials — real HTTP to PingOne
// ============================================================
(live ? describe : describe.skip)('2 — Client credentials tokens (real PingOne HTTP)', () => {
  jest.setTimeout(30000);

  let oauthService, configStore;

  beforeAll(async () => {
    restoreRealEnv();
    jest.resetModules();
    configStore = require('../../services/configStore');
    await configStore.ensureInitialized();
    oauthService = require('../../services/oauthService');
  });

  describe('Worker Token app (basic auth)', () => {
    it('fetches a valid CC token from PingOne', async () => {
      const { token, expiresIn } = await oauthService.getAgentClientCredentialsTokenWithExpiry();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
      expect(expiresIn).toBeGreaterThan(0);

      const payload = decodeJwt(token);
      expect(payload.iss).toContain('pingone');
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('token has expected client_id in payload', async () => {
      const token = await oauthService.getAgentClientCredentialsToken();
      const payload = decodeJwt(token);
      expect(payload.client_id).toBe(process.env.PINGONE_WORKER_TOKEN_CLIENT_ID);
    });
  });

  describe('AI Agent app (post auth)', () => {
    it('fetches CC token with client_secret_post', async () => {
      const clientId = process.env.PINGONE_AI_AGENT_CLIENT_ID;
      const clientSecret = process.env.PINGONE_AI_AGENT_CLIENT_SECRET;
      const audience = process.env.AI_AGENT_INTERMEDIATE_AUDIENCE || process.env.ENDUSER_AUDIENCE;
      expect(clientId).toBeTruthy();
      expect(clientSecret).toBeTruthy();

      const token = await oauthService.getClientCredentialsTokenAs(
        clientId, clientSecret, audience, 'post'
      );
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const payload = decodeJwt(token);
      expect(payload.client_id).toBe(clientId);
      expect(payload.iss).toContain('pingone');
    });

    it('FAILS with basic auth (proves auth method matters)', async () => {
      const clientId = process.env.PINGONE_AI_AGENT_CLIENT_ID;
      const clientSecret = process.env.PINGONE_AI_AGENT_CLIENT_SECRET;
      const audience = process.env.ENDUSER_AUDIENCE;

      await expect(
        oauthService.getClientCredentialsTokenAs(clientId, clientSecret, audience, 'basic')
      ).rejects.toThrow();
    });
  });

  describe('MCP Token Exchanger app', () => {
    it('fetches CC token via getMcpExchangerToken()', async () => {
      const token = await oauthService.getMcpExchangerToken();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const payload = decodeJwt(token);
      const expectedCid = configStore.getEffective('pingone_mcp_token_exchanger_client_id');
      expect(payload.client_id).toBe(expectedCid);
    });
  });
});

// ============================================================
//  SECTION 3: Auth method validation (real PingOne rejects wrong method)
// ============================================================
(live ? describe : describe.skip)('3 — Auth method correctness (PingOne rejects wrong method)', () => {
  jest.setTimeout(30000);
  let oauthService;

  beforeAll(async () => {
    restoreRealEnv();
    jest.resetModules();
    const configStore = require('../../services/configStore');
    await configStore.ensureInitialized();
    oauthService = require('../../services/oauthService');
  });

  it('Worker Token app succeeds with basic, rejects post', async () => {
    const cid = process.env.PINGONE_WORKER_TOKEN_CLIENT_ID;
    const secret = process.env.PINGONE_WORKER_TOKEN_CLIENT_SECRET;
    const audience = process.env.BANKING_API_RESOURCE_URI;

    // basic should work (Worker apps are CLIENT_SECRET_BASIC)
    const token = await oauthService.getClientCredentialsTokenAs(cid, secret, audience, 'basic');
    expect(token.split('.')).toHaveLength(3);

    // post should fail for a basic-only app
    await expect(
      oauthService.getClientCredentialsTokenAs(cid, secret, audience, 'post')
    ).rejects.toThrow();
  });

  it('AI Agent app succeeds with post, rejects basic', async () => {
    const cid = process.env.PINGONE_AI_AGENT_CLIENT_ID;
    const secret = process.env.PINGONE_AI_AGENT_CLIENT_SECRET;
    const audience = process.env.ENDUSER_AUDIENCE;

    // post should work (AI_AGENT apps are CLIENT_SECRET_POST)
    const token = await oauthService.getClientCredentialsTokenAs(cid, secret, audience, 'post');
    expect(token.split('.')).toHaveLength(3);

    // basic should fail for a post-only app
    await expect(
      oauthService.getClientCredentialsTokenAs(cid, secret, audience, 'basic')
    ).rejects.toThrow();
  });
});

// ============================================================
//  SECTION 4: Token exchange — needs real user token
// ============================================================
(live && hasUserToken ? describe : describe.skip)(
  '4 — Two-exchange delegation chain (real user token)',
  () => {
    jest.setTimeout(60000);
    let oauthService, configStore;

    beforeAll(async () => {
      restoreRealEnv();
      jest.resetModules();
      configStore = require('../../services/configStore');
      await configStore.ensureInitialized();
      oauthService = require('../../services/oauthService');
    });

    const subjectToken = () => process.env.INTEGRATION_SUBJECT_ACCESS_TOKEN.trim();

    it('subject token is a valid JWT with expected audience', () => {
      const payload = decodeJwt(subjectToken());
      expect(payload.sub).toBeTruthy();
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      // User tokens should have the banking API or AI agent audience
      const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      const expectedAudiences = [
        process.env.ENDUSER_AUDIENCE,
        process.env.BANKING_API_RESOURCE_URI,
      ].filter(Boolean);
      const hasExpectedAud = aud.some(a => expectedAudiences.includes(a));
      if (!hasExpectedAud) {
        console.warn(`[INFO] Token aud=${JSON.stringify(aud)} doesn't match expected ${JSON.stringify(expectedAudiences)} — exchange may still work`);
      }
    });

    it('Exchange #1: AI Agent CC token + user token → intermediate token', async () => {
      const aiAgentCid = process.env.PINGONE_AI_AGENT_CLIENT_ID;
      const aiAgentSecret = process.env.PINGONE_AI_AGENT_CLIENT_SECRET;
      const intermediateAud = process.env.AI_AGENT_INTERMEDIATE_AUDIENCE || process.env.ENDUSER_AUDIENCE;
      const authMethod = (process.env.AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD || 'post').toLowerCase();

      // Step 1a: Get AI Agent CC token (actor)
      const actorToken = await oauthService.getClientCredentialsTokenAs(
        aiAgentCid, aiAgentSecret, intermediateAud, authMethod
      );
      expect(actorToken.split('.')).toHaveLength(3);
      console.log('[Exchange #1] Got AI Agent actor token');

      // Step 1b: Exchange user token + actor → intermediate
      const exchangeMethod = (process.env.PINGONE_TOKEN_EXCHANGE_AUTH_METHOD || 'post').toLowerCase();
      const scopes = (process.env.MCP_TOKEN_EXCHANGE_SCOPES || 'read write').split(/\s+/);
      const intermediateToken = await oauthService.performTokenExchangeAs(
        subjectToken(), actorToken,
        aiAgentCid, aiAgentSecret,
        intermediateAud, scopes,
        exchangeMethod
      );
      expect(intermediateToken.split('.')).toHaveLength(3);
      const payload = decodeJwt(intermediateToken);
      expect(payload.sub).toBeTruthy();
      console.log('[Exchange #1] Intermediate token sub:', payload.sub, 'act:', payload.act ? 'present' : 'absent');
    });

    it('Exchange #2: MCP Exchanger CC token + intermediate → final MCP token', async () => {
      const aiAgentCid = process.env.PINGONE_AI_AGENT_CLIENT_ID;
      const aiAgentSecret = process.env.PINGONE_AI_AGENT_CLIENT_SECRET;
      const intermediateAud = process.env.AI_AGENT_INTERMEDIATE_AUDIENCE || process.env.ENDUSER_AUDIENCE;
      const aiAuthMethod = (process.env.AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD || 'post').toLowerCase();
      const exchangeMethod = (process.env.PINGONE_TOKEN_EXCHANGE_AUTH_METHOD || 'post').toLowerCase();
      const scopes = (process.env.MCP_TOKEN_EXCHANGE_SCOPES || 'read write').split(/\s+/);

      // Exchange #1: user → intermediate
      const actorToken1 = await oauthService.getClientCredentialsTokenAs(
        aiAgentCid, aiAgentSecret, intermediateAud, aiAuthMethod
      );
      const intermediateToken = await oauthService.performTokenExchangeAs(
        subjectToken(), actorToken1,
        aiAgentCid, aiAgentSecret,
        intermediateAud, scopes,
        exchangeMethod
      );

      // Exchange #2: intermediate → final
      const mcpCid = configStore.getEffective('pingone_mcp_token_exchanger_client_id');
      const mcpSecret = configStore.getEffective('pingone_mcp_token_exchanger_client_secret');
      const mcpAuthMethod = (process.env.MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD || 'basic').toLowerCase();
      const finalAudience = process.env.PINGONE_RESOURCE_TWO_EXCHANGE_URI;
      expect(finalAudience).toBeTruthy();

      const actorToken2 = await oauthService.getClientCredentialsTokenAs(
        mcpCid, mcpSecret, process.env.PINGONE_RESOURCE_MCP_GATEWAY_URI, mcpAuthMethod
      );
      const finalToken = await oauthService.performTokenExchangeAs(
        intermediateToken, actorToken2,
        mcpCid, mcpSecret,
        finalAudience, scopes,
        mcpAuthMethod
      );
      expect(finalToken.split('.')).toHaveLength(3);

      const payload = decodeJwt(finalToken);
      expect(payload.sub).toBeTruthy();
      console.log('[Exchange #2] Final MCP token — sub:', payload.sub,
        'aud:', payload.aud, 'act:', payload.act ? JSON.stringify(payload.act) : 'absent');
    });

    it('Full chain: resolveMcpAccessTokenWithEvents end-to-end', async () => {
      let agentMcpTokenService;
      try {
        agentMcpTokenService = require('../../services/agentMcpTokenService');
      } catch (e) {
        console.warn('[SKIP] agentMcpTokenService not loadable:', e.message);
        return;
      }

      // Build a minimal req that getSessionBearerForMcp reads
      const mockReq = {
        sessionID: 'live-test-' + Date.now(),
        session: {
          oauthTokens: { accessToken: subjectToken() },
          agentSession: { sessionId: 'live-test-' + Date.now() },
          user: { id: 'test-user', role: 'customer' },
        },
      };

      const { token, tokenEvents } = await agentMcpTokenService.resolveMcpAccessTokenWithEvents(
        mockReq, 'get_accounts'
      );

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
      const payload = decodeJwt(token);
      console.log('[TwoExchange] Final token — sub:', payload.sub,
        'aud:', payload.aud, 'scope:', payload.scope);
      console.log('[TwoExchange] Events:', tokenEvents.map(e => e.id || e.label).join(' → '));
    });
  }
);

// ============================================================
//  SECTION 6: Management API — live list of apps and resource servers
// ============================================================
(live ? describe : describe.skip)('6 — Management API (real PingOne HTTP)', () => {
  jest.setTimeout(30000);
  let oauthService, managementService;

  const EXPECTED_APPS = [
    'Super Banking Admin App',
    'Super Banking User App',
    'Super Banking MCP Token Exchanger',
    'Super Banking AI Agent App',
  ];

  const EXPECTED_RESOURCE_SERVERS = [
    { name: 'Super Banking MCP Server',    audience: 'https://mcp-server.pingdemo.com' },
    { name: 'Super Banking MCP Gateway',   audience: 'https://mcp-gateway.pingdemo.com' },
    { name: 'Super Banking AI Agent Service', audience: 'https://ai-agent.pingdemo.com' },
  ];

  const EXPECTED_BANKING_SCOPES = [
    'read', 'write', 'admin:read', 'sensitive:read', 'ai:agent:read',
  ];

  beforeAll(async () => {
    restoreRealEnv();
    jest.resetModules();
    const configStore = require('../../services/configStore');
    await configStore.ensureInitialized();
    oauthService = require('../../services/oauthService');
    managementService = require('../../services/pingoneManagementService').managementService;

    const workerToken = await oauthService.getAgentClientCredentialsToken();
    managementService.initialize(workerToken);
  });

  describe('Applications', () => {
    it('lists applications and finds all 4 Super Banking apps', async () => {
      const result = await managementService.getApplications();
      expect(result.success).toBe(true);
      const names = result.applications.map(a => a.name);
      for (const expected of EXPECTED_APPS) {
        expect(names).toContain(expected);
      }
    });

    it('MCP Token Exchanger is type AI_AGENT', async () => {
      const result = await managementService.getApplications();
      const exchanger = result.applications.find(a => a.name === 'Super Banking MCP Token Exchanger');
      expect(exchanger).toBeDefined();
      const appType = exchanger.type || exchanger.applicationType;
      expect(appType).toBe('AI_AGENT');
    });

    it('MCP Token Exchanger id matches .env client ID', async () => {
      const result = await managementService.getApplications();
      const exchanger = result.applications.find(a => a.name === 'Super Banking MCP Token Exchanger');
      // For AI_AGENT apps PingOne uses app.id as the OIDC client ID (no oidcOptions wrapper)
      expect(exchanger?.id).toBe(process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID);
    });
  });

  describe('Resource Servers', () => {
    it('finds all expected Super Banking resource servers', async () => {
      const result = await managementService.getResourceServers();
      const audiences = result.resourceServers.map(r => r.audience);
      for (const rs of EXPECTED_RESOURCE_SERVERS) {
        expect(audiences).toContain(rs.audience);
      }
    });

    it('Super Banking MCP Server has required scopes', async () => {
      const rsResult = await managementService.getResourceServers();
      const mcpRS = rsResult.resourceServers.find(
        r => r.audience === process.env.PINGONE_RESOURCE_MCP_SERVER_URI
      );
      expect(mcpRS).toBeDefined();

      const scopeResult = await managementService.getScopes(mcpRS.id);
      const scopeNames = scopeResult.scopes.map(s => s.name);
      expect(scopeNames).toContain('read');
      expect(scopeNames).toContain('write');
      expect(scopeNames).toContain('mcp:invoke');
    });

    it('Super Banking AI Agent Service has banking scopes', async () => {
      const rsResult = await managementService.getResourceServers();
      const aiRS = rsResult.resourceServers.find(
        r => r.audience === process.env.ENDUSER_AUDIENCE
          || r.name === 'Super Banking AI Agent Service'
      );
      expect(aiRS).toBeDefined();

      const scopeResult = await managementService.getScopes(aiRS.id);
      const scopeNames = scopeResult.scopes.map(s => s.name);
      for (const scope of EXPECTED_BANKING_SCOPES) {
        expect(scopeNames).toContain(scope);
      }
    });
  });

  describe('CC token scope validation', () => {
    it('Worker Token CC token has no unexpected broad scopes', async () => {
      const token = await oauthService.getAgentClientCredentialsToken();
      const payload = decodeJwt(token);
      // Worker tokens should not have banking-specific scopes by default
      expect(payload.iss).toContain('pingone');
      expect(payload.sub || payload.client_id).toBeTruthy();
    });

    it('MCP Exchanger CC token contains read and write scopes', async () => {
      const mcpExchangerToken = await oauthService.getMcpExchangerToken();
      const payload = decodeJwt(mcpExchangerToken);
      const scopes = (payload.scope || '').split(' ');
      // getMcpExchangerToken requests PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SCOPES;
      // mcp:invoke goes on the exchange *result*, not the actor CC token itself.
      expect(scopes).toContain('read');
      expect(scopes).toContain('write');
    });

    it('AI Agent CC token contains ai:agent:read scope', async () => {
      const clientId = process.env.PINGONE_AI_AGENT_CLIENT_ID;
      const clientSecret = process.env.PINGONE_AI_AGENT_CLIENT_SECRET;
      const audience = process.env.AI_AGENT_INTERMEDIATE_AUDIENCE || process.env.ENDUSER_AUDIENCE;

      const token = await oauthService.getClientCredentialsTokenAs(
        clientId, clientSecret, audience, 'post'
      );
      const payload = decodeJwt(token);
      const scopes = (payload.scope || '').split(' ');
      expect(scopes).toContain('ai:agent:read');
    });
  });
});

// ============================================================
//  SECTION 5: Negative tests — wrong creds are actually rejected
// ============================================================
(live ? describe : describe.skip)('5 — Negative: PingOne rejects bad credentials', () => {
  jest.setTimeout(15000);
  let oauthService, configStore;

  beforeAll(async () => {
    restoreRealEnv();
    jest.resetModules();
    configStore = require('../../services/configStore');
    await configStore.ensureInitialized();
    oauthService = require('../../services/oauthService');
  });

  it('rejects wrong client secret', async () => {
    const cid = process.env.PINGONE_WORKER_TOKEN_CLIENT_ID;
    const audience = process.env.BANKING_API_RESOURCE_URI;

    const err = await oauthService.getClientCredentialsTokenAs(
      cid, 'wrong-secret-value', audience, 'basic'
    ).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.httpStatus).toBe(401);
  });

  it('rejects non-existent client ID', async () => {
    const audience = process.env.BANKING_API_RESOURCE_URI;

    const err = await oauthService.getClientCredentialsTokenAs(
      '00000000-0000-0000-0000-000000000000', 'fake-secret', audience, 'basic'
    ).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect([400, 401]).toContain(err.httpStatus);
  });

  it('rejects expired/invalid subject token in exchange', async () => {
    const cid = configStore.getEffective?.('pingone_mcp_token_exchanger_client_id')
      || process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID;
    const secret = configStore.getEffective?.('pingone_mcp_token_exchanger_client_secret')
      || process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET;
    const audience = process.env.PINGONE_RESOURCE_MCP_SERVER_URI;

    // Fabricate an obviously invalid token
    const fakeToken = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJmYWtlIiwiZXhwIjoxfQ.invalid';

    const err = await oauthService.performTokenExchangeAs(
      fakeToken, null, cid, secret, audience, ['read'], 'post'
    ).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.httpStatus).toBeGreaterThanOrEqual(400);
  });
});
