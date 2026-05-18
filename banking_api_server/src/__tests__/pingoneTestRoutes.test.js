/**
 * Unit tests for pingoneTestRoutes.js — new endpoints added in Phase 151
 *
 * Covers:
 *   GET  /api/pingone-test/ai-agent-apps
 *   POST /api/pingone-test/update-resources
 *   POST /api/pingone-test/update-scopes
 *   POST /api/pingone-test/update-apps
 *   POST /api/pingone-test/update-user-spel
 *
 * All external dependencies (managementService, oauthService, configStore, axios) are mocked.
 */

const request = require('supertest');

// ─── Mock heavy modules before any require() pulls them in ───────────────────

// Use the 'mock' prefix so Jest's hoist-exception applies — the factory returns
// the SAME object reference even after jest.resetModules(), ensuring inline
// require('axios') inside route handlers sees the same mock we configure here.
const mockAxios = { patch: jest.fn(), get: jest.fn(), post: jest.fn(), delete: jest.fn() };
jest.mock('axios', () => mockAxios);

// Default configStore values — re-applied in beforeEach so individual tests
// can override safely without leaking into subsequent tests.
const DEFAULT_CONFIG = {
  pingone_audience_enduser: 'https://ai-agent.pingdemo.com',
  pingone_resource_mcp_server_uri: 'https://mcp-server.pingdemo.com',
  pingone_region: 'com',
  pingone_environment_id: 'env-test-123',
  admin_client_id: 'admin-client-id-test',
  user_client_id: 'user-client-id-test',
  pingone_mcp_token_exchanger_client_id: 'mcp-cid',
};

jest.mock('../../services/configStore', () => ({
  ensureInitialized: jest.fn().mockResolvedValue(undefined),
  getEffective: jest.fn((key) => DEFAULT_CONFIG[key] || null),
}));

jest.mock('../../services/pingoneManagementService', () => ({
  managementService: {
    initialize: jest.fn(),
    getApplications: jest.fn(),
    getResourceServers: jest.fn(),
    getScopes: jest.fn(),
    createResourceServer: jest.fn(),
    createScopes: jest.fn(),
    enableResourceServer: jest.fn(),
    getApplicationGrants: jest.fn(),
  },
}));

jest.mock('../../services/oauthService', () => ({
  getAgentClientCredentialsToken: jest.fn().mockResolvedValue('mock-worker-token'),
}));

jest.mock('../../services/apiCallTrackerService', () => ({
  trackApiCall: jest.fn().mockResolvedValue(undefined),
}));

