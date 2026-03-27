/**
 * @file agentMcpTokenService.test.js
 *
 * Tests for resolveMcpAccessTokenWithEvents — verifying that:
 * 1. Agent client_credentials are used only when USE_AGENT_ACTOR_FOR_MCP and MCP_RESOURCE_URI are set.
 * 2. Without MCP_RESOURCE_URI, resolution throws (no User token passthrough to MCP).
 * 3. User token must have ≥ MIN_USER_SCOPES_FOR_MCP distinct scopes before exchange.
 * 4. RFC 8693 exchange path works when MCP_RESOURCE_URI is set and scopes are sufficient.
 */

'use strict';

// ── JWT helpers ───────────────────────────────────────────────────────────────

function makeJwt(claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.sig`;
}

const USER_SUB = 'user-sub-abc123';
/** ≥5 distinct scopes — required before RFC 8693 to MCP */
const MOCK_USER_TOKEN = makeJwt({
  sub: USER_SUB,
  aud: 'banking_enduser',
  scope: 'openid profile email offline_access banking:accounts:read banking:transactions:read',
  iss: 'https://auth.pingone.com/test-env/as',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
});

const MOCK_USER_TOKEN_NARROW = makeJwt({
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
const { resolveMcpAccessTokenWithEvents, buildSessionPreviewTokenEvents } = require('../../services/agentMcpTokenService');

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

describe('resolveMcpAccessTokenWithEvents — MCP_RESOURCE_URI unset', () => {
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

  it('throws mcp_resource_uri_required — never forwards User token without RFC 8693', async () => {
    await expect(resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN), 'get_my_accounts')).rejects.toMatchObject({
      code: 'mcp_resource_uri_required',
      httpStatus: 503,
    });
  });

  it('includes exchange-required token event when URI is unset', async () => {
    try {
      await resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN), 'get_my_accounts');
    } catch (e) {
      const ev = e.tokenEvents.find((x) => x.id === 'exchange-required');
      expect(ev).toBeDefined();
      expect(ev.status).toBe('failed');
    }
  });

  it('does not call performTokenExchange', async () => {
    try {
      await resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN), 'get_my_accounts');
    } catch {
      /* expected */
    }
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
  });

  it('does not call getAgentClientCredentialsToken without USE_AGENT_ACTOR_FOR_MCP', async () => {
    try {
      await resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN), 'get_my_accounts');
    } catch {
      /* expected */
    }
    expect(mockGetAgentClientCredentialsToken).not.toHaveBeenCalled();
  });
});

describe('resolveMcpAccessTokenWithEvents — agent MCP scope policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      if (key === 'agent_mcp_allowed_scopes') {
        return 'banking:accounts:read banking:transactions:read';
      }
      return null;
    });
  });

  it('throws agent_mcp_scope_denied when transfer scope is disabled in config', async () => {
    await expect(
      resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN), 'create_transfer')
    ).rejects.toMatchObject({
      code: 'agent_mcp_scope_denied',
      httpStatus: 403,
    });
  });

  it('does not call performTokenExchange when policy blocks the tool', async () => {
    try {
      await resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN), 'create_transfer');
    } catch {
      /* expected */
    }
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
  });
});

describe('resolveMcpAccessTokenWithEvents — insufficient user scopes (MCP_RESOURCE_URI set)', () => {
  beforeEach(() => {
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      return null;
    });
  });

  it('throws user_token_insufficient_scopes when JWT has fewer than 5 scopes', async () => {
    await expect(
      resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN_NARROW), 'get_my_accounts')
    ).rejects.toMatchObject({
      code: 'user_token_insufficient_scopes',
      httpStatus: 403,
    });
  });

  it('does not call performTokenExchange when scopes insufficient', async () => {
    try {
      await resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN_NARROW), 'get_my_accounts');
    } catch {
      /* expected */
    }
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
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

  it('returns the exchanged MCP token, not the User token', async () => {
    const { token } = await resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN), 'get_my_accounts');
    expect(token).toBe(EXCHANGED_TOKEN);
    expect(token).not.toBe(MOCK_USER_TOKEN);
  });

  it('calls performTokenExchange with User token and the resource URI', async () => {
    await resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN), 'get_my_accounts');
    expect(mockPerformTokenExchange).toHaveBeenCalledWith(
      MOCK_USER_TOKEN,
      'https://mcp.example.com/api',
      expect.arrayContaining(['banking:accounts:read'])
    );
  });

  it('returns userSub from User token', async () => {
    const { userSub } = await resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN), 'get_my_accounts');
    expect(userSub).toBe(USER_SUB);
  });

  it('emits a user-token event and an exchanged-token event', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN), 'get_my_accounts');
    expect(tokenEvents.find(e => e.id === 'user-token')).toBeDefined();
    expect(tokenEvents.find(e => e.id === 'exchanged-token')).toBeDefined();
  });

  it('includes jwtFullDecode (header + full claims) on user-token and exchanged-token', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(MOCK_USER_TOKEN), 'get_my_accounts');
    const userEv = tokenEvents.find(e => e.id === 'user-token');
    const mcpTokEv = tokenEvents.find(e => e.id === 'exchanged-token');
    expect(userEv.jwtFullDecode.header.alg).toBe('RS256');
    expect(userEv.jwtFullDecode.claims.sub).toBe(USER_SUB);
    expect(mcpTokEv.jwtFullDecode.claims.sub).toBe(USER_SUB);
    expect(mcpTokEv.jwtFullDecode.claims.aud).toBe('mcp-resource-uri');
    expect(mcpTokEv.jwtFullDecode.claims.act).toEqual({ client_id: 'bff-client-id' });
  });
});

describe('buildSessionPreviewTokenEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty tokenEvents when no session token', () => {
    const { tokenEvents } = buildSessionPreviewTokenEvents(makeReq(null));
    expect(tokenEvents).toEqual([]);
  });

  it('returns user-token plus exchange-required failed when MCP_RESOURCE_URI is unset', () => {
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return '';
      return null;
    });
    const { tokenEvents } = buildSessionPreviewTokenEvents(makeReq(MOCK_USER_TOKEN));
    expect(tokenEvents).toHaveLength(2);
    expect(tokenEvents[0].id).toBe('user-token');
    expect(tokenEvents[0].status).toBe('active');
    expect(tokenEvents[1].id).toBe('exchange-required');
    expect(tokenEvents[1].status).toBe('failed');
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
  });

  it('returns user-scopes-insufficient when URI is set but JWT has too few scopes', () => {
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      return null;
    });
    const { tokenEvents } = buildSessionPreviewTokenEvents(makeReq(MOCK_USER_TOKEN_NARROW));
    expect(tokenEvents.some(e => e.id === 'user-scopes-insufficient')).toBe(true);
  });

  it('returns waiting exchange rows when MCP_RESOURCE_URI is set and scopes sufficient — does not call PingOne exchange', () => {
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      return null;
    });
    const { tokenEvents } = buildSessionPreviewTokenEvents(makeReq(MOCK_USER_TOKEN));
    expect(tokenEvents).toHaveLength(3);
    expect(tokenEvents[0].id).toBe('user-token');
    expect(tokenEvents[1].id).toBe('exchange');
    expect(tokenEvents[1].status).toBe('waiting');
    expect(tokenEvents[2].id).toBe('exchanged-token');
    expect(tokenEvents[2].status).toBe('waiting');
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
  });
});
