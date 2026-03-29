/**
 * @file agentMcpTokenService.test.js
 *
 * Tests for resolveMcpAccessTokenWithEvents — verifying that:
 * 1. Agent client_credentials (actor token) are always used when AGENT_OAUTH_CLIENT_ID is set.
 * 2. Without MCP_RESOURCE_URI, resolution returns null token (user access token not forwarded to MCP).
 * 3. User token must have ≥ MIN_USER_SCOPES_FOR_MCP distinct scopes before exchange.
 * 4. RFC 8693 exchange path works when MCP_RESOURCE_URI is set and scopes are sufficient.
 * 5. Subject-only fallback emits an on-behalf-of-warning event when no agent client is configured.
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
const mockUserAccessToken = makeJwt({
  sub: USER_SUB,
  aud: 'banking_enduser',
  scope: 'openid profile email offline_access banking:accounts:read banking:transactions:read',
  iss: 'https://auth.pingone.com/test-env/as',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
});

const mockUserAccessTokenNarrowScopes = makeJwt({
  sub: USER_SUB,
  aud: 'banking_enduser',
  scope: 'openid profile banking:accounts:read',
  iss: 'https://auth.pingone.com/test-env/as',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
});

const mockAgentAccessToken = makeJwt({
  sub: 'agent-client-id',
  aud: 'banking_mcp_server',
  scope: 'openid',
  iss: 'https://auth.pingone.com/test-env/as',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  client_id: 'agent-client-id',
});

const mockMcpAccessToken = makeJwt({
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
    // Reflect the new dual-scope structure (specific + broad)
    get_my_accounts:  ['banking:accounts:read', 'banking:read'],
    create_transfer:  ['banking:transactions:write', 'banking:write'],
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
  return { _mockToken: token, session: { agentConsentGiven: true } };
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

  beforeEach(() => {
    process.env.AGENT_OAUTH_CLIENT_ID = 'agent-client-id';
    process.env.AGENT_OAUTH_CLIENT_SECRET = 'agent-secret';
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return '';
      return null;
    });
    mockGetAgentClientCredentialsToken.mockResolvedValue(mockAgentAccessToken);
  });

  afterEach(() => {
    if (origClientId !== undefined) process.env.AGENT_OAUTH_CLIENT_ID = origClientId;
    else delete process.env.AGENT_OAUTH_CLIENT_ID;
    if (origSecret !== undefined) process.env.AGENT_OAUTH_CLIENT_SECRET = origSecret;
    else delete process.env.AGENT_OAUTH_CLIENT_SECRET;
  });

  it('returns null token (not throw) when MCP_RESOURCE_URI is unset — local fallback path', async () => {
    const { token } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    expect(token).toBeNull();
  });

  it('includes exchange-required token event when URI is unset (status skipped — not a failure)', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    const ev = tokenEvents.find((x) => x.id === 'exchange-required');
    expect(ev).toBeDefined();
    // 'skipped' — token exchange is not configured, not an error; local fallback is used instead
    expect(ev.status).toBe('skipped');
  });

  it('does not call performTokenExchange when MCP_RESOURCE_URI is unset', async () => {
    await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
  });

  it('does not call getAgentClientCredentialsToken when MCP_RESOURCE_URI is unset (returns before actor step)', async () => {
    await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    // mcp_resource_uri check returns early before the actor token step
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
      resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'create_transfer')
    ).rejects.toMatchObject({
      code: 'agent_mcp_scope_denied',
      httpStatus: 403,
    });
  });

  it('does not call performTokenExchange when policy blocks the tool', async () => {
    try {
      await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'create_transfer');
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
      resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessTokenNarrowScopes), 'get_my_accounts')
    ).rejects.toMatchObject({
      code: 'user_token_insufficient_scopes',
      httpStatus: 403,
    });
  });

  it('does not call performTokenExchange when scopes insufficient', async () => {
    try {
      await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessTokenNarrowScopes), 'get_my_accounts');
    } catch {
      /* expected */
    }
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
  });
});

