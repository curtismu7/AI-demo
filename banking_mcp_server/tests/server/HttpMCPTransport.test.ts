/**
 * HttpMCPTransport Tests (Phase D — MCP spec 2025-11-25)
 *
 * Tests for the HTTP Streamable MCP transport and RFC 9728 protected-resource metadata.
 * Uses mock IncomingMessage / ServerResponse to exercise the transport logic directly.
 */

import { EventEmitter } from 'events';
import { IncomingMessage, ServerResponse } from 'http';
import { HttpMCPTransport, HttpMCPTransportConfig } from '../../src/server/HttpMCPTransport';
import { MCPMessageHandler } from '../../src/server/MCPMessageHandler';
import { BankingSessionManager, BankingSession } from '../../src/storage/BankingSessionManager';
import { BankingAuthenticationManager } from '../../src/auth/BankingAuthenticationManager';
import { BankingToolProvider } from '../../src/tools/BankingToolProvider';
import { PingOneConfig } from '../../src/interfaces/auth';

jest.mock('../../src/server/MCPMessageHandler');
jest.mock('../../src/storage/BankingSessionManager');
jest.mock('../../src/auth/BankingAuthenticationManager');
jest.mock('../../src/tools/BankingToolProvider');

// ---------------------------------------------------------------------------
// Helpers — mock HTTP request / response
// ---------------------------------------------------------------------------

function makeRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}): IncomingMessage {
  const ee = new EventEmitter();
  const req = Object.assign(ee, {
    method: options.method ?? 'POST',
    url: options.url ?? '/mcp',
    headers: options.headers ?? {},
  }) as unknown as IncomingMessage;

  // Emit body asynchronously so readBody() can process it
  setImmediate(() => {
    if (options.body !== undefined) {
      req.emit('data', Buffer.from(options.body));
    }
    req.emit('end');
  });
  return req;
}

interface MockResponse {
  res: ServerResponse;
  statusCode: number | undefined;
  headers: Record<string, string>;
  body: string;
}

