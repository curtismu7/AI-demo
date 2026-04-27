'use strict';

/**
 * banking-mcp-gateway — entry point
 *
 * Accepts JSON-RPC over WebSocket from agent1 (token aud: MCP_GW_RESOURCE_URI).
 * Re-exchanges token per target MCP server and proxies requests.
 *
 * HTTP surfaces (same port):
 *   GET  /.well-known/oauth-protected-resource  — RFC 9728 metadata for the gateway
 *   GET  /health                                — liveness probe
 *
 * Start: MCP_GW_CLIENT_ID=... MCP_GW_CLIENT_SECRET=... node dist/index.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { loadConfig, GatewayConfig } from './config';
import { validateInboundToken, extractBearerToken, TokenValidationError } from './tokenValidator';
import { routeTool, backendWsUrl, backendResourceUri } from './router';
import { exchangeTokenForBackend } from './tokenExchange';
import { proxyJsonRpc, JsonRpcRequest, JsonRpcResponse } from './proxy';
import { guardToolsList, guardToolCall } from './pingAuthorizeGuard';
import { createHitlChallenge, getHitlChallengeStatus } from './hitlClient';
import { GatewayServer } from './server/GatewayServer';
import { buildAuthorizeMcpRequest } from './middleware/authorizeMcpRequest';

let config: GatewayConfig;
try {
  config = loadConfig();
} catch (err) {
  console.error('[GW] Configuration error:', err instanceof Error ? err.message : err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP server (metadata + health)
// ---------------------------------------------------------------------------

function handleHttp(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url || '/';

  if (url === '/.well-known/oauth-protected-resource' && req.method === 'GET') {
    const pingOneEnvId = process.env.PINGONE_ENVIRONMENT_ID || '';
    const pingOneRegion = process.env.PINGONE_REGION || 'com';
    const asList = pingOneEnvId
      ? [`https://auth.pingone.${pingOneRegion}/${pingOneEnvId}/as`]
      : [];

    const metadata: Record<string, unknown> = {
      resource: config.gatewayResourceUri,
      bearer_methods_supported: ['header'],
      scopes_supported: [
        'banking:read',
        'banking:write',
        'banking:admin',
        'ai_agent',
      ],
      resource_name: 'Super Banking MCP Gateway',
      resource_documentation: 'https://datatracker.ietf.org/doc/html/rfc9728',
    };
    if (asList.length) metadata.authorization_servers = asList;

    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' });
    res.end(JSON.stringify(metadata, null, 2));
    return;
  }

  if (url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'banking-mcp-gateway', ts: new Date().toISOString() }));
    return;
  }

  // Serve OpenAPI specs for PingAuthorize per-tool scope policy
  // GET /openapi/mcp-olb  → banking_mcp_server OpenAPI spec
  // GET /openapi/mcp-invest → banking_mcp_invest OpenAPI spec
  const openApiMatch = url.match(/^\/openapi\/(mcp-olb|mcp-invest)$/);
  if (openApiMatch && req.method === 'GET') {
    const server = openApiMatch[1];
    const specPaths: Record<string, string> = {
      'mcp-olb':    join(__dirname, '../../banking_mcp_server/openapi/mcp-olb.openapi.json'),
      'mcp-invest': join(__dirname, '../../banking_mcp_invest/openapi/mcp-invest.openapi.json'),
    };
    const specPath = specPaths[server];
    if (specPath && existsSync(specPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' });
      res.end(readFileSync(specPath, 'utf8'));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `OpenAPI spec not found for ${server}` }));
    }
    return;
  }

  res.writeHead(404);
  res.end();
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

function jsonRpcError(id: unknown, code: number, message: string, data?: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

async function handleMessage(
  rawMsg: string,
  token: string,
  send: (s: string) => void,
): Promise<void> {
  let msg: JsonRpcRequest;
  try {
    msg = JSON.parse(rawMsg);
  } catch {
    send(jsonRpcError(null, -32700, 'Parse error'));
    return;
  }

  const { method, id } = msg;

  // tools/list — validate agent can discover tools, then aggregate from all backends
  if (method === 'tools/list') {
    let decoded;
    try {
      decoded = validateInboundToken(token, config.gatewayResourceUri);
    } catch (err) {
      const ve = err as TokenValidationError;
      send(jsonRpcError(id, -32001, ve.message));
      return;
    }

    const authz = await guardToolsList(decoded, config);
    if (!authz.permitted) {
      send(jsonRpcError(id, -32403, authz.reason || 'Forbidden'));
      return;
    }

    // Proxy tools/list to both backends, merge results
    const results = await Promise.allSettled([
      proxyToolsList('olb', token),
      proxyToolsList('invest', token),
    ]);

    const allTools: unknown[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const tools = (r.value as any)?.result?.tools;
        if (Array.isArray(tools)) allTools.push(...tools);
      }
    }

    send(JSON.stringify({ jsonrpc: '2.0', id, result: { tools: allTools } }));
    return;
  }

  // tools/call — validate, guard, re-exchange, proxy
  if (method === 'tools/call') {
    let decoded;
    try {
      decoded = validateInboundToken(token, config.gatewayResourceUri);
    } catch (err) {
      const ve = err as TokenValidationError;
      send(jsonRpcError(id, -32001, ve.message));
      return;
    }

    const msgParams = msg.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
    const toolName: string = msgParams?.name || '';
    const toolArgs: Record<string, unknown> = msgParams?.arguments || {};

    // If agent is retrying with a HITL receipt, verify the challenge is approved
    const hitlChallengeId = toolArgs._hitl_challenge_id as string | undefined;
    if (hitlChallengeId) {
      if (!config.hitlServiceUrl) {
        send(jsonRpcError(id, -32500, 'HITL service not configured'));
        return;
      }
      try {
        const status = await getHitlChallengeStatus(config.hitlServiceUrl, hitlChallengeId);
        if (status.status !== 'approved') {
          send(jsonRpcError(id, -32002, `HITL challenge not approved (status: ${status.status})`, { hitl: true, challengeId: hitlChallengeId }));
          return;
        }
      } catch {
        send(jsonRpcError(id, -32500, 'Failed to verify HITL challenge'));
        return;
      }
    }

    const authz = await guardToolCall(toolName, decoded, config);
    if (!authz.permitted) {
      if (authz.reason === 'HITL_REQUIRED') {
        // Create a challenge in HITL service and return the challengeId to the agent
        if (config.hitlServiceUrl) {
          try {
            const challenge = await createHitlChallenge(config.hitlServiceUrl, {
              tool: toolName,
              userId: decoded.sub,
              agentId: decoded.act?.sub,
              context: { ...(toolArgs as Record<string, unknown>) },
            });
            send(jsonRpcError(id, -32002, 'Human approval required', {
              hitl: true,
              tool: toolName,
              challengeId: challenge.challengeId,
              expiresAt: challenge.expiresAt,
              instructions: 'Approve at dashboard, then retry with _hitl_challenge_id in arguments',
            }));
          } catch (hitlErr) {
            console.error('[GW] Failed to create HITL challenge:', hitlErr);
            send(jsonRpcError(id, -32002, 'Human approval required — HITL service unavailable', { hitl: true, tool: toolName }));
          }
        } else {
          send(jsonRpcError(id, -32002, 'Human approval required', { hitl: true, tool: toolName }));
        }
      } else {
        send(jsonRpcError(id, -32403, authz.reason || 'Forbidden'));
      }
      return;
    }

    const target = routeTool(toolName);
    const backendUri = backendResourceUri(target, config);
    const wsUrl = backendWsUrl(target, config);

    let backendToken: string;
    try {
      backendToken = await exchangeTokenForBackend(token, backendUri, config);
    } catch (err) {
      const msg2 = err instanceof Error ? err.message : String(err);
      console.error(`[GW] Token re-exchange failed for ${toolName}:`, msg2);
      send(jsonRpcError(id, -32500, 'Token exchange failed'));
      return;
    }

    let result: JsonRpcResponse;
    try {
      result = await proxyJsonRpc(wsUrl, backendToken, msg);
    } catch (err) {
      const msg2 = err instanceof Error ? err.message : String(err);
      console.error(`[GW] Proxy error for ${toolName}:`, msg2);
      send(jsonRpcError(id, -32500, 'Backend error'));
      return;
    }

    send(JSON.stringify(result));
    return;
  }

  // initialize — return gateway server info (agent1 must still handshake)
  if (method === 'initialize') {
    send(JSON.stringify({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'banking-mcp-gateway', version: '1.0.0' },
      },
    }));
    return;
  }

  if (method === 'notifications/initialized') {
    return; // no response required
  }

  send(jsonRpcError(id, -32601, `Method not found: ${method}`));
}

async function proxyToolsList(target: 'olb' | 'invest', inboundToken: string): Promise<JsonRpcResponse> {
  const backendUri = backendResourceUri(target, config);
  const wsUrl = backendWsUrl(target, config);
  const backendToken = await exchangeTokenForBackend(inboundToken, backendUri, config);
  return proxyJsonRpc(wsUrl, backendToken, {
    jsonrpc: '2.0',
    id: `gw-list-${target}`,
    method: 'tools/list',
    params: {},
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const gatewayServer = new GatewayServer({
  config,
  requestMiddleware: buildAuthorizeMcpRequest(config),
});
const httpServer = gatewayServer.httpServer;
const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws, req) => {
  const authHeader = req.headers['authorization'];
  const token = extractBearerToken(authHeader) || '';

  if (!token) {
    ws.close(4001, 'Bearer token required');
    return;
  }

  ws.on('message', (raw) => {
    handleMessage(raw.toString(), token, (s) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(s);
    }).catch((err) => {
      console.error('[GW] Unhandled message error:', err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(jsonRpcError(null, -32603, 'Internal error'));
      }
    });
  });

  ws.on('error', (err) => console.error('[GW] WebSocket error:', err.message));
});

httpServer.listen(config.port, config.host, () => {
  console.log(`[GW] banking-mcp-gateway running on ${config.host}:${config.port}`);
  console.log(`[GW] Gateway resource URI: ${config.gatewayResourceUri}`);
  console.log(`[GW] mcp-olb backend: ${config.mcpOlbWsUrl} (aud: ${config.mcpOlbResourceUri})`);
  console.log(`[GW] mcp-invest backend: ${config.mcpInvestWsUrl} (aud: ${config.mcpInvestResourceUri})`);
  console.log(`[GW] RFC 9728 + HTTP MCP ingress — POST /mcp  http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/.well-known/oauth-protected-resource`);
});

process.on('SIGINT', () => { httpServer.close(); process.exit(0); });
process.on('SIGTERM', () => { httpServer.close(); process.exit(0); });