describe('resolveMcpAccessTokenWithEvents — RFC 8693 exchange, subject-only (AGENT_OAUTH_CLIENT_ID unset)', () => {
  const origClientId = process.env.AGENT_OAUTH_CLIENT_ID;
  const origUri = process.env.MCP_RESOURCE_URI;

  beforeEach(() => {
    delete process.env.AGENT_OAUTH_CLIENT_ID;
    process.env.MCP_RESOURCE_URI = 'https://mcp.example.com/api';
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      return null;
    });
    mockPerformTokenExchange.mockResolvedValue(mockMcpAccessToken);
  });

  afterEach(() => {
    if (origClientId !== undefined) process.env.AGENT_OAUTH_CLIENT_ID = origClientId;
    else delete process.env.AGENT_OAUTH_CLIENT_ID;
    if (origUri !== undefined) process.env.MCP_RESOURCE_URI = origUri;
    else delete process.env.MCP_RESOURCE_URI;
  });

  it('returns the exchanged MCP token, not the User token', async () => {
    const { token } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    expect(token).toBe(mockMcpAccessToken);
    expect(token).not.toBe(mockUserAccessToken);
  });

  it('calls performTokenExchange with User token and the resource URI', async () => {
    await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    expect(mockPerformTokenExchange).toHaveBeenCalledWith(
      mockUserAccessToken,
      'https://mcp.example.com/api',
      expect.arrayContaining(['banking:accounts:read'])
    );
  });

  it('returns userSub from user access token', async () => {
    const { userSub } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    expect(userSub).toBe(USER_SUB);
  });

  it('emits a user-token event and an exchanged-token event', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    expect(tokenEvents.find(e => e.id === 'user-token')).toBeDefined();
    expect(tokenEvents.find(e => e.id === 'exchanged-token')).toBeDefined();
  });

  it('includes jwtFullDecode (header + full claims) on user-token and exchanged-token', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    const userEv = tokenEvents.find(e => e.id === 'user-token');
    const mcpTokEv = tokenEvents.find(e => e.id === 'exchanged-token');
    expect(userEv.jwtFullDecode.header.alg).toBe('RS256');
    expect(userEv.jwtFullDecode.claims.sub).toBe(USER_SUB);
    expect(mcpTokEv.jwtFullDecode.claims.sub).toBe(USER_SUB);
    expect(mcpTokEv.jwtFullDecode.claims.aud).toBe('mcp-resource-uri');
    expect(mcpTokEv.jwtFullDecode.claims.act).toEqual({ client_id: 'bff-client-id' });
  });
});

describe('resolveMcpAccessTokenWithEvents — on_behalf_of (AGENT_OAUTH_CLIENT_ID set)', () => {
  const origClientId = process.env.AGENT_OAUTH_CLIENT_ID;
  const origSecret   = process.env.AGENT_OAUTH_CLIENT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AGENT_OAUTH_CLIENT_ID = 'agent-client-id';
    process.env.AGENT_OAUTH_CLIENT_SECRET = 'agent-secret';
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      return null;
    });
    mockGetAgentClientCredentialsToken.mockResolvedValue(mockAgentAccessToken);
    mockPerformTokenExchangeWithActor.mockResolvedValue(mockMcpAccessToken);
  });

  afterEach(() => {
    if (origClientId !== undefined) process.env.AGENT_OAUTH_CLIENT_ID = origClientId;
    else delete process.env.AGENT_OAUTH_CLIENT_ID;
    if (origSecret !== undefined) process.env.AGENT_OAUTH_CLIENT_SECRET = origSecret;
    else delete process.env.AGENT_OAUTH_CLIENT_SECRET;
  });

  it('always calls getAgentClientCredentialsToken when AGENT_OAUTH_CLIENT_ID is set', async () => {
    await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    expect(mockGetAgentClientCredentialsToken).toHaveBeenCalledTimes(1);
  });

  it('calls performTokenExchangeWithActor (not subject-only) when agent client is configured', async () => {
    await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    expect(mockPerformTokenExchangeWithActor).toHaveBeenCalledWith(
      mockUserAccessToken,
      mockAgentAccessToken,
      'https://mcp.example.com/api',
      expect.arrayContaining(['banking:accounts:read'])
    );
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
  });

  it('returns exchanged token, not user token', async () => {
    const { token } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    expect(token).toBe(mockMcpAccessToken);
    expect(token).not.toBe(mockUserAccessToken);
    expect(token).not.toBe(mockAgentAccessToken);
  });

  it('emits agent-actor-token event in the token chain', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    const actorEv = tokenEvents.find(e => e.id === 'agent-actor-token');
    expect(actorEv).toBeDefined();
    expect(actorEv.status).toBe('active');
  });

  it('does not emit on-behalf-of-warning when agent client is configured', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    expect(tokenEvents.find(e => e.id === 'on-behalf-of-warning')).toBeUndefined();
  });
});

