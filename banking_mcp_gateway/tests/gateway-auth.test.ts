'use strict';

/**
 * gateway-auth.test.ts — Plan 243-02 TDD tests.
 *
 * Tests the complete auth pipeline middleware (authorizeMcpRequest):
 *   1. GatewayTokenPolicy claim validation (sub, act structure, anti-bypass)
 *   2. PingOne Authorize permit/deny evaluation (D-06)
 *   3. RFC 8693 upstream token exchange (D-03)
 *   4. Correct next-hop audience in exchanged token (D-05)
 *
 * External HTTP calls (PingOne Authorize, token exchange) are mocked.
 * The tests exercise behaviour only — no network required.
 */

import axios from 'axios';
import { GatewayTokenPolicy, GatewayTokenPolicyError } from '../src/auth/GatewayTokenPolicy';
import { PingOneAuthorizeClient } from '../src/auth/PingOneAuthorizeClient';
import { McpTokenExchangeClient } from '../src/auth/McpTokenExchangeClient';
import { buildAuthorizeMcpRequest } from '../src/middleware/authorizeMcpRequest';
import type { GatewayConfig } from '../src/config';
import type { DecodedGatewayToken } from '../src/tokenValidator';
import type { McpRequestMiddleware } from '../src/server/GatewayServer';
import { IncomingMessage, ServerResponse } from 'http';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Helper: build a minimal unsigned JWT (jwt.decode doesn't verify signatures)
function makeToken(sub: string, aud: string | string[], extra: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub, aud, exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'https://auth.example.com', scope: 'banking:read', act: { sub: 'agent-id' }, ...extra,
  })).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GATEWAY_AUD = 'https://mcp-gateway.example.com';
const OLB_AUD = 'https://mcp-olb.example.com';
const INVEST_AUD = 'https://mcp-invest.example.com';

const stubConfig: GatewayConfig = {
  port: 3099,
  host: '127.0.0.1',
  clientId: 'gw-client',
  clientSecret: 'secret',
  tokenEndpoint: 'https://auth.example.com/token',
  gatewayResourceUri: GATEWAY_AUD,
  mcpOlbWsUrl: 'ws://localhost:8080',
  mcpInvestWsUrl: 'ws://localhost:8081',
  mcpOlbResourceUri: OLB_AUD,
  mcpInvestResourceUri: INVEST_AUD,
  pingAuthorizeEndpoint: 'https://pingauthorize.example.com',
  pingAuthorizeWorkerId: 'worker-01',
  hitlServiceUrl: '',
  devBypass: false,
};

const stubConfigNoAuthz: GatewayConfig = {
  ...stubConfig,
  pingAuthorizeEndpoint: '', // no PingAuthorize — permit all
  pingAuthorizeWorkerId: '',
};

function decodedToken(overrides: Partial<DecodedGatewayToken> = {}): DecodedGatewayToken {
  return {
    sub: 'user-123',
    aud: GATEWAY_AUD,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'https://auth.example.com',
    scope: 'banking:read',
    act: { sub: 'agent-client-id' },
    ...overrides,
  };
}

function mcpBody(method: string, toolName?: string): Buffer {
  return Buffer.from(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: toolName ? { name: toolName } : {},
    }),
  );
}

function mockReqRes(): { req: Partial<IncomingMessage>; res: Partial<ServerResponse>; ended: string[] } {
  const ended: string[] = [];
  const res: Partial<ServerResponse> = {
    headersSent: false,
    writeHead: jest.fn(),
    end: jest.fn((data?: unknown) => { ended.push(typeof data === 'string' ? data : ''); return res as unknown as ServerResponse; }),
  };
  const req: Partial<IncomingMessage> = { headers: {} };
  return { req, res, ended };
}

// ---------------------------------------------------------------------------
// Section 1: GatewayTokenPolicy — claim validation (Task 1)
// ---------------------------------------------------------------------------

