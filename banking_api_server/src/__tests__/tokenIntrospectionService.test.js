/**
 * Tests for tokenIntrospectionService — per-token-issuer credential selection.
 *
 * PingOne RFC 7662 enforces a same-client rule: introspection returns
 * active:false unless the introspecting client_id matches the token's
 * client_id. The service decodes the subject token and picks credentials
 * from a known matrix; these tests verify the matching logic.
 */

'use strict';

const axios = require('axios');

jest.mock('axios');

jest.mock('../../services/configStore', () => ({
  getEffective: jest.fn(() => null),
}));

jest.mock('../../services/oauthEndpointResolver', () => ({
  getTokenEndpoint: () => 'https://auth.pingone.com/v1/environments/test-env/oauth2/token',
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  LOG_LEVELS: {},
  LOG_CATEGORIES: { AUTH: 'AUTH' },
}));

jest.mock('../../services/appEventService', () => ({
  logEvent: jest.fn(),
  EVENT_CATEGORIES: { INTROSPECTION: 'INTROSPECTION' },
}));

const introspectionService = require('../../services/tokenIntrospectionService');

const buildJwt = (claims) => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64');
  return `${header}.${payload}.signature`;
};

const SAVED_ENV = { ...process.env };

describe('tokenIntrospectionService — per-issuer credential matching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    introspectionService.clearCache();

    // Reset and seed all known client_ids
    process.env = { ...SAVED_ENV };
    process.env.PINGONE_INTROSPECTION_ENDPOINT =
      'https://auth.pingone.com/v1/environments/test-env/oauth2/introspect';
    process.env.PINGONE_USER_CLIENT_ID = 'user-cid';
    process.env.PINGONE_USER_CLIENT_SECRET = 'user-secret';
    process.env.PINGONE_ADMIN_CLIENT_ID = 'admin-cid';
    process.env.PINGONE_ADMIN_CLIENT_SECRET = 'admin-secret';
    process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID = 'mcp-exchanger-cid';
    process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET = 'mcp-exchanger-secret';
    process.env.MCP_GW_CLIENT_ID = 'mcp-gw-cid';
    process.env.MCP_GW_CLIENT_SECRET = 'mcp-gw-secret';
    process.env.PINGONE_AGENT_CLIENT_ID = 'agent-cid';
    process.env.PINGONE_AGENT_CLIENT_SECRET = 'agent-secret';
    process.env.PINGONE_AI_AGENT_CLIENT_ID = 'ai-agent-cid';
    process.env.PINGONE_AI_AGENT_CLIENT_SECRET = 'ai-agent-secret';

    // Worker fallback (used when the token is from an unknown client)
    process.env.PINGONE_WORKER_CLIENT_ID = 'worker-cid';
    process.env.PINGONE_WORKER_CLIENT_SECRET = 'worker-secret';
  });

  afterAll(() => {
    process.env = SAVED_ENV;
  });

  const expectIntrospectionCall = (expectedClientId, expectedSecret) => {
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, body] = axios.post.mock.calls[0];
    expect(body.get('client_id')).toBe(expectedClientId);
    expect(body.get('client_secret')).toBe(expectedSecret);
  };

  test.each([
    ['user',          'user-cid',          'user-secret'],
    ['admin',         'admin-cid',         'admin-secret'],
    ['mcp exchanger', 'mcp-exchanger-cid', 'mcp-exchanger-secret'],
    ['mcp gateway',   'mcp-gw-cid',        'mcp-gw-secret'],
    ['agent',         'agent-cid',         'agent-secret'],
    ['ai agent',      'ai-agent-cid',      'ai-agent-secret'],
  ])('uses %s credentials when token client_id matches', async (_label, cid, secret) => {
    axios.post.mockResolvedValue({ data: { active: true, scope: 'read', client_id: cid } });

    const token = buildJwt({ client_id: cid, sub: 'subject-1' });
    const result = await introspectionService.validateToken(token);

    expect(result.valid).toBe(true);
    expectIntrospectionCall(cid, secret);
  });

  test('falls back to azp claim when client_id is missing', async () => {
    axios.post.mockResolvedValue({ data: { active: true, scope: 'read', client_id: 'user-cid' } });

    const token = buildJwt({ azp: 'user-cid', sub: 'subject-2' });
    await introspectionService.validateToken(token);

    expectIntrospectionCall('user-cid', 'user-secret');
  });

  test('falls back to worker credentials when token client_id is unknown', async () => {
    axios.post.mockResolvedValue({ data: { active: true, scope: 'read', client_id: 'external-cid' } });

    const token = buildJwt({ client_id: 'external-cid', sub: 'external-subject' });
    await introspectionService.validateToken(token);

    expectIntrospectionCall('worker-cid', 'worker-secret');
  });

  test('falls back to worker credentials when token is opaque (not a JWT)', async () => {
    axios.post.mockResolvedValue({ data: { active: true, scope: 'read', client_id: 'opaque' } });

    await introspectionService.validateToken('opaque-bearer-token');

    expectIntrospectionCall('worker-cid', 'worker-secret');
  });

  test('honours provision-script alias PINGONE_MCP_EXCHANGER_CLIENT_ID', async () => {
    delete process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID;
    delete process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET;
    process.env.PINGONE_MCP_EXCHANGER_CLIENT_ID = 'alias-mcp-cid';
    process.env.PINGONE_MCP_EXCHANGER_CLIENT_SECRET = 'alias-mcp-secret';

    axios.post.mockResolvedValue({ data: { active: true, scope: 'mcp:invoke', client_id: 'alias-mcp-cid' } });

    const token = buildJwt({ client_id: 'alias-mcp-cid' });
    await introspectionService.validateToken(token);

    expectIntrospectionCall('alias-mcp-cid', 'alias-mcp-secret');
  });

  test('honours provision-script alias AGENT_CLIENT_ID', async () => {
    delete process.env.PINGONE_AGENT_CLIENT_ID;
    delete process.env.PINGONE_AGENT_CLIENT_SECRET;
    process.env.AGENT_CLIENT_ID = 'alias-agent-cid';
    process.env.AGENT_CLIENT_SECRET = 'alias-agent-secret';

    axios.post.mockResolvedValue({ data: { active: true, scope: 'read', client_id: 'alias-agent-cid' } });

    const token = buildJwt({ client_id: 'alias-agent-cid' });
    await introspectionService.validateToken(token);

    expectIntrospectionCall('alias-agent-cid', 'alias-agent-secret');
  });

  test('uses post auth method (credentials in body, no Authorization header)', async () => {
    axios.post.mockResolvedValue({ data: { active: true, scope: 'read', client_id: 'user-cid' } });

    const token = buildJwt({ client_id: 'user-cid' });
    await introspectionService.validateToken(token);

    const [, , opts] = axios.post.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });
});
