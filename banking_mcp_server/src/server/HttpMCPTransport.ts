/**
 * HTTP Streamable MCP Transport (MCP spec 2025-11-25 — Phase D)
 *
 * Adds two HTTP surfaces to the existing server, both reachable on the same
 * port that already serves WebSocket connections:
 *
 *   GET  /.well-known/oauth-protected-resource   — RFC 9728 metadata
 *   POST /mcp                                    — Streamable HTTP MCP endpoint
 *   GET  /mcp                                    — 405 (SSE not required for basic spec compliance)
 *   DELETE /mcp                                  — client-initiated session termination
 *
 * The WebSocket transport is completely unchanged; enable HTTP transport with:
 *   HTTP_MCP_TRANSPORT_ENABLED=true   (env var, default true)
 *
 * Spec refs:
 *   https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
 *   https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
 */

import { IncomingMessage, ServerResponse } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { MCPMessage } from '../interfaces/mcp';
import { MCPMessageHandler, MessageHandlerContext } from './MCPMessageHandler';
import { BankingSessionManager } from '../storage/BankingSessionManager';
import { BankingAuthenticationManager } from '../auth/BankingAuthenticationManager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MCP_SESSION_HEADER = 'mcp-session-id';
const MCP_PROTO_HEADER = 'mcp-protocol-version';