describe('resolveMcpAccessTokenWithEvents — subject-only warning when no agent client', () => {
  const origClientId = process.env.AGENT_OAUTH_CLIENT_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AGENT_OAUTH_CLIENT_ID;
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      return null;
    });
    mockPerformTokenExchange.mockResolvedValue(mockMcpAccessToken);
  });

  afterEach(() => {
    if (origClientId !== undefined) process.env.AGENT_OAUTH_CLIENT_ID = origClientId;
    else delete process.env.AGENT_OAUTH_CLIENT_ID;
  });

  it('emits on-behalf-of-warning event when AGENT_OAUTH_CLIENT_ID is not set', async () => {
    const { tokenEvents } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    const warn = tokenEvents.find(e => e.id === 'on-behalf-of-warning');
    expect(warn).toBeDefined();
    expect(warn.status).toBe('skipped');
  });

  it('still completes RFC 8693 subject-only exchange (user token never forwarded)', async () => {
    const { token } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessToken), 'get_my_accounts');
    expect(token).toBe(mockMcpAccessToken);
    expect(token).not.toBe(mockUserAccessToken);
    expect(mockGetAgentClientCredentialsToken).not.toHaveBeenCalled();
    expect(mockPerformTokenExchange).toHaveBeenCalledTimes(1);
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
    const { tokenEvents } = buildSessionPreviewTokenEvents(makeReq(mockUserAccessToken));
    expect(tokenEvents).toHaveLength(2);
    expect(tokenEvents[0].id).toBe('user-token');
    expect(tokenEvents[0].status).toBe('active');
    expect(tokenEvents[1].id).toBe('exchange-required');
    // 'skipped' — exchange not configured is not a failure, local fallback is used
    expect(tokenEvents[1].status).toBe('skipped');
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
  });

  it('returns user-scopes-insufficient when URI is set but JWT has too few scopes', () => {
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      return null;
    });
    const { tokenEvents } = buildSessionPreviewTokenEvents(makeReq(mockUserAccessTokenNarrowScopes));
    expect(tokenEvents.some(e => e.id === 'user-scopes-insufficient')).toBe(true);
  });

  it('returns waiting exchange rows when MCP_RESOURCE_URI is set and scopes sufficient — does not call PingOne exchange', () => {
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      return null;
    });
    const { tokenEvents } = buildSessionPreviewTokenEvents(makeReq(mockUserAccessToken));
    expect(tokenEvents).toHaveLength(3);
    expect(tokenEvents[0].id).toBe('user-token');
    expect(tokenEvents[1].id).toBe('exchange');
    expect(tokenEvents[1].status).toBe('waiting');
    expect(tokenEvents[2].id).toBe('exchanged-token');
    expect(tokenEvents[2].status).toBe('waiting');
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
  });
});