function makeResponse(): MockResponse {
  const mock: MockResponse = {
    statusCode: undefined,
    headers: {},
    body: '',
    res: null as unknown as ServerResponse,
  };

  mock.res = {
    writeHead(code: number, hdrs?: Record<string, string | string[]>) {
      mock.statusCode = code;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          mock.headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
        }
      }
    },
    end(data?: string | Buffer) {
      if (data) mock.body = typeof data === 'string' ? data : data.toString();
    },
    setHeader(name: string, value: string) {
      mock.headers[name.toLowerCase()] = value;
    },
  } as unknown as ServerResponse;

  return mock;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('HttpMCPTransport', () => {
  let transport: HttpMCPTransport;
  let mockHandler: jest.Mocked<MCPMessageHandler>;
  let mockSessionManager: jest.Mocked<BankingSessionManager>;
  let mockAuthManager: jest.Mocked<BankingAuthenticationManager>;
  const config: HttpMCPTransportConfig = {
    resourceUrl: 'https://mcp.example.com',
    authServerUrl: 'https://auth.example.com/as',
    allowedOrigins: [],
  };

  const mockSession: BankingSession = {
    sessionId: 'banking-session-1',
    agentTokenHash: 'hash',
    createdAt: new Date(),
    lastActivity: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  };

  beforeEach(() => {
    const pingOneConfig: PingOneConfig = {
      baseUrl: 'https://auth.example.com',
      clientId: 'client',
      clientSecret: 'secret',
      tokenIntrospectionEndpoint: 'https://auth.example.com/introspect',
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
    };

    mockAuthManager = new BankingAuthenticationManager(pingOneConfig) as jest.Mocked<BankingAuthenticationManager>;
    mockSessionManager = new BankingSessionManager('path', 'key') as jest.Mocked<BankingSessionManager>;
    const mockToolProvider = {} as jest.Mocked<BankingToolProvider>;

    mockHandler = new MCPMessageHandler(mockAuthManager, mockSessionManager, mockToolProvider) as jest.Mocked<MCPMessageHandler>;

    mockAuthManager.validateAgentToken = jest.fn();
    mockSessionManager.createSession = jest.fn().mockResolvedValue(mockSession);
    mockSessionManager.getSession = jest.fn().mockResolvedValue(mockSession);

    transport = new HttpMCPTransport(config, mockHandler, mockSessionManager, mockAuthManager);
  });

  // -------------------------------------------------------------------------
  // RFC 9728 — Protected Resource Metadata
  // -------------------------------------------------------------------------

  describe('GET /.well-known/oauth-protected-resource', () => {
    it('should return 200 with RFC 9728 metadata', async () => {
      const req = makeRequest({ method: 'GET', url: '/.well-known/oauth-protected-resource', body: undefined });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/.well-known/oauth-protected-resource');

      expect(mock.statusCode).toBe(200);
      const body = JSON.parse(mock.body);
      expect(body.resource).toBe('https://mcp.example.com/mcp');
      expect(body.authorization_servers).toContain('https://auth.example.com/as');
      expect(Array.isArray(body.bearer_methods_supported)).toBe(true);
      expect(Array.isArray(body.scopes_supported)).toBe(true);
    });

    it('should set Cache-Control and Access-Control-Allow-Origin headers', async () => {
      const req = makeRequest({ method: 'GET', url: '/.well-known/oauth-protected-resource', body: undefined });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/.well-known/oauth-protected-resource');

      expect(mock.headers['cache-control']).toMatch(/max-age/);
      expect(mock.headers['access-control-allow-origin']).toBe('*');
    });
  });

  // -------------------------------------------------------------------------
  // POST /mcp — auth
  // -------------------------------------------------------------------------

  describe('POST /mcp — bearer token enforcement', () => {
    it('should return 401 with WWW-Authenticate when no bearer token is provided', async () => {
      const req = makeRequest({
        method: 'POST',
        body: JSON.stringify({ id: 1, method: 'tools/list', params: {} }),
        headers: { 'content-type': 'application/json' },
      });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/mcp');

      expect(mock.statusCode).toBe(401);
      const wwwAuth = mock.headers['www-authenticate'];
      expect(wwwAuth).toMatch(/Bearer/);
      expect(wwwAuth).toMatch(/resource_metadata/);
    });

    it('should return 401 when bearer token fails introspection', async () => {
      mockAuthManager.validateAgentToken.mockRejectedValue(new Error('invalid token'));

      const req = makeRequest({
        method: 'POST',
        body: JSON.stringify({ id: 1, method: 'tools/list', params: {} }),
        headers: {
          authorization: 'Bearer invalid-token',
          'content-type': 'application/json',
        },
      });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/mcp');

      expect(mock.statusCode).toBe(401);
    });

    it('should process request when bearer token is valid', async () => {
      mockAuthManager.validateAgentToken.mockResolvedValue({} as any);
      mockHandler.handleMessage = jest.fn().mockResolvedValue({
        id: 'init-1',
        result: {
          protocolVersion: '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name: 'test', version: '1.0.0' },
        },
      });

      const req = makeRequest({
        method: 'POST',
        body: JSON.stringify({
          id: 'init-1',
          method: 'initialize',
          params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
        }),
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
      });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/mcp');

      expect(mock.statusCode).toBe(200);
      const body = JSON.parse(mock.body);
      expect(body.result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // POST /mcp — session management
  // -------------------------------------------------------------------------

  describe('POST /mcp — session management', () => {
    it('should issue MCP-Session-Id header on initialize', async () => {
      mockAuthManager.validateAgentToken.mockResolvedValue({} as any);
      mockHandler.handleMessage = jest.fn().mockResolvedValue({
        id: 'init-2',
        result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'test', version: '1.0.0' } },
      });

      const req = makeRequest({
        method: 'POST',
        body: JSON.stringify({
          id: 'init-2',
          method: 'initialize',
          params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
        }),
        headers: { authorization: 'Bearer tok' },
      });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/mcp');

      expect(mock.statusCode).toBe(200);
      expect(mock.headers['mcp-session-id']).toBeDefined();
      expect(typeof mock.headers['mcp-session-id']).toBe('string');
      expect(mock.headers['mcp-session-id'].length).toBeGreaterThan(8);
    });

    it('should return 404 for unknown session ID on non-initialize request', async () => {
      mockAuthManager.validateAgentToken.mockResolvedValue({} as any);

      const req = makeRequest({
        method: 'POST',
        body: JSON.stringify({ id: 'tl-1', method: 'tools/list', params: {} }),
        headers: {
          authorization: 'Bearer tok',
          'mcp-session-id': 'unknown-session-id',
          'mcp-protocol-version': '2025-11-25',
        },
      });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/mcp');

      expect(mock.statusCode).toBe(404);
    });

    it('should return 400 when MCP-Protocol-Version header missing on non-initialize request', async () => {
      mockAuthManager.validateAgentToken.mockResolvedValue({} as any);

      const req = makeRequest({
        method: 'POST',
        body: JSON.stringify({ id: 'tl-2', method: 'tools/list', params: {} }),
        headers: {
          authorization: 'Bearer tok',
          'mcp-session-id': 'some-session',
          // NOTE: mcp-protocol-version intentionally omitted
        },
      });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/mcp');

      expect(mock.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /mcp — session termination
  // -------------------------------------------------------------------------

  describe('DELETE /mcp', () => {
    it('should delete an existing session and return 200', async () => {
      // First create a session via initialize
      mockAuthManager.validateAgentToken.mockResolvedValue({} as any);
      mockHandler.handleMessage = jest.fn().mockResolvedValue({
        id: 'init-del',
        result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'test', version: '1.0.0' } },
      });

      const initReq = makeRequest({
        method: 'POST',
        body: JSON.stringify({
          id: 'init-del',
          method: 'initialize',
          params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
        }),
        headers: { authorization: 'Bearer tok' },
      });
      const initMock = makeResponse();
      await transport.handleRequest(initReq, initMock.res, '/mcp');

      const sessionId = initMock.headers['mcp-session-id'];
      expect(sessionId).toBeDefined();

      // Now DELETE the session
      const delReq = makeRequest({
        method: 'DELETE',
        body: undefined,
        headers: { 'mcp-session-id': sessionId },
      });
      const delMock = makeResponse();
      await transport.handleRequest(delReq, delMock.res, '/mcp');

      expect(delMock.statusCode).toBe(200);
    });

    it('should return 404 when deleting an unknown session', async () => {
      const req = makeRequest({
        method: 'DELETE',
        body: undefined,
        headers: { 'mcp-session-id': 'no-such-session' },
      });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/mcp');

      expect(mock.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // GET /mcp — 405 (SSE not supported)
  // -------------------------------------------------------------------------

  describe('GET /mcp', () => {
    it('should return 405 with Allow header', async () => {
      const req = makeRequest({ method: 'GET', body: undefined });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/mcp');

      expect(mock.statusCode).toBe(405);
    });
  });

  // -------------------------------------------------------------------------
  // Origin validation
  // -------------------------------------------------------------------------

  describe('Origin validation', () => {
    it('should return 403 when Origin is not in the allowedOrigins list', async () => {
      const restrictedTransport = new HttpMCPTransport(
        { ...config, allowedOrigins: ['https://allowed.example.com'] },
        mockHandler,
        mockSessionManager,
        mockAuthManager
      );

      const req = makeRequest({
        method: 'POST',
        body: JSON.stringify({ id: 1, method: 'tools/list', params: {} }),
        headers: { origin: 'https://evil.example.com' },
      });
      const mock = makeResponse();

      await restrictedTransport.handleRequest(req, mock.res, '/mcp');

      expect(mock.statusCode).toBe(403);
    });

    it('should allow request when no Origin header is present (non-browser client)', async () => {
      const restrictedTransport = new HttpMCPTransport(
        { ...config, allowedOrigins: ['https://allowed.example.com'] },
        mockHandler,
        mockSessionManager,
        mockAuthManager
      );

      const req = makeRequest({
        method: 'POST',
        body: JSON.stringify({ id: 1, method: 'tools/list', params: {} }),
        headers: {
          authorization: 'Bearer tok',
          // No origin header — simulates CLI / server-to-server client
        },
      });
      const mock = makeResponse();

      mockAuthManager.validateAgentToken.mockResolvedValue({} as any);
      mockHandler.handleMessage = jest.fn().mockResolvedValue({
        id: 1,
        result: { tools: [] },
      });

      await restrictedTransport.handleRequest(req, mock.res, '/mcp');

      // Should NOT be 403 (origin gate passed)
      expect(mock.statusCode).not.toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // 403 Insufficient scope
  // -------------------------------------------------------------------------

  describe('403 insufficient scope via WWW-Authenticate', () => {
    it('should promote auth-challenge tool result to 403 with insufficient_scope', async () => {
      mockAuthManager.validateAgentToken.mockResolvedValue({} as any);
      mockSessionManager.createSession.mockResolvedValue(mockSession);
      mockSessionManager.getSession.mockResolvedValue(mockSession);

      // Tool result that carries an authChallenge (means token lacks scope)
      mockHandler.handleMessage = jest.fn().mockResolvedValue({
        id: 'tc-scope',
        result: {
          content: [{ type: 'text', text: 'auth_challenge', authChallenge: { scope: 'banking:write' } }],
          isError: false,
        },
      });

      const req = makeRequest({
        method: 'POST',
        body: JSON.stringify({
          id: 'tc-scope',
          method: 'initialize',
          params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } },
        }),
        headers: { authorization: 'Bearer tok' },
      });
      const initMock = makeResponse();
      await transport.handleRequest(req, initMock.res, '/mcp');
      const sessionId = initMock.headers['mcp-session-id'];

      // Now make a tools/call that returns auth-challenge
      mockHandler.handleMessage = jest.fn().mockResolvedValue({
        id: 'tc-scope',
        result: {
          content: [{ type: 'text', text: 'need more scope', authChallenge: { scope: 'banking:write' } }],
          isError: false,
        },
      });

      const toolReq = makeRequest({
        method: 'POST',
        body: JSON.stringify({ id: 'tc-scope', method: 'tools/call', params: { name: 'create_transfer', arguments: {} } }),
        headers: {
          authorization: 'Bearer tok',
          'mcp-session-id': sessionId,
          'mcp-protocol-version': '2025-11-25',
        },
      });
      const toolMock = makeResponse();
      await transport.handleRequest(toolReq, toolMock.res, '/mcp');

      expect(toolMock.statusCode).toBe(403);
      const wwwAuth = toolMock.headers['www-authenticate'];
      expect(wwwAuth).toMatch(/insufficient_scope/);
      expect(wwwAuth).toMatch(/banking:write/);
    });
  });

  // -------------------------------------------------------------------------
  // Notifications (no response body)
  // -------------------------------------------------------------------------

  describe('Notifications', () => {
    it('should return 202 for notifications (no id field)', async () => {
      const req = makeRequest({
        method: 'POST',
        body: JSON.stringify({ method: 'notifications/initialized' }),
        headers: { authorization: 'Bearer tok' },
      });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/mcp');

      expect(mock.statusCode).toBe(202);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown path
  // -------------------------------------------------------------------------

  describe('Unknown paths', () => {
    it('should return 404 for unknown paths', async () => {
      const req = makeRequest({ method: 'GET', body: undefined, headers: {} });
      const mock = makeResponse();

      await transport.handleRequest(req, mock.res, '/unknown-path');

      expect(mock.statusCode).toBe(404);
    });
  });
});
