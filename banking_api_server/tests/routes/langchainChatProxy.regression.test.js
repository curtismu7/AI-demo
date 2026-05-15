'use strict';

/**
 * Phase 3 — langchainChatProxy.regression.test.js
 *
 * Mocked-dependency suite for the Path A BFF ↔ langchain chat-WS proxy
 * (CR-02/CR-04 token-custody fix). Follows CLAUDE.md "Regression vs.
 * Integration" — configStore + oauthService mocked here; the proxy logic is
 * NOT mocked so we exercise the real token-resolution + audience policy.
 *
 * Covered:
 *   - no PingOne user token in session => resolveLangchainToken throws (the
 *     upgrade is rejected before any upstream connection)
 *   - authenticated session => token is exchanged to the dedicated langchain
 *     audience (T-5: aud is langchain's own resource, not a cascade)
 *   - dedicated-audience exchange failure WITHOUT the fallback flag => throws
 *     (no silent cascade to a different audience)
 *   - fallback flag ON => exchanges to the MCP-server audience instead
 */

jest.mock('../../services/configStore', () => {
  const store = {
    pingone_resource_langchain_agent_uri:
      'https://banking-langchain-agent.banking-demo.com',
    pingone_resource_mcp_server_uri: 'https://banking-mcp-server.banking-demo.com',
    mcp_token_exchange_scopes: 'banking:read banking:write',
    ff_langchain_audience_fallback: 'false',
  };
  return {
    getEffective: jest.fn((k) => store[k]),
    __store: store,
  };
});

jest.mock('../../services/oauthService', () => ({
  performTokenExchange: jest.fn(),
}));

const configStore = require('../../services/configStore');
const oauthService = require('../../services/oauthService');
const {
  resolveLangchainToken,
} = require('../../services/langchainChatProxy');

function reqWithToken(accessToken) {
  return {
    session: accessToken
      ? { oauthTokens: { accessToken } }
      : {},
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  configStore.__store.ff_langchain_audience_fallback = 'false';
});

describe('resolveLangchainToken — Path A token custody', () => {
  test('no user token in session => throws no_user_token (upgrade rejected)', async () => {
    await expect(resolveLangchainToken(reqWithToken(null))).rejects.toMatchObject(
      { code: 'no_user_token' }
    );
    expect(oauthService.performTokenExchange).not.toHaveBeenCalled();
  });

  test('authenticated => exchanges to the dedicated langchain audience (T-5)', async () => {
    oauthService.performTokenExchange.mockResolvedValue('langchain.aud.token');

    const token = await resolveLangchainToken(reqWithToken('user.session.token'));

    expect(token).toBe('langchain.aud.token');
    expect(oauthService.performTokenExchange).toHaveBeenCalledTimes(1);
    const [subject, audience, scopes] =
      oauthService.performTokenExchange.mock.calls[0];
    expect(subject).toBe('user.session.token');
    expect(audience).toBe('https://banking-langchain-agent.banking-demo.com');
    expect(scopes).toEqual(['banking:read', 'banking:write']);
  });

  test('dedicated-audience exchange fails, no fallback flag => throws (no cascade)', async () => {
    oauthService.performTokenExchange.mockRejectedValue(
      new Error('no resource server for that audience')
    );

    await expect(
      resolveLangchainToken(reqWithToken('user.session.token'))
    ).rejects.toThrow(/no resource server/);
    // Only the primary audience was attempted; never a fallback.
    expect(oauthService.performTokenExchange).toHaveBeenCalledTimes(1);
  });

  test('fallback flag ON => exchanges to MCP-server audience on primary failure', async () => {
    configStore.__store.ff_langchain_audience_fallback = 'true';
    oauthService.performTokenExchange
      .mockRejectedValueOnce(new Error('primary audience not provisioned'))
      .mockResolvedValueOnce('mcp.aud.fallback.token');

    const token = await resolveLangchainToken(reqWithToken('user.session.token'));

    expect(token).toBe('mcp.aud.fallback.token');
    expect(oauthService.performTokenExchange).toHaveBeenCalledTimes(2);
    expect(oauthService.performTokenExchange.mock.calls[1][1]).toBe(
      'https://banking-mcp-server.banking-demo.com'
    );
  });
});