describe('GatewayTokenPolicy', () => {
  it('accepts a valid token with sub and gateway aud', () => {
    const decoded = decodedToken();
    expect(() => GatewayTokenPolicy.validate(decoded, stubConfig)).not.toThrow();
  });

  it('rejects when sub is missing or empty', () => {
    const decoded = decodedToken({ sub: '' });
    expect(() => GatewayTokenPolicy.validate(decoded, stubConfig)).toThrow(GatewayTokenPolicyError);
  });

  it('rejects when act is present but act.sub is empty (malformed delegation chain)', () => {
    const decoded = decodedToken({ act: { sub: '' } });
    expect(() => GatewayTokenPolicy.validate(decoded, stubConfig)).toThrow(GatewayTokenPolicyError);
  });

  it('accepts tokens without act (direct client, no agent delegation)', () => {
    const decoded = decodedToken({ act: undefined });
    expect(() => GatewayTokenPolicy.validate(decoded, stubConfig)).not.toThrow();
  });

  it('accepts tokens with valid nested act chain (user → agent)', () => {
    const decoded = decodedToken({ act: { sub: 'agent-id', act: { sub: 'orchestrator-id' } } });
    expect(() => GatewayTokenPolicy.validate(decoded, stubConfig)).not.toThrow();
  });

  it('rejects when token aud contains an upstream MCP-server audience (anti-bypass: D-05)', () => {
    // A token targeted at the OLB server should NEVER enter through the gateway
    const decoded = decodedToken({ aud: OLB_AUD });
    expect(() => GatewayTokenPolicy.validate(decoded, stubConfig)).toThrow(GatewayTokenPolicyError);
  });

  it('rejects when token aud contains invest server audience (anti-bypass: D-05)', () => {
    const decoded = decodedToken({ aud: INVEST_AUD });
    expect(() => GatewayTokenPolicy.validate(decoded, stubConfig)).toThrow(GatewayTokenPolicyError);
  });
});

// ---------------------------------------------------------------------------
// Section 2: PingOneAuthorizeClient (Task 2)
// ---------------------------------------------------------------------------

describe('PingOneAuthorizeClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns permit when PingAuthorize returns PERMIT', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { decision: 'PERMIT' } });
    const client = new PingOneAuthorizeClient(stubConfig);
    const result = await client.evaluate(decodedToken(), 'tools/call', 'get_my_accounts');
    expect(result.decision).toBe('PERMIT');
  });

  it('returns deny when PingAuthorize returns DENY', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { decision: 'DENY' } });
    const client = new PingOneAuthorizeClient(stubConfig);
    const result = await client.evaluate(decodedToken(), 'tools/call', 'create_transfer');
    expect(result.decision).toBe('DENY');
  });

  it('returns indeterminate (HITL trigger) when PingAuthorize returns INDETERMINATE', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { decision: 'INDETERMINATE' } });
    const client = new PingOneAuthorizeClient(stubConfig);
    const result = await client.evaluate(decodedToken(), 'tools/call', 'create_transfer');
    expect(result.decision).toBe('INDETERMINATE');
  });

  it('fails CLOSED (deny) when PingAuthorize endpoint is unreachable', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const client = new PingOneAuthorizeClient(stubConfig);
    const result = await client.evaluate(decodedToken(), 'tools/call', 'get_my_accounts');
    expect(result.decision).toBe('DENY');
    expect(result.reason).toMatch(/unavailable/i);
  });

  it('permits all when PingAuthorize is not configured', async () => {
    const client = new PingOneAuthorizeClient(stubConfigNoAuthz);
    const result = await client.evaluate(decodedToken(), 'tools/list');
    expect(result.decision).toBe('PERMIT');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Section 3: McpTokenExchangeClient (Task 2)
// ---------------------------------------------------------------------------

describe('McpTokenExchangeClient', () => {
  beforeEach(() => { jest.clearAllMocks(); McpTokenExchangeClient.clearCache(); });

  it('exchanges for OLB audience when tool belongs to OLB backend', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'olb-token-xyz', expires_in: 300 },
    });
    const client = new McpTokenExchangeClient(stubConfig);
    const result = await client.exchange('inbound-token', 'get_my_accounts');
    expect(result.token).toBe('olb-token-xyz');
    expect(result.targetAud).toBe(OLB_AUD);
    // RFC 8693: subject_token must be the inbound token
    const body = new URLSearchParams(mockedAxios.post.mock.calls[0][1] as string);
    expect(body.get('subject_token')).toBe('inbound-token');
    expect(body.get('audience')).toBe(OLB_AUD);
  });

  it('exchanges for invest audience when tool belongs to invest backend', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'invest-token', expires_in: 300 },
    });
    const client = new McpTokenExchangeClient(stubConfig);
    const result = await client.exchange('inbound-token', 'get_investment_balance');
    expect(result.targetAud).toBe(INVEST_AUD);
  });

  it('exchanges for OLB audience for tools/list (default backend)', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'olb-list-token', expires_in: 300 },
    });
    const client = new McpTokenExchangeClient(stubConfig);
    const result = await client.exchange('inbound-token');
    expect(result.targetAud).toBe(OLB_AUD);
  });

  it('exchanged token never carries the gateway audience (D-05 next-hop)', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'backend-token', expires_in: 300 },
    });
    const client = new McpTokenExchangeClient(stubConfig);
    const result = await client.exchange('inbound-token', 'get_my_accounts');
    expect(result.targetAud).not.toBe(GATEWAY_AUD);
  });

  it('throws when token endpoint returns no access_token', async () => {
    McpTokenExchangeClient.clearCache();
    mockedAxios.post.mockResolvedValueOnce({ data: {} });
    const client = new McpTokenExchangeClient(stubConfig);
    await expect(client.exchange('unique-no-access-token-test-' + Date.now())).rejects.toThrow(/access_token/i);
  });
});

