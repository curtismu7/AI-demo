'use strict';

/**
 * GatewayServer — HTTP MCP gateway surface (RFC 9728 + Streamable HTTP MCP transport).
 *
 * Owns two client-facing HTTP paths per Plan 243-01:
 *   GET  /.well-known/oauth-protected-resource  — gateway-owned RFC 9728 metadata (D-02)
 *   POST /mcp                                   — client-facing MCP HTTP ingress (D-01)
 *   GET  /health                                — liveness probe
 *
 * The GatewayServer is the ONLY public front door for HTTP-speaking MCP clients.
 * It is NOT a pass-through to the upstream MCP server metadata — the resource claim
 * belongs to the gateway, not the upstream.
 *
 * Auth pipeline (Plans 243-01/02):
 *   1. Extract bearer token from Authorization header
 *   2. Validate inbound aud = gateway audience (rejects wrong-hop tokens, D-05)
 *   3. (Plan 243-02) PingOne Authorize evaluation via authorizeMcpRequest middleware
 *   4. (Plan 243-02) RFC 8693 exchange → upstream MCP-server audience
 *   5. Forward to upstream with exchanged token + MCP headers
 *
 * Plan 243-01 implements steps 1-2 and basic forwarding; step 3-4 are wired in 243-02.
 */

import http, { IncomingMessage, ServerResponse } from 'http';
import axios, { AxiosError } from 'axios';
import { GatewayConfig } from '../config';
import { extractBearerToken, validateInboundToken, TokenValidationError } from '../tokenValidator';

const MCP_SESSION_HEADER = 'mcp-session-id';
const MCP_PROTO_HEADER = 'mcp-protocol-version';

const GATEWAY_SCOPES = [
  'banking:read',
  'banking:write',
  'banking:admin',
  'ai_agent',
];

/**
 * Middleware hook — injected by Plan 243-02 to add PingOne Authorize + exchange.
 * Defaults to a no-op that falls through to basic forwarding.
 */
export type McpRequestMiddleware = (
  bearerToken: string,
  requestBody: Buffer,
  req: IncomingMessage,
  res: ServerResponse,
  /** call this to proceed with forwarding after middleware is satisfied */
  forward: (upstreamToken: string, body: Buffer) => Promise<void>,
) => Promise<void>;

const defaultMiddleware: McpRequestMiddleware = async (_t, body, _req, _res, forward) => {
  await forward(_t, body);
};

export interface GatewayServerOptions {
  config: GatewayConfig;
  /** Upstream MCP HTTP base URL — gateway forwards POST /mcp here */
  upstreamMcpUrl?: string;
  /** Injected by Plan 243-02 to add authorize + exchange pipeline */
  requestMiddleware?: McpRequestMiddleware;
}

export class GatewayServer {
  private readonly server: http.Server;
  private readonly config: GatewayConfig;
  private readonly upstreamMcpUrl: string;
  private readonly middleware: McpRequestMiddleware;

