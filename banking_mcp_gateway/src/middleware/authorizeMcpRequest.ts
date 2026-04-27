'use strict';

/**
 * authorizeMcpRequest — the gateway's McpRequestMiddleware pipeline (D-03, D-05, D-06).
 *
 * Composes GatewayTokenPolicy + PingOneAuthorizeClient + McpTokenExchangeClient
 * into the McpRequestMiddleware hook that GatewayServer accepts.
 *
 * Pipeline per request:
 *   1. GatewayTokenPolicy.validate(decoded)             — claim invariants (sub, act, anti-bypass)
 *   2. PingOneAuthorizeClient.evaluate(...)             — PingOne Authorize policy decision (D-06)
 *   3. McpTokenExchangeClient.exchange(...)             — RFC 8693 next-hop token exchange (D-03)
 *   4. forward(exchangedToken, body)                    — proxy to upstream MCP server
 *
 * Failure modes:
 *   - Policy violation (claim validation)  → 401 via sendUnauthorized (handled upstream)
 *   - Authorize DENY or unavailable        → 403 Forbidden
 *   - Exchange failure                     → 502 Bad Gateway
 *
 * D-04 (no tokens to LLM): the exchanged upstream token is only used for the
 * gateway→upstream hop. It is never returned to the caller, logged to stdout
 * in a caller-visible way, or included in any LLM context.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { GatewayTokenPolicy, GatewayTokenPolicyError } from '../auth/GatewayTokenPolicy';
import { PingOneAuthorizeClient } from '../auth/PingOneAuthorizeClient';
import { McpTokenExchangeClient } from '../auth/McpTokenExchangeClient';
import type { DecodedGatewayToken } from '../tokenValidator';
import jwt from 'jsonwebtoken';
import type { McpRequestMiddleware } from '../server/GatewayServer';
import type { GatewayConfig } from '../config';

// ---------------------------------------------------------------------------
// Body parsing helper — extract method and tool name from JSON-RPC body
// ---------------------------------------------------------------------------

interface JsonRpcBody {
  method?: string;
  params?: { name?: string };
}

function parseJsonRpcBody(body: Buffer): JsonRpcBody {
  try {
    return JSON.parse(body.toString('utf-8')) as JsonRpcBody;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Factory — returns the McpRequestMiddleware for injection into GatewayServer
// ---------------------------------------------------------------------------

export function buildAuthorizeMcpRequest(config: GatewayConfig): McpRequestMiddleware {
  const authorizeClient = new PingOneAuthorizeClient(config);
  const exchangeClient = new McpTokenExchangeClient(config);

  return async (
    bearerToken: string,
    body: Buffer,
    _req: IncomingMessage,
    res: ServerResponse,
    forward: (upstreamToken: string, body: Buffer) => Promise<void>,
  ): Promise<void> => {
    // ── 1. Decode claims + apply gateway token policy ─────────────────────
    // Note: GatewayServer already validated aud/exp before invoking middleware.
    // Here we jwt.decode (no re-throw on aud/exp) to extract sub/act for Authorize.
    let decoded: DecodedGatewayToken;
    try {
      const raw = jwt.decode(bearerToken) as DecodedGatewayToken | null;
      if (!raw || !raw.sub) throw new GatewayTokenPolicyError('Empty or missing token payload', 'invalid_token');
      decoded = raw;
      GatewayTokenPolicy.validate(decoded, config);
    } catch (err) {
      if (err instanceof GatewayTokenPolicyError) {
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer error="${err.code}", error_description="${err.message}"`,
        });
        res.end(JSON.stringify({ error: err.code, message: err.message }));
        return;
      }
      throw err;
    }

    // ── 2. Parse JSON-RPC to get method + tool ─────────────────────────────
    const { method = 'unknown', params } = parseJsonRpcBody(body);
    const toolName = params?.name;

    // ── 3. PingOne Authorize evaluation (D-06) ─────────────────────────────
    let authzDecision;
    try {
      authzDecision = await authorizeClient.evaluate(decoded, method, toolName);
    } catch {
      authzDecision = { decision: 'DENY' as const, reason: 'Authorization service unavailable' };
    }

    if (authzDecision.decision !== 'PERMIT') {
      const statusCode = authzDecision.decision === 'INDETERMINATE' ? 403 : 403;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: authzDecision.decision === 'INDETERMINATE' ? 'hitl_required' : 'forbidden',
          message: authzDecision.reason ?? 'Request denied by policy',
          decision: authzDecision.decision,
        }),
      );
      return;
    }

    // ── 4. RFC 8693 token exchange for next-hop audience (D-03, D-05) ──────
    let exchangeResult;
    try {
      exchangeResult = await exchangeClient.exchange(bearerToken, toolName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[authorizeMcpRequest] Token exchange failed:', msg);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'token_exchange_failed',
          message: 'Could not obtain upstream token — try again',
        }),
      );
      return;
    }

    // ── 5. Forward with exchanged token (D-04: original bearer stays at gateway) ──
    await forward(exchangeResult.token, body);
  };
}
