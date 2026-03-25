/**
 * @file agentMcpTokenService.test.js
 *
 * Tests for resolveMcpAccessTokenWithEvents — verifying that:
 * 1. Agent client_credentials are used only when USE_AGENT_ACTOR_FOR_MCP and MCP_RESOURCE_URI are set.
 * 2. With no MCP_RESOURCE_URI, T1 passthrough is used and an exchange-skipped event is emitted.
 * 3. userSub is extracted from T1 for MCP metadata.
 * 4. RFC 8693 exchange path works when MCP_RESOURCE_URI is set.
 */

'use strict';

// ── JWT helpers ───────────────────────────────────────────────────────────────

function makeJwt(claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.sig`;
}

const USER_SUB = 'user-sub-abc123';
const T1 = makeJwt({
  sub: USER_SUB,
  aud: 'banking_enduser',
  scope: 'openid profile banking:accounts:read',
  iss: 'https://auth.pingone.com/test-env/as',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
});

const M2M_TOKEN = makeJwt({
  sub: 'agent-client-id',
  aud: 'banking_mcp_server',
  scope: 'openid',
  iss: 'https://auth.pingone.com/test-env/as',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  client_id: 'agent-client-id',
});

const EXCHANGED_TOKEN = makeJwt({
  sub: USER_SUB,
  aud: 'mcp-resource-uri',
  scope: 'banking:accounts:read',
  act: { client_id: 'bff-client-id' },
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetAgentClientCredentialsToken = jest.fn();
const mockPerformTokenExchange = jest.fn();
const mockPerformTokenExchangeWithActor = jest.fn();

jest.mock('../../services/oauthService', () => ({
  config: { clientId: 'bff-client-id' },
  getAgentClientCredentialsToken: (...args) => mockGetAgentClientCredentialsToken(...args),
  performTokenExchange: (...args) => mockPerformTokenExchange(...args),
  performTokenExchangeWithActor: (...args) => mockPerformTokenExchangeWithActor(...args),
}));

jest.mock('../../services/mcpWebSocketClient', () => ({
  MCP_TOOL_SCOPES: {
    get_my_accounts: ['banking:accounts:read'],
    create_transfer: ['banking:transactions:write'],
  },
  getSessionAccessToken: (req) => req._mockToken || null,
  getSessionBearerForMcp: (req) => {
    const t = req._mockToken || null;
    if (!t || t === '_cookie_session') return null;
    return t;
  },
}));

jest.mock('../../services/configStore', () => ({
  getEffective: jest.fn((key) => {
    if (key === 'mcp_resource_uri') return '';
    return null;
  }),
}));

const configStore = require('../../services/configStore');
const { resolveMcpAccessTokenWithEvents } = require('../../services/agentMcpTokenService');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeReq(token) {
  return { _mockToken: token, session: {} };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveMcpAccessTokenWithEvents — no session token', () => {
  it('returns null token and empty events when no session token', async () => {
    const { token, tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(null), 'get_my_accounts');
    expect(token).toBeNull();
    expect(tokenEvents).toHaveLength(0);
  });
});

describe('resolveMcpAccessTokenWithEvents — AGENT_OAUTH_CLIENT_ID alone (no MCP_RESOURCE_URI)', () => {
  const origClientId = process.env.AGENT_OAUTH_CLIENT_ID;
  const origSecret = process.env.AGENT_OAUTH_CLIENT_SECRET;
  const origUseActor = process.env.USE_AGENT_ACTOR_FOR_MCP;

  beforeEach(() => {
    delete process.env.USE_AGENT_ACTOR_FOR_MCP;
    process.env.AGENT_OAUTH_CLIENT_ID = 'agent-client-id';
    process.env.AGENT_OAUTH_CLIENT_SECRET = 'agent-secret';
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return '';
      return null;
    });
    mockGetAgentClientCredentialsToken.mockResolvedValue(M2M_TOKEN);
  });

  afterEach(() => {
    if (origClientId !== undefined) process.env.AGENT_OAUTH_CLIENT_ID = origClientId;
    else delete process.env.AGENT_OAUTH_CLIENT_ID;
    if (origSecret !== undefined) process.env.AGENT_OAUTH_CLIENT_SECRET = origSecret;
    else delete process.env.AGENT_OAUTH_CLIENT_SECRET;
    if (origUseActor !== undefined) process.env.USE_AGENT_ACTOR_FOR_MCP = origUseActor;
    else delete process.env.USE_AGENT_ACTOR_FOR_MCP;
  });

  it('forwards T1 — agent client_credentials run only with USE_AGENT_ACTOR_FOR_MCP and MCP_RESOURCE_URI', async () => {
    const { token } = await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    expect(token).toBe(T1);
  });

  it('returns userSub extracted from T1', async () => {
    const { userSub } = await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    expect(userSub).toBe(USER_SUB);
  });

  it('does not call getAgentClientCredentialsToken without USE_AGENT_ACTOR_FOR_MCP', async () => {
    await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    expect(mockGetAgentClientCredentialsToken).not.toHaveBeenCalled();
  });

  it('does NOT call performTokenExchange', async () => {
    await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
  });

  it('emits exchange-skipped when MCP resource URI is unset', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    const skipped = tokenEvents.find(e => e.id === 'exchange-skipped');
    expect(skipped).toBeDefined();
    expect(String(skipped.explanation)).toContain('MCP_RESOURCE_URI');
  });
});

describe('resolveMcpAccessTokenWithEvents — T1 passthrough (no AGENT_OAUTH_CLIENT_ID, no MCP_RESOURCE_URI)', () => {
  const origClientId = process.env.AGENT_OAUTH_CLIENT_ID;

  beforeEach(() => {
    delete process.env.AGENT_OAUTH_CLIENT_ID;
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return '';
      return null;
    });
  });

  afterEach(() => {
    if (origClientId !== undefined) process.env.AGENT_OAUTH_CLIENT_ID = origClientId;
  });

  it('returns T1 directly', async () => {
    const { token } = await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    expect(token).toBe(T1);
  });

  it('emits an exchange-skipped event documenting direct T1 passthrough', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    const skipped = tokenEvents.find(e => e.id === 'exchange-skipped');
    expect(skipped).toBeDefined();
    expect(JSON.stringify(skipped)).toContain('MCP_RESOURCE_URI');
  });

  it('still returns userSub from T1', async () => {
    const { userSub } = await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    expect(userSub).toBe(USER_SUB);
  });
});

describe('resolveMcpAccessTokenWithEvents — RFC 8693 exchange (MCP_RESOURCE_URI set)', () => {
  const origClientId = process.env.AGENT_OAUTH_CLIENT_ID;
  const origUri = process.env.MCP_RESOURCE_URI;

  beforeEach(() => {
    delete process.env.AGENT_OAUTH_CLIENT_ID;
    delete process.env.USE_AGENT_ACTOR_FOR_MCP;
    process.env.MCP_RESOURCE_URI = 'https://mcp.example.com/api';
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      return null;
    });
    mockPerformTokenExchange.mockResolvedValue(EXCHANGED_TOKEN);
  });

  afterEach(() => {
    if (origClientId !== undefined) process.env.AGENT_OAUTH_CLIENT_ID = origClientId;
    else delete process.env.AGENT_OAUTH_CLIENT_ID;
    if (origUri !== undefined) process.env.MCP_RESOURCE_URI = origUri;
    else delete process.env.MCP_RESOURCE_URI;
    delete process.env.USE_AGENT_ACTOR_FOR_MCP;
  });

  it('returns the exchanged token, not T1', async () => {
    const { token } = await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    expect(token).toBe(EXCHANGED_TOKEN);
    expect(token).not.toBe(T1);
  });

  it('calls performTokenExchange with T1 and the resource URI', async () => {
    await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    expect(mockPerformTokenExchange).toHaveBeenCalledWith(
      T1,
      'https://mcp.example.com/api',
      expect.arrayContaining(['banking:accounts:read'])
    );
  });

  it('returns userSub from T1', async () => {
    const { userSub } = await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    expect(userSub).toBe(USER_SUB);
  });

  it('emits a user-token event and an exchange event', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    expect(tokenEvents.find(e => e.id === 'user-token')).toBeDefined();
    expect(tokenEvents.find(e => e.id === 'exchanged-token')).toBeDefined();
  });

  it('includes jwtFullDecode (header + full claims) on user-token and exchanged-token', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(T1), 'get_my_accounts');
    const userEv = tokenEvents.find(e => e.id === 'user-token');
    const t2Ev = tokenEvents.find(e => e.id === 'exchanged-token');
    expect(userEv.jwtFullDecode.header.alg).toBe('RS256');
    expect(userEv.jwtFullDecode.claims.sub).toBe(USER_SUB);
    expect(t2Ev.jwtFullDecode.claims.sub).toBe(USER_SUB);
    expect(t2Ev.jwtFullDecode.claims.aud).toBe('mcp-resource-uri');
    expect(t2Ev.jwtFullDecode.claims.act).toEqual({ client_id: 'bff-client-id' });
  });
});