// ── Broad scope (banking:read / banking:write) support ───────────────────────

/** User token that has banking:read but NOT banking:accounts:read */
const mockUserAccessTokenBroadRead = makeJwt({
  sub: USER_SUB,
  aud: 'banking_enduser',
  scope: 'openid profile email offline_access banking:read banking:write',
  iss: 'https://auth.pingone.com/test-env/as',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
});

describe('resolveMcpAccessTokenWithEvents — banking:read broad scope in token', () => {
  const origClientId = process.env.AGENT_OAUTH_CLIENT_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AGENT_OAUTH_CLIENT_ID;
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      // Allow all scopes including broad ones
      if (key === 'agent_mcp_allowed_scopes')
        return 'banking:read banking:write banking:accounts:read banking:transactions:read banking:transactions:write ai_agent';
      return null;
    });
    mockPerformTokenExchange.mockResolvedValue(mockMcpAccessToken);
  });

  afterEach(() => {
    if (origClientId !== undefined) process.env.AGENT_OAUTH_CLIENT_ID = origClientId;
    else delete process.env.AGENT_OAUTH_CLIENT_ID;
  });

  it('calls performTokenExchange with banking:read when user token has broad scope', async () => {
    await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessTokenBroadRead), 'get_my_accounts');
    expect(mockPerformTokenExchange).toHaveBeenCalledWith(
      mockUserAccessTokenBroadRead,
      'https://mcp.example.com/api',
      expect.arrayContaining(['banking:read'])
    );
    // Specific scope not in user token — must NOT be requested
    const callArgs = mockPerformTokenExchange.mock.calls[0][2];
    expect(callArgs).not.toContain('banking:accounts:read');
  });

  it('calls performTokenExchange with banking:write for write tool when user has broad scope', async () => {
    await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessTokenBroadRead), 'create_transfer');
    expect(mockPerformTokenExchange).toHaveBeenCalledWith(
      mockUserAccessTokenBroadRead,
      'https://mcp.example.com/api',
      expect.arrayContaining(['banking:write'])
    );
    const callArgs = mockPerformTokenExchange.mock.calls[0][2];
    expect(callArgs).not.toContain('banking:transactions:write');
  });

  it('returns the exchanged token (not user token) for broad-scope token', async () => {
    const { token } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessTokenBroadRead), 'get_my_accounts');
    expect(token).toBe(mockMcpAccessToken);
    expect(token).not.toBe(mockUserAccessTokenBroadRead);
  });
});

describe('resolveMcpAccessTokenWithEvents — OR policy: broad scope enables tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AGENT_OAUTH_CLIENT_ID;
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      // Admin allows broad scope but NOT the specific scope
      if (key === 'agent_mcp_allowed_scopes') return 'banking:read banking:write ai_agent';
      return null;
    });
    mockPerformTokenExchange.mockResolvedValue(mockMcpAccessToken);
  });

  it('does NOT deny get_my_accounts when banking:read is in allowed set (OR policy)', async () => {
    const { token } = await resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessTokenBroadRead), 'get_my_accounts');
    expect(token).toBe(mockMcpAccessToken);
    expect(mockPerformTokenExchange).toHaveBeenCalledTimes(1);
  });

  it('denies create_transfer when neither banking:write nor banking:transactions:write is allowed', async () => {
    configStore.getEffective.mockImplementation((key) => {
      if (key === 'mcp_resource_uri') return 'https://mcp.example.com/api';
      if (key === 'agent_mcp_allowed_scopes') return 'banking:read ai_agent'; // write intentionally excluded
      return null;
    });
    await expect(
      resolveMcpAccessTokenWithEvents(makeReq(mockUserAccessTokenBroadRead), 'create_transfer')
    ).rejects.toMatchObject({ code: 'agent_mcp_scope_denied' });
    expect(mockPerformTokenExchange).not.toHaveBeenCalled();
  });
});