// Mock auth middleware so test requests are not blocked
const _authOverride = { user: null };
jest.mock('../../middleware/auth', () => ({
  requireNotBankDelegate: () => (req, res, next) => next(),
  authenticateToken: (req, _res, next) => {
    if (_authOverride.user) {
      req.user = _authOverride.user;
    } else {
      req.user = { id: 'test-admin-id', username: 'admin', role: 'admin', scopes: ['banking:admin'] };
    }
    req.session = req.session || {};
    req.session.user = req.user;
    return next();
  },
  requireScopes: () => (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
  hasRequiredScopes: () => true,
  parseTokenScopes: () => [],
  requireAIAgent: (_req, _res, next) => next(),
  requireOwnershipOrAdmin: (_req, _res, next) => next(),
  requireSession: (_req, _res, next) => next(),
  hashPassword: (p) => p,
}));

jest.mock('../../services/pingOneUserService', () => ({
  getUserById: jest.fn(),
}));

// ─── Require app AFTER mocks ──────────────────────────────────────────────────

const app = require('../../server');
const { managementService } = require('../../services/pingoneManagementService');
const oauthService = require('../../services/oauthService');
const configStore = require('../../services/configStore');

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const MOCK_APPS = [
  { id: 'app-1', name: 'Super Banking Admin App',           type: 'WEB_APP',   oidcOptions: { clientId: 'admin-cid' } },
  { id: 'app-2', name: 'Super Banking User App',            type: 'WEB_APP',   oidcOptions: { clientId: 'user-cid' } },
  { id: 'app-3', name: 'Super Banking MCP Token Exchanger', type: 'AI_AGENT',  oidcOptions: { clientId: 'mcp-cid' } },
  { id: 'app-4', name: 'Super Banking AI Agent App',        type: 'AI_AGENT',  oidcOptions: { clientId: 'aiagg-cid' } },
  { id: 'app-5', name: 'Super Banking Worker Token App',    type: 'WORKER',    oidcOptions: { clientId: 'worker-cid' } },
  { id: 'app-6', name: 'Some Unrelated App',                type: 'WEB_APP',   oidcOptions: { clientId: 'other-cid' } },
];

const MOCK_RS = [
  { id: 'rs-1', name: 'Super Banking AI Agent', audience: 'https://ai-agent.pingdemo.com' },
  { id: 'rs-2', name: 'Super Banking MCP Server', audience: 'https://mcp-server.pingdemo.com' },
];

const BANKING_SCOPES = [
  { name: 'banking:read' }, { name: 'banking:write' },
  { name: 'banking:admin' }, { name: 'banking:sensitive' }, { name: 'banking:ai:agent' },
];

const MCP_SCOPES = [
  { name: 'banking:read' }, { name: 'banking:write' }, { name: 'banking:mcp:invoke' },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pingoneTestRoutes — new Phase 151 endpoints', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore defaults that clearAllMocks would wipe out
    oauthService.getAgentClientCredentialsToken.mockResolvedValue('mock-worker-token');
    managementService.initialize.mockReturnValue(undefined);
    configStore.ensureInitialized.mockResolvedValue(undefined);
    configStore.getEffective.mockImplementation(key => DEFAULT_CONFIG[key] || null);
    mockAxios.patch.mockResolvedValue({ data: {} });
    process.env.MCP_TOKEN_EXCHANGE_SCOPES = 'banking:read banking:write banking:mcp:invoke';
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/pingone-test/ai-agent-apps
  // ─────────────────────────────────────────────────────────────────────────
  describe('GET /api/pingone-test/ai-agent-apps', () => {

    it('returns AI_AGENT apps with isSuperBanking flag and empty missingExpected when both known apps found', async () => {
      managementService.getApplications.mockResolvedValue({
        success: true,
        applications: MOCK_APPS,
      });

      const res = await request(app).get('/api/pingone-test/ai-agent-apps');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.apps).toHaveLength(2); // only AI_AGENT apps
      expect(res.body.apps.map(a => a.name)).toEqual(
        expect.arrayContaining(['Super Banking MCP Token Exchanger', 'Super Banking AI Agent App'])
      );
      // Both known Super Banking AI apps are present — no missing
      expect(res.body.missingExpected).toHaveLength(0);
      expect(res.body.totalApps).toBe(MOCK_APPS.length);
      expect(res.body.count).toBe(2);
    });

    it('isSuperBanking is true only for known Super Banking AI apps', async () => {
      const appsWithExtra = [
        ...MOCK_APPS,
        { id: 'app-x', name: 'Third-Party AI App', type: 'AI_AGENT', oidcOptions: {} },
      ];
      managementService.getApplications.mockResolvedValue({ success: true, applications: appsWithExtra });

      const res = await request(app).get('/api/pingone-test/ai-agent-apps');
      const thirdParty = res.body.apps.find(a => a.name === 'Third-Party AI App');
      expect(thirdParty).toBeDefined();
      expect(thirdParty.isSuperBanking).toBe(false);

      const sbMcp = res.body.apps.find(a => a.name === 'Super Banking MCP Token Exchanger');
      expect(sbMcp.isSuperBanking).toBe(true);
    });

    it('populates missingExpected when a known AI app is absent from PingOne', async () => {
      const appsWithoutMcp = MOCK_APPS.filter(a => a.name !== 'Super Banking MCP Token Exchanger');
      managementService.getApplications.mockResolvedValue({ success: true, applications: appsWithoutMcp });

      const res = await request(app).get('/api/pingone-test/ai-agent-apps');
      expect(res.body.missingExpected).toContain('Super Banking MCP Token Exchanger');
    });

    it('also recognises AI_AGENT apps by applicationType field', async () => {
      const appsAlt = [
        { id: 'app-a', name: 'Super Banking AI Agent App', applicationType: 'AI_AGENT', oidcOptions: {} },
      ];
      managementService.getApplications.mockResolvedValue({ success: true, applications: appsAlt });

      const res = await request(app).get('/api/pingone-test/ai-agent-apps');
      expect(res.body.apps).toHaveLength(1);
      expect(res.body.apps[0].type).toBe('AI_AGENT');
    });

    it('returns success:false with empty apps when management service not configured', async () => {
      managementService.initialize.mockImplementation(() => { throw new Error('Not configured'); });

      const res = await request(app).get('/api/pingone-test/ai-agent-apps');
      expect(res.body.success).toBe(false);
      expect(res.body.apps).toEqual([]);
      expect(res.body.error).toMatch(/Management API not configured/);
    });

    it('returns success:false on unexpected error', async () => {
      managementService.getApplications.mockRejectedValue(new Error('Network error'));

      const res = await request(app).get('/api/pingone-test/ai-agent-apps');
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Network error');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/pingone-test/update-resources
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /api/pingone-test/update-resources', () => {

    it('returns 503 when worker token unavailable', async () => {
      oauthService.getAgentClientCredentialsToken.mockResolvedValue(null);

      const res = await request(app).post('/api/pingone-test/update-resources');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Worker token unavailable/);
    });

    it('returns success:true with steps when both RS already exist and all scopes present', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      managementService.getScopes
        .mockResolvedValueOnce({ scopes: BANKING_SCOPES }) // banking RS
        .mockResolvedValueOnce({ scopes: MCP_SCOPES });    // mcp RS

      const res = await request(app).post('/api/pingone-test/update-resources');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.steps).toBeDefined();
      // createResourceServer should NOT have been called
      expect(managementService.createResourceServer).not.toHaveBeenCalled();
    });

    it('creates missing resource server and adds missing scopes', async () => {
      // Neither RS exists
      managementService.getResourceServers.mockResolvedValue({ resourceServers: [] });
      managementService.createResourceServer
        .mockResolvedValueOnce({ success: true, resourceServer: { id: 'new-rs-1' } }) // banking
        .mockResolvedValueOnce({ success: true, resourceServer: { id: 'new-rs-2' } }); // mcp
      managementService.getScopes.mockResolvedValue({ scopes: [] });
      managementService.createScopes.mockResolvedValue([{ success: true }]);

      const res = await request(app).post('/api/pingone-test/update-resources');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(managementService.createResourceServer).toHaveBeenCalledTimes(2);
      expect(managementService.createScopes).toHaveBeenCalled();
    });

    it('adds only missing scopes when RS exists but some scopes absent', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      // banking RS missing banking:admin and banking:sensitive
      managementService.getScopes
        .mockResolvedValueOnce({ scopes: [{ name: 'banking:read' }, { name: 'banking:write' }, { name: 'banking:ai:agent' }] })
        .mockResolvedValueOnce({ scopes: MCP_SCOPES });
      managementService.createScopes.mockResolvedValue([{ success: true }]);

      const res = await request(app).post('/api/pingone-test/update-resources');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // createScopes called once for banking RS (2 missing: admin + sensitive)
      expect(managementService.createScopes).toHaveBeenCalledTimes(2);
    });

    it('returns error in steps when createResourceServer fails', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: [] });
      managementService.createResourceServer.mockResolvedValue({ success: false, error: 'PingOne API 403' });

      const res = await request(app).post('/api/pingone-test/update-resources');
      expect(res.status).toBe(200);
      // steps should mark failed but top-level success stays true (best-effort)
      const failedStep = res.body.steps.find(s => s.status === 'failed');
      expect(failedStep).toBeDefined();
    });

    it('returns 500 on unexpected error', async () => {
      managementService.getResourceServers.mockRejectedValue(new Error('Unexpected'));

      const res = await request(app).post('/api/pingone-test/update-resources');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/pingone-test/update-scopes
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /api/pingone-test/update-scopes', () => {

    it('returns 503 when worker token unavailable', async () => {
      oauthService.getAgentClientCredentialsToken.mockResolvedValue(null);

      const res = await request(app).post('/api/pingone-test/update-scopes');
      expect(res.status).toBe(503);
    });

    it('reports not_found when RS does not exist in PingOne', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: [] });

      const res = await request(app).post('/api/pingone-test/update-scopes');
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2); // banking + mcp both not found
      res.body.results.forEach(r => expect(r.status).toBe('not_found'));
    });

    it('reports all scopes already present when no additions needed', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      managementService.getScopes
        .mockResolvedValueOnce({ scopes: BANKING_SCOPES })
        .mockResolvedValueOnce({ scopes: MCP_SCOPES });

      const res = await request(app).post('/api/pingone-test/update-scopes');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      res.body.results.forEach(r => expect(r.added).toHaveLength(0));
      expect(managementService.createScopes).not.toHaveBeenCalled();
    });

    it('adds only missing canonical scopes (non-destructive)', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      // banking RS has only banking:read
      managementService.getScopes
        .mockResolvedValueOnce({ scopes: [{ name: 'banking:read' }] })
        .mockResolvedValueOnce({ scopes: MCP_SCOPES });
      managementService.createScopes.mockResolvedValue([{ success: true }]);

      const res = await request(app).post('/api/pingone-test/update-scopes');
      expect(res.status).toBe(200);

      const bankingResult = res.body.results.find(r => r.rs && r.rs.toLowerCase().includes('banking'));
      expect(bankingResult.added).toContain('banking:write');
      expect(bankingResult.added).toContain('banking:admin');
      expect(bankingResult.added).toContain('banking:sensitive');
      expect(bankingResult.added).toContain('banking:ai:agent');
      expect(bankingResult.added).not.toContain('banking:read'); // already present

      // createScopes called 4 times for the 4 missing banking scopes
      expect(managementService.createScopes).toHaveBeenCalledTimes(4);
    });

    it('returns 500 on unexpected error', async () => {
      managementService.getResourceServers.mockRejectedValue(new Error('Boom'));

      const res = await request(app).post('/api/pingone-test/update-scopes');
      expect(res.status).toBe(500);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/pingone-test/update-apps
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /api/pingone-test/update-apps', () => {

    it('returns 503 when worker token unavailable', async () => {
      oauthService.getAgentClientCredentialsToken.mockResolvedValue(null);

      const res = await request(app).post('/api/pingone-test/update-apps');
      expect(res.status).toBe(503);
    });

    it('returns error when banking RS not found', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: [] });
      managementService.getApplications.mockResolvedValue({ success: true, applications: MOCK_APPS });

      const res = await request(app).post('/api/pingone-test/update-apps');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Banking resource server not found/);
    });

    it('grants correct scopes and returns steps + aiAgentApps', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      managementService.getScopes.mockResolvedValue({ scopes: BANKING_SCOPES });
      managementService.getApplications.mockResolvedValue({ success: true, applications: MOCK_APPS });
      managementService.enableResourceServer.mockResolvedValue({ success: true, patched: false });

      const res = await request(app).post('/api/pingone-test/update-apps');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // 4 Super Banking apps should be in steps
      expect(res.body.steps).toHaveLength(4);
      res.body.steps.forEach(s => expect(s.status).toBe('ok'));

      // AI_AGENT apps returned for discovery
      expect(res.body.aiAgentApps).toHaveLength(2); // MCP Exchanger + AI Agent App
      expect(res.body.aiAgentApps.map(a => a.name)).toEqual(
        expect.arrayContaining(['Super Banking MCP Token Exchanger', 'Super Banking AI Agent App'])
      );
    });

    it('marks step as not_found when Super Banking app is absent in PingOne', async () => {
      const appsWithoutUser = MOCK_APPS.filter(a => a.name !== 'Super Banking User App');
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      managementService.getScopes.mockResolvedValue({ scopes: BANKING_SCOPES });
      managementService.getApplications.mockResolvedValue({ success: true, applications: appsWithoutUser });
      managementService.enableResourceServer.mockResolvedValue({ success: true });

      const res = await request(app).post('/api/pingone-test/update-apps');
      const missing = res.body.steps.find(s => s.app === 'Super Banking User App');
      expect(missing).toBeDefined();
      expect(missing.status).toBe('not_found');
    });

    it('marks step as failed when enableResourceServer fails', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      managementService.getScopes.mockResolvedValue({ scopes: BANKING_SCOPES });
      managementService.getApplications.mockResolvedValue({ success: true, applications: MOCK_APPS });
      managementService.enableResourceServer.mockResolvedValue({ success: false, error: 'Grant failed' });

      const res = await request(app).post('/api/pingone-test/update-apps');
      res.body.steps.forEach(s => expect(s.status).toBe('failed'));
    });

    it('returns 500 on unexpected error', async () => {
      managementService.getApplications.mockRejectedValue(new Error('Fatal'));

      const res = await request(app).post('/api/pingone-test/update-apps');
      expect(res.status).toBe(500);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/pingone-test/update-user-spel
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /api/pingone-test/update-user-spel', () => {

    // Helper: mock the PingOne apps + RS attributes GETs for the mapping steps
    function mockAppMappingFlow({ existingMapping = false, brokenMapping = false } = {}) {
      // Mock managementService.getResourceServers for RS attribute mapping (Step 2)
      managementService.getResourceServers.mockResolvedValue({
        success: true,
        resourceServers: [
          { id: 'rs-banking-1', name: 'Super Banking Banking API', audience: 'https://ai-agent.pingdemo.com' },
        ],
      });

      // GET /applications → return a User App and Admin App
      // GET /resources/{id}/attributes → return RS attributes
      // GET /applications/{id}/attributes → return app attributes
      mockAxios.get.mockImplementation((url) => {
        if (url.includes('/resources/') && url.includes('/attributes')) {
          // RS attribute mapping check — mirror existingMapping flag
          const rsAttrs = existingMapping
            ? [{ id: 'rs-attr-1', name: 'may_act', value: '${user.mayAct}' }]
            : [];
          return Promise.resolve({ data: { _embedded: { attributes: rsAttrs } } });
        }
        if (url.includes('/applications') && !url.includes('/attributes')) {
          return Promise.resolve({
            data: {
              _embedded: {
                applications: [
                  { id: 'app-user-1', name: 'Super Banking User App', protocol: 'OPENID_CONNECT', oidcOptions: { clientId: 'user-client-id-test' } },
                  { id: 'app-admin-1', name: 'Super Banking Admin App', protocol: 'OPENID_CONNECT', oidcOptions: { clientId: 'admin-client-id-test' } },
                ],
              },
            },
          });
        }
        if (url.includes('/attributes')) {
          const attrs = existingMapping
            ? [{ id: 'attr-1', name: 'may_act', value: brokenMapping ? '${user.mayAct}' : '(#root.user.mayAct != null ? #root.user.mayAct : null)' }]
            : [];
          return Promise.resolve({ data: { _embedded: { attributes: attrs } } });
        }
        return Promise.resolve({ data: {} });
      });
      // POST /resources/{id}/attributes or /applications/{id}/attributes → create mapping
      mockAxios.post.mockResolvedValue({ data: {} });
      // DELETE /applications/{id}/attributes/{attrId} → delete broken mapping
      mockAxios.delete = jest.fn().mockResolvedValue({ data: {} });
    }

    it('returns error when no user ID is available (no session, no body)', async () => {
      // Override auth to provide user with no ID
      _authOverride.user = { username: 'noid', role: 'admin', scopes: ['banking:admin'] };

      const res = await request(app)
        .post('/api/pingone-test/update-user-spel')
        .send({});

      // Restore default
      _authOverride.user = null;

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/No user ID available/);
    });

    it('returns error when admin_client_id is not configured', async () => {
      // Override top-level configStore (same instance as route) to omit all client IDs
      configStore.getEffective.mockImplementation((key) => {
        if (key === 'admin_client_id') return null;
        if (key === 'pingone_ai_agent_client_id') return null;
        if (key === 'pingone_mcp_token_exchanger_client_id') return null;
        return DEFAULT_CONFIG[key] || null;
      });
      // Also clear env vars that serve as fallbacks
      const savedEnv = process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID;
      delete process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID;

      const res = await request(app)
        .post('/api/pingone-test/update-user-spel')
        .send({ userId: 'user-abc-123' });

      // Restore
      if (savedEnv !== undefined) process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID = savedEnv;

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/client ID not set/i);
    });

    it('returns 503 when worker token unavailable', async () => {
      oauthService.getAgentClientCredentialsToken.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/pingone-test/update-user-spel')
        .send({ userId: 'user-abc-123' });

      expect(res.status).toBe(503);
    });

    it('PATCHes user, creates may_act mapping on OIDC apps, returns steps', async () => {
      mockAxios.patch.mockResolvedValue({ data: {} });
      mockAppMappingFlow({ existingMapping: false });

      const res = await request(app)
        .post('/api/pingone-test/update-user-spel')
        .send({ userId: 'user-abc-123', enabled: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBe('test-admin-id');
      expect(res.body.mayAct).toEqual({ sub: 'mcp-cid' });
      expect(res.body.message).toMatch(/re-login/);
      expect(res.body.message).toMatch(/Attribute mapping ensured/);

      // Step 1: user attribute PATCH
      expect(mockAxios.patch).toHaveBeenCalledWith(
        expect.stringMatching(/users\/test-admin-id/),
        { mayAct: { sub: 'mcp-cid' } },
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer mock-worker-token' }) })
      );

      // Steps include user-attribute + rs-mapping + app-mapping
      expect(res.body.steps).toBeDefined();
      const userStep = res.body.steps.find(s => s.step === 'user-attribute');
      expect(userStep.status).toBe('ok');
      // RS mapping step should be present
      const rsStep = res.body.steps.find(s => s.step === 'rs-mapping');
      expect(rsStep).toBeDefined();
      const mapStep = res.body.steps.find(s => s.step === 'app-mapping');
      expect(mapStep).toBeDefined();
    });

    it('skips mapping creation when correct may_act mapping already exists', async () => {
      mockAxios.patch.mockResolvedValue({ data: {} });
      mockAppMappingFlow({ existingMapping: true, brokenMapping: false });

      const res = await request(app)
        .post('/api/pingone-test/update-user-spel')
        .send({ userId: 'user-abc-123', enabled: true });

      expect(res.body.success).toBe(true);
      const mapStep = res.body.steps.find(s => s.step === 'app-mapping');
      expect(mapStep.status).toBe('already_exists');
      // POST should NOT have been called for mapping creation
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('detects existing may_act mapping and reports already_exists even with simple SpEL', async () => {
      mockAxios.patch.mockResolvedValue({ data: {} });
      mockAppMappingFlow({ existingMapping: true, brokenMapping: true });

      const res = await request(app)
        .post('/api/pingone-test/update-user-spel')
        .send({ userId: 'user-abc-123', enabled: true });

      expect(res.body.success).toBe(true);
      const mapStep = res.body.steps.find(s => s.step === 'app-mapping');
      // App-level mappings no longer "fix" ${user.mayAct} — that's valid for apps.
      // The critical fix is on the RS level (rs-mapping step).
      expect(mapStep.status).toBe('already_exists');
    });

    it('clears mayAct when enabled=false (no mapping step)', async () => {
      mockAxios.patch.mockResolvedValue({ data: {} });

      const res = await request(app)
        .post('/api/pingone-test/update-user-spel')
        .send({ userId: 'user-abc-123', enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.mayAct).toBeNull();
      // Should NOT fetch apps or create mappings when disabling
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it('returns 500 with PingOne error message on PATCH failure', async () => {
      mockAxios.patch.mockRejectedValue({
        message: 'Request failed',
        response: { data: { message: 'User not found in PingOne' } },
      });

      const res = await request(app)
        .post('/api/pingone-test/update-user-spel')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Operation failed. Check server logs.');
    });

    it('uses session user ID (ignores userId from body for BOLA prevention)', async () => {
      mockAxios.patch.mockResolvedValue({ data: {} });
      mockAppMappingFlow({ existingMapping: true });

      const res = await request(app)
        .post('/api/pingone-test/update-user-spel')
        .send({ userId: 'explicit-user-id' });

      // Route uses session user, not body userId
      expect(res.body.userId).toBe('test-admin-id');
      expect(res.body.success).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/pingone-test/diagnose-mcp-exchange
  // ─────────────────────────────────────────────────────────────────────────
  describe('GET /api/pingone-test/diagnose-mcp-exchange', () => {

    it('returns 503 when worker token unavailable', async () => {
      oauthService.getAgentClientCredentialsToken.mockResolvedValue(null);

      const res = await request(app).get('/api/pingone-test/diagnose-mcp-exchange');
      expect(res.status).toBe(503);
    });

    it('finds exchanger app by oidcOptions.clientId (not just PingOne id)', async () => {
      // This is the critical test — configStore returns an OIDC clientId ('mcp-cid'),
      // not a PingOne application UUID. The lookup must match oidcOptions.clientId.
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      managementService.getScopes.mockResolvedValue({ scopes: MCP_SCOPES });
      managementService.getApplications.mockResolvedValue({ success: true, applications: MOCK_APPS });
      managementService.getApplicationGrants.mockResolvedValue({
        grants: [{ resourceId: 'rs-2', scopes: ['banking:read', 'banking:write', 'banking:mcp:invoke'] }],
      });

      const res = await request(app).get('/api/pingone-test/diagnose-mcp-exchange');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Should have found the app (not null)
      expect(res.body.exchangerApp).not.toBeNull();
      expect(res.body.exchangerApp.name).toBe('Super Banking MCP Token Exchanger');
    });

    it('returns exchangerApp null when clientId not found in any app', async () => {
      configStore.getEffective.mockImplementation((key) => {
        if (key === 'pingone_mcp_token_exchanger_client_id') return 'nonexistent-cid';
        return DEFAULT_CONFIG[key] || null;
      });
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      managementService.getScopes.mockResolvedValue({ scopes: MCP_SCOPES });
      managementService.getApplications.mockResolvedValue({ success: true, applications: MOCK_APPS });

      const res = await request(app).get('/api/pingone-test/diagnose-mcp-exchange');
      expect(res.body.exchangerApp).toBeNull();
      expect(res.body.canExchange).toBe(false);
    });

    it('reports canExchange=true when RS, scopes, and app grant align', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      managementService.getScopes.mockResolvedValue({ scopes: MCP_SCOPES });
      managementService.getApplications.mockResolvedValue({ success: true, applications: MOCK_APPS });
      managementService.getApplicationGrants.mockResolvedValue({
        grants: [{ resourceId: 'rs-2', scopes: ['banking:read', 'banking:write', 'banking:mcp:invoke'] }],
      });

      const res = await request(app).get('/api/pingone-test/diagnose-mcp-exchange');
      expect(res.body.canExchange).toBe(true);
      expect(res.body.missingFromRS).toHaveLength(0);
      expect(res.body.missingFromApp).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/pingone-test/fix-mcp-exchange
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /api/pingone-test/fix-mcp-exchange', () => {

    it('returns 503 when worker token unavailable', async () => {
      oauthService.getAgentClientCredentialsToken.mockResolvedValue(null);

      const res = await request(app).post('/api/pingone-test/fix-mcp-exchange');
      expect(res.status).toBe(503);
    });

    it('finds exchanger app by oidcOptions.clientId and assigns MCP RS', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      managementService.getScopes.mockResolvedValue({ scopes: MCP_SCOPES });
      managementService.getApplications.mockResolvedValue({ success: true, applications: MOCK_APPS });
      managementService.enableResourceServer.mockResolvedValue({ success: true });

      const res = await request(app).post('/api/pingone-test/fix-mcp-exchange');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Should have found exchanger app and called enableResourceServer with its PingOne id
      expect(managementService.enableResourceServer).toHaveBeenCalledWith(
        'app-3', // PingOne application id (not the oidcOptions.clientId 'mcp-cid')
        'rs-2',  // MCP RS id
        expect.arrayContaining(['banking:read', 'banking:write', 'banking:mcp:invoke'])
      );

      const assignStep = res.body.steps.find(s => s.step === 'assign-to-exchanger-app');
      expect(assignStep).toBeDefined();
      expect(assignStep.status).toBe('ok');
    });

    it('reports skipped when exchanger app clientId not found', async () => {
      configStore.getEffective.mockImplementation((key) => {
        if (key === 'pingone_mcp_token_exchanger_client_id') return 'nonexistent-cid';
        return DEFAULT_CONFIG[key] || null;
      });
      managementService.getResourceServers.mockResolvedValue({ resourceServers: MOCK_RS });
      managementService.getScopes.mockResolvedValue({ scopes: MCP_SCOPES });
      managementService.getApplications.mockResolvedValue({ success: true, applications: MOCK_APPS });

      const res = await request(app).post('/api/pingone-test/fix-mcp-exchange');
      const assignStep = res.body.steps.find(s => s.step === 'assign-to-exchanger-app');
      expect(assignStep).toBeDefined();
      expect(assignStep.status).toBe('skipped');
      // enableResourceServer should NOT have been called
      expect(managementService.enableResourceServer).not.toHaveBeenCalled();
    });

    it('creates MCP RS when not found and adds scopes', async () => {
      managementService.getResourceServers.mockResolvedValue({ resourceServers: [] });
      managementService.createResourceServer.mockResolvedValue({ success: true, resourceServer: { id: 'new-rs' } });
      managementService.getScopes.mockResolvedValue({ scopes: [] });
      managementService.createScopes.mockResolvedValue([{ success: true }]);
      managementService.getApplications.mockResolvedValue({ success: true, applications: MOCK_APPS });
      managementService.enableResourceServer.mockResolvedValue({ success: true });

      const res = await request(app).post('/api/pingone-test/fix-mcp-exchange');
      expect(res.body.success).toBe(true);
      expect(res.body.mcpRSCreated).toBe(true);
      expect(managementService.createResourceServer).toHaveBeenCalled();
    });
  });

});