  constructor({ config, upstreamMcpUrl, requestMiddleware }: GatewayServerOptions) {
    this.config = config;
    this.upstreamMcpUrl = (
      upstreamMcpUrl ||
      process.env.UPSTREAM_MCP_URL ||
      'http://localhost:8080'
    ).replace(/\/$/, '');
    this.middleware = requestMiddleware ?? defaultMiddleware;
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        console.error('[GatewayServer] Unhandled error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'internal_server_error' }));
        }
      });
    });
  }

  /** Expose the underlying http.Server for WebSocket upgrade attachment or testing. */
  get httpServer(): http.Server {
    return this.server;
  }

  // ---------------------------------------------------------------------------
  // Route dispatch
  // ---------------------------------------------------------------------------

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    if (url === '/.well-known/oauth-protected-resource' && method === 'GET') {
      this.handleMetadata(res);
      return;
    }

    if (url === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'banking-mcp-gateway', ts: new Date().toISOString() }));
      return;
    }

    if (url === '/mcp') {
      switch (method) {
        case 'POST':
          await this.handleMcpPost(req, res);
          return;
        case 'GET':
          res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'method_not_allowed', message: 'Use POST for MCP requests' }));
          return;
        default:
          res.writeHead(405, { Allow: 'POST' });
          res.end();
          return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  }

  // ---------------------------------------------------------------------------
  // GET /.well-known/oauth-protected-resource  (RFC 9728)
  //
  // This is gateway-owned metadata, NOT a pass-through to the upstream MCP server.
  // The `resource` claim identifies the gateway endpoint as the protected resource
  // clients must authenticate against. (D-02)
  // ---------------------------------------------------------------------------

  private handleMetadata(res: ServerResponse): void {
    const pingOneEnvId = process.env.PINGONE_ENVIRONMENT_ID || '';
    const pingOneRegion = process.env.PINGONE_REGION || 'com';

    const metadata: Record<string, unknown> = {
      resource: this.config.gatewayResourceUri,
      bearer_methods_supported: ['header'],
      scopes_supported: GATEWAY_SCOPES,
      resource_name: 'Super Banking MCP Gateway',
      resource_documentation: 'https://datatracker.ietf.org/doc/html/rfc9728',
    };

    if (pingOneEnvId) {
      metadata.authorization_servers = [
        `https://auth.pingone.${pingOneRegion}/${pingOneEnvId}/as`,
      ];
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(metadata, null, 2));
  }

  // ---------------------------------------------------------------------------
  // POST /mcp — client-facing HTTP MCP ingress (D-01, D-03)
  //
  // 1. Require bearer token → 401 + WWW-Authenticate if missing
  // 2. Validate inbound aud = gateway audience → reject wrong-hop tokens (D-05)
  // 3. Hand off to middleware for PingOne Authorize + exchange (Plan 243-02)
  // 4. Forward with the (exchanged) token + MCP headers to upstream
  // ---------------------------------------------------------------------------

  private async handleMcpPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authHeader = req.headers['authorization'] as string | undefined;
    const bearerToken = extractBearerToken(authHeader);

    if (!bearerToken) {
      this.sendUnauthorized(res, 'invalid_token', 'Bearer token required');
      return;
    }

    try {
      validateInboundToken(bearerToken, this.config.gatewayResourceUri);
    } catch (err) {
      if (err instanceof TokenValidationError) {
        this.sendUnauthorized(res, err.code, err.message);
        return;
      }
      throw err;
    }

    // Read the request body
    let body: Buffer;
    try {
      body = await this.readBody(req);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad_request', message: 'Could not read request body' }));
      return;
    }

    // Middleware (Plan 243-02 will inject authorize + exchange here).
    // Default: pass through with the caller's bearer token.
    await this.middleware(
      bearerToken,
      body,
      req,
      res,
      async (upstreamToken, upstreamBody) => {
        await this.forwardToUpstream(req, res, upstreamToken, upstreamBody);
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Upstream forwarding — sends the MCP request to the upstream HTTP transport
  // Propagates MCP-Protocol-Version and MCP-Session-Id headers (D-03)
  // ---------------------------------------------------------------------------

  private async forwardToUpstream(
    req: IncomingMessage,
    res: ServerResponse,
    upstreamToken: string,
    body: Buffer,
  ): Promise<void> {
    const upstreamUrl = `${this.upstreamMcpUrl}/mcp`;

    const headers: Record<string, string> = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      Authorization: `Bearer ${upstreamToken}`,
    };

    // Propagate MCP session and protocol headers
    const protoVersion = req.headers[MCP_PROTO_HEADER] as string | undefined;
    if (protoVersion) headers[MCP_PROTO_HEADER] = protoVersion;

    const sessionId = req.headers[MCP_SESSION_HEADER] as string | undefined;
    if (sessionId) headers[MCP_SESSION_HEADER] = sessionId;

    try {
      const upstream = await axios.post(upstreamUrl, body, {
        headers,
        responseType: 'arraybuffer',
        timeout: parseInt(process.env.GW_UPSTREAM_TIMEOUT_MS || '30000', 10),
        validateStatus: () => true, // forward all status codes
      });

      // Propagate upstream response headers clients care about
      const responseHeaders: Record<string, string> = {
        'Content-Type': String(upstream.headers['content-type'] || 'application/json'),
      };
      const upstreamSession = upstream.headers[MCP_SESSION_HEADER] as string | undefined;
      if (upstreamSession) responseHeaders[MCP_SESSION_HEADER] = upstreamSession;
      const upstreamWwwAuth = upstream.headers['www-authenticate'] as string | undefined;
      if (upstreamWwwAuth) responseHeaders['WWW-Authenticate'] = upstreamWwwAuth;

      res.writeHead(upstream.status, responseHeaders);
      res.end(Buffer.from(upstream.data));
    } catch (err) {
      const axErr = err as AxiosError;
      if (axErr.code === 'ECONNREFUSED' || axErr.code === 'ETIMEDOUT' || axErr.code === 'ECONNRESET') {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream_unavailable', message: 'Upstream MCP server is unreachable' }));
      } else {
        throw err;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private sendUnauthorized(res: ServerResponse, errorCode: string, description: string): void {
    const realm = 'banking-mcp-gateway';
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer realm="${realm}", error="${errorCode}", error_description="${description}"`,
    });
    res.end(JSON.stringify({ error: errorCode, message: description }));
  }

  private readBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  start(port: number, host = '0.0.0.0'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on('error', reject);
      this.server.listen(port, host, () => {
        console.log(`[GatewayServer] HTTP MCP gateway listening on ${host}:${port}`);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