// ---------------------------------------------------------------------------
// Section 4: buildAuthorizeMcpRequest — full pipeline integration (Task 2)
// ---------------------------------------------------------------------------

describe('buildAuthorizeMcpRequest middleware', () => {
  let middleware: McpRequestMiddleware;
  let forwardSpy: jest.Mock;
  let req: Partial<IncomingMessage>;
  let res: Partial<ServerResponse>;

  const VALID_BEARER = makeToken('user-123', GATEWAY_AUD);

  beforeEach(() => {
    jest.resetAllMocks(); // resetAllMocks drains mockResolvedValueOnce queues, clearAllMocks does not
    McpTokenExchangeClient.clearCache();
    forwardSpy = jest.fn().mockResolvedValue(undefined);
    middleware = buildAuthorizeMcpRequest(stubConfig);
    const mocks = mockReqRes();
    req = mocks.req;
    res = mocks.res;
  });

  it('permit + exchange → calls forward with exchanged token (not original bearer)', async () => {
    // PingAuthorize: PERMIT
    mockedAxios.post.mockResolvedValueOnce({ data: { decision: 'PERMIT' } });
    // Token exchange: OLB token
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'exchanged-olb-token', expires_in: 300 },
    });

    const body = mcpBody('tools/call', 'get_my_accounts');
    const bearerToken = VALID_BEARER; // must be a valid JWT; exchange verifies D-04: exchanged != original

    await middleware(
      bearerToken,
      body,
      req as IncomingMessage,
      res as ServerResponse,
      forwardSpy,
    );

    expect(forwardSpy).toHaveBeenCalledTimes(1);
    // Must NOT forward the original bearer — must use exchanged token (D-04: no token to LLM)
    const [calledWithToken] = forwardSpy.mock.calls[0];
    expect(calledWithToken).toBe('exchanged-olb-token');
    expect(calledWithToken).not.toBe(bearerToken);
  });

  it('deny from PingAuthorize → returns 403 and does NOT call forward', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { decision: 'DENY' } });

    const body = mcpBody('tools/call', 'create_transfer');
    await middleware(
      VALID_BEARER,
      body,
      req as IncomingMessage,
      res as ServerResponse,
      forwardSpy,
    );

    expect(forwardSpy).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.objectContaining({ 'Content-Type': 'application/json' }));
  });

  it('PingAuthorize unavailable → fails closed, returns 403, no forward', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const body = mcpBody('tools/call', 'get_my_accounts');
    await middleware(
      VALID_BEARER,
      body,
      req as IncomingMessage,
      res as ServerResponse,
      forwardSpy,
    );

    expect(forwardSpy).not.toHaveBeenCalled();
    // Fail closed — not a 200/forward path
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.anything());
  });

  it('token exchange failure → 502, no forward', async () => {
    // PingAuthorize: PERMIT
    mockedAxios.post.mockResolvedValueOnce({ data: { decision: 'PERMIT' } });
    // Token exchange: fails
    mockedAxios.post.mockRejectedValueOnce(new Error('token endpoint down'));

    const body = mcpBody('tools/call', 'get_my_accounts');
    await middleware(
      VALID_BEARER,
      body,
      req as IncomingMessage,
      res as ServerResponse,
      forwardSpy,
    );

    expect(forwardSpy).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(502, expect.anything());
  });

  it('no-authz config → permit all, token is still exchanged before forwarding', async () => {
    // No PingAuthorize configured — token exchange only
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'no-authz-exchanged-token', expires_in: 300 },
    });

    McpTokenExchangeClient.clearCache();
    const NO_AUTHZ_BEARER = makeToken('user-123', GATEWAY_AUD);
    const noAuthzMiddleware = buildAuthorizeMcpRequest(stubConfigNoAuthz);
    const body = mcpBody('tools/list');
    const { req: req2, res: res2 } = mockReqRes();
    const forward2 = jest.fn().mockResolvedValue(undefined);
    await noAuthzMiddleware(
      NO_AUTHZ_BEARER,
      body,
      req2 as IncomingMessage,
      res2 as ServerResponse,
      forward2,
    );

    expect(forward2).toHaveBeenCalledTimes(1);
    expect(forward2.mock.calls[0][0]).toBe('no-authz-exchanged-token');
    expect(forward2.mock.calls[0][0]).not.toBe(NO_AUTHZ_BEARER);
  });
});