const BANKING_SCOPES = [
  'banking:accounts:read',
  'banking:transactions:read',
  'banking:transactions:write',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HttpMCPTransportConfig {
  /**
   * Public base URL of this MCP server, e.g. https://mcp.example.com
   * Used in RFC 9728 metadata and WWW-Authenticate headers.
   */
  resourceUrl: string;

  /**
   * PingOne AS base URL, e.g. https://auth.pingone.com/{envId}/as
   * Used in RFC 9728 metadata so clients can discover the authorization server.
   */
  authServerUrl: string;

  /**
   * Allowed HTTP Origin values.  An empty array means any origin is permitted
   * (suitable for demo / server-to-server clients).  Set MCP_ALLOWED_ORIGINS to
   * restrict for production.
   */
  allowedOrigins: string[];
}

/** In-memory HTTP session (maps MCP-Session-Id → banking session). */
interface HttpSession {
  bankingSessionId: string;
  agentToken: string;
  /** Negotiated protocol version, filled after first initialize round-trip. */
  protocolVersion: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export class HttpMCPTransport {
  /**
   * MCP-Session-Id → HTTP session metadata.
   * All sessions share the same BankingSessionManager used by WebSocket connections.
   */
  private readonly sessions = new Map<string, HttpSession>();

  constructor(
    private readonly config: HttpMCPTransportConfig,
    private readonly messageHandler: MCPMessageHandler,
    private readonly sessionManager: BankingSessionManager,
    private readonly authManager: BankingAuthenticationManager
  ) {}

  // -------------------------------------------------------------------------
  // Entry point — called by BankingMCPServer.handleHttpRequest
  // -------------------------------------------------------------------------

  async handleRequest(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    // MUST validate Origin header on all HTTP MCP requests to prevent DNS rebinding
    // (transport spec §2.0.1)
    if (!this.isOriginAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Forbidden: invalid Origin header' }
      }));
      return;
    }

    if (pathname === '/.well-known/oauth-protected-resource') {
      this.handleMetadata(req, res);
      return;
    }

    if (pathname === '/mcp') {
      switch (req.method) {
        case 'POST':
          await this.handlePost(req, res);
          break;
        case 'DELETE':
          this.handleDelete(req, res);
          break;
        case 'GET':
          // GET /mcp is for server-initiated SSE streams, which we don't support yet.
          // Return 405 so compliant clients fall back to normal POST polling.
          res.writeHead(405, { Allow: 'POST, DELETE', 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'GET SSE streaming not yet supported; use POST' }));
          break;
        default:
          res.writeHead(405, { Allow: 'GET, POST, DELETE' });
          res.end();
      }
      return;
    }

    res.writeHead(404);
    res.end();
  }

  // -------------------------------------------------------------------------
  // GET /.well-known/oauth-protected-resource  (RFC 9728)
  // -------------------------------------------------------------------------

  private handleMetadata(_req: IncomingMessage, res: ServerResponse): void {
    const base = this.resourceBaseUrl();
    const metadata = {
      resource: `${base}/mcp`,
      authorization_servers: [this.config.authServerUrl],
      bearer_methods_supported: ['header'],
      scopes_supported: BANKING_SCOPES,
      resource_name: 'BX Finance Banking MCP Server',
      resource_documentation:
        'https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization',
    };

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(metadata, null, 2));
  }

  // -------------------------------------------------------------------------
  // POST /mcp  — Streamable HTTP MCP endpoint
  // -------------------------------------------------------------------------

  private async handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // 1. Read and parse body
    let body: string;
    try {
      body = await this.readBody(req);
    } catch {
      this.sendHttpError(res, 400, 'Could not read request body');
      return;
    }

    let message: MCPMessage;
    try {
      message = JSON.parse(body);
    } catch {
      this.sendJsonRpcError(res, null, -32700, 'Parse error: invalid JSON');
      return;
    }

    if (!message || typeof message.method !== 'string') {
      this.sendJsonRpcError(res, (message as any)?.id ?? null, -32600, 'Invalid Request');
      return;
    }

    const isNotification = message.id === undefined;
    const isInitialize = message.method === 'initialize';

    // 2. Notifications — route and return 202 (no response body per spec §2.1)
    if (isNotification) {
      const context = this.makeContext('http-notification', undefined);
      await this.messageHandler.handleMessage(message, context);
      res.writeHead(202);
      res.end();
      return;
    }

    // 3. Bearer token — required on every request
    const bearerToken = this.extractBearer(req);
    if (!bearerToken) {
      this.sendUnauthorized(res, 'Bearer token required');
      return;
    }

    try {
      await this.authManager.validateAgentToken(bearerToken);
    } catch {
      this.sendUnauthorized(res, 'Invalid or expired token');
      return;
    }

    // 4. MCP-Protocol-Version header — required on non-initialize requests
    if (!isInitialize) {
      const protoHeader = (req.headers[MCP_PROTO_HEADER] as string | undefined)?.trim();
      if (!protoHeader) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `${MCP_PROTO_HEADER} header is required on non-initialize requests` }));
        return;
      }
    }

    // 5. Session management
    let httpSession: HttpSession;
    let mcpSessionId: string;

    if (isInitialize) {
      // Create a new banking session and issue a fresh MCP-Session-Id
      const bankingSession = await this.sessionManager.createSession(bearerToken);
      mcpSessionId = uuidv4();
      httpSession = {
        bankingSessionId: bankingSession.sessionId,
        agentToken: bearerToken,
        protocolVersion: '2025-11-25',
        createdAt: new Date(),
      };
      this.sessions.set(mcpSessionId, httpSession);
      console.log(`[HttpMCPTransport] Created session ${mcpSessionId} → banking ${bankingSession.sessionId}`);
    } else {
      const incomingSessionId = req.headers[MCP_SESSION_HEADER] as string | undefined;
      if (!incomingSessionId || !this.sessions.has(incomingSessionId)) {
        // Per spec §2.5: server MUST return 404 for unknown session IDs
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unknown or expired MCP-Session-Id; send a new initialize request' }));
        return;
      }
      mcpSessionId = incomingSessionId;
      httpSession = this.sessions.get(mcpSessionId)!;
    }

    // 6. Build MCPMessageHandler context, reusing the existing banking session
    const bankingSession = (await this.sessionManager.getSession(httpSession.bankingSessionId)) ?? undefined;
    const context = this.makeContext(mcpSessionId, bankingSession, httpSession.agentToken);

    // 7. Route message
    const mcpResponse = await this.messageHandler.handleMessage(message, context);

    // Capture negotiated protocol version from initialize response
    if (isInitialize && mcpResponse?.result?.['protocolVersion']) {
      httpSession.protocolVersion = mcpResponse.result['protocolVersion'] as string;
    }

    // Notifications produce null responses
    if (mcpResponse === null) {
      res.writeHead(202);
      res.end();
      return;
    }

    // 8. Detect auth-challenge in tool call result and promote to HTTP 403 with scope hint.
    // An auth challenge in the content means the token lacks a specific scope — we can
    // return 403 + WWW-Authenticate so the client knows which scope to request.
    if (message.method === 'tools/call' && mcpResponse.result) {
      const content = mcpResponse.result['content'] as Array<any> | undefined;
      const authChallenge = content?.[0]?.authChallenge;
      if (authChallenge?.scope) {
        this.sendInsufficientScope(res, authChallenge.scope.split(' ').filter(Boolean));
        return;
      }
    }

    // 9. Send JSON-RPC response with MCP-Session-Id header
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [MCP_SESSION_HEADER]: mcpSessionId,
    };

    res.writeHead(200, headers);
    res.end(JSON.stringify({ jsonrpc: '2.0', ...mcpResponse }));
  }

  // -------------------------------------------------------------------------
  // DELETE /mcp  — client-initiated session termination (spec §2.5)
  // -------------------------------------------------------------------------

  private handleDelete(req: IncomingMessage, res: ServerResponse): void {
    const mcpSessionId = req.headers[MCP_SESSION_HEADER] as string | undefined;
    if (mcpSessionId && this.sessions.has(mcpSessionId)) {
      console.log(`[HttpMCPTransport] Session terminated by client: ${mcpSessionId}`);
      this.sessions.delete(mcpSessionId);
      res.writeHead(200);
    } else {
      res.writeHead(404);
    }
    res.end();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private makeContext(
    connectionId: string,
    bankingSession: any,
    agentToken?: string
  ): MessageHandlerContext {
    return {
      connectionId,
      agentToken,
      session: bankingSession,
      // HTTP does not support server-push notifications (no persistent channel).
      // CIBA flow still works — it blocks the HTTP response until approved.
      sendNotification: undefined,
    };
  }

  private extractBearer(req: IncomingMessage): string | null {
    const auth = req.headers['authorization'] as string | undefined;
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) return null;
    return auth.slice(7).trim() || null;
  }

  private sendUnauthorized(res: ServerResponse, detail: string, requiredScopes?: string[]): void {
    const base = this.resourceBaseUrl();
    const scopePart = requiredScopes && requiredScopes.length > 0
      ? `, scope="${requiredScopes.join(' ')}"`
      : '';
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate':
        `Bearer realm="BX Finance Banking MCP Server"${scopePart}, ` +
        `resource_metadata="${base}/.well-known/oauth-protected-resource"`,
    });
    res.end(JSON.stringify({ error: 'unauthorized', error_description: detail }));
  }

  /**
   * 403 Insufficient Scope — SHOULD per spec §Authorization when token is valid but lacks scope.
   * Returns structured WWW-Authenticate with the missing scope so clients can request it.
   */
  private sendInsufficientScope(res: ServerResponse, requiredScopes: string[]): void {
    const base = this.resourceBaseUrl();
    res.writeHead(403, {
      'Content-Type': 'application/json',
      'WWW-Authenticate':
        `Bearer realm="BX Finance Banking MCP Server", ` +
        `error="insufficient_scope", ` +
        `scope="${requiredScopes.join(' ')}", ` +
        `resource_metadata="${base}/.well-known/oauth-protected-resource"`,
    });
    res.end(JSON.stringify({
      error: 'insufficient_scope',
      error_description: `Token is missing required scope(s): ${requiredScopes.join(', ')}`,
      required_scope: requiredScopes.join(' ')
    }));
  }

  private sendHttpError(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }

  private sendJsonRpcError(
    res: ServerResponse,
    id: string | number | null,
    code: number,
    message: string
  ): void {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }));
  }

  private isOriginAllowed(req: IncomingMessage): boolean {
    const origin = req.headers['origin'] as string | undefined;
    if (!origin) {
      // No Origin header — non-browser client (CLI, MCP Inspector, server-to-server); allow.
      return true;
    }
    if (this.config.allowedOrigins.length === 0) {
      // No restriction configured — allow all.
      return true;
    }
    return this.config.allowedOrigins.includes(origin);
  }

  private resourceBaseUrl(): string {
    // Strip trailing slash if present
    return this.config.resourceUrl.replace(/\/+$/, '');
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const MAX_BYTES = 1024 * 1024; // 1 MB
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          reject(new Error('Request body too large'));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
}
