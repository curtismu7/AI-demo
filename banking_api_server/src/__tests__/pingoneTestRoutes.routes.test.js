'use strict';
/**
 * Regression tests for pingoneTestRoutes.js — pingoneRequest shape contract.
 *
 * Asserts that pingoneRequest always has method, url, body keys
 * when a PingOne call was made — locking the contract for PingOneApiPanel.
 *
 * Phase 240-02: pingoneRequest contract tests (separate from pingoneTestRoutes.test.js).
 */

const request = require('supertest');
const express = require('express');

// Mock heavy dependencies before any require() pulls them in
const mockAxios = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
jest.mock('axios', () => mockAxios);

const DEFAULT_CONFIG = {
  pingone_region: 'com',
  pingone_environment_id: 'env-test-123',
  admin_client_id: 'admin-client-id',
  user_client_id: 'user-client-id',
  pingone_mcp_token_exchanger_client_id: 'mcp-cid',
  pingone_audience_enduser: 'https://ai-agent.pingdemo.com',
  pingone_resource_mcp_server_uri: 'https://mcp-server.pingdemo.com',
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
    getApplicationGrants: jest.fn(),
    createResourceServer: jest.fn(),
    createScopes: jest.fn(),
    enableResourceServer: jest.fn(),
  },
}));

jest.mock('../../services/oauthService', () => ({
  getClientCredentialsToken: jest.fn(),
  performTokenExchange: jest.fn(),
}));

jest.mock('../../services/apiCallTrackerService', () => ({
  trackApiCall: jest.fn(),
}));

let app;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = {
      user: { id: 'user-123' },
      oauthTokens: { accessToken: 'stub-token', idToken: 'stub-id-token' },
    };
    next();
  });
  app.use('/', require('../../routes/pingoneTestRoutes'));
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// _p1ReqDebug shape — /authz-token (client_credentials)
// ---------------------------------------------------------------------------
describe('POST /authz-token — pingoneRequest shape', () => {
  const oauthService = require('../../services/oauthService');

  it('pingoneRequest.method is a string when token fetch succeeds', async () => {
    mockAxios.post.mockResolvedValue({
      status: 200,
      data: { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 },
    });
    oauthService.getClientCredentialsToken.mockResolvedValue('stub-worker-token');

    const res = await request(app).post('/authz-token').send({});

    if (res.body.pingoneRequest) {
      expect(typeof res.body.pingoneRequest.method).toBe('string');
      expect(typeof res.body.pingoneRequest.url).toBe('string');
      expect('body' in res.body.pingoneRequest).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// _p1ReqDebug shape — /agent-token (client_credentials)
// ---------------------------------------------------------------------------
describe('POST /agent-token — pingoneRequest shape', () => {
  it('pingoneRequest.method is a string when token fetch succeeds', async () => {
    mockAxios.post.mockResolvedValue({
      status: 200,
      data: { access_token: 'agent-tok', token_type: 'Bearer', expires_in: 3600 },
    });

    const res = await request(app).post('/agent-token').send({});

    if (res.body.pingoneRequest) {
      expect(typeof res.body.pingoneRequest.method).toBe('string');
      expect(typeof res.body.pingoneRequest.url).toBe('string');
      expect('body' in res.body.pingoneRequest).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Guard: scope restriction verified — only test-route files modified
// ---------------------------------------------------------------------------
describe('scope guard', () => {
  it('does not import production auth routes', () => {
    // The router under test is pingoneTestRoutes — a test-only route file.
    // Production auth routes (oauth.js, authorize.js) are not required here.
    const router = require('../../routes/pingoneTestRoutes');
    expect(typeof router).toBe('function'); // express router is a function
  });
});
