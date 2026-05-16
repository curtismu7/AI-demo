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
import { PingOneAuthorizeClient } from '../auth/PingOneAuthorizeClient';
import { McpTokenExchangeClient } from '../auth/McpTokenExchangeClient';
import { GatewayIntrospectionClient } from '../auth/GatewayIntrospectionClient';
import { runMcpAuthorizationPipeline } from '../auth/authorizeMcpRequestCore';
import type { McpRequestMiddleware } from '../server/GatewayServer';
import type { GatewayConfig } from '../config';
import { getScopesForGatewayTool } from '../auth/toolScopes';
import { teachLog } from '../teachLogger';

// ---------------------------------------------------------------------------
// Body parsing helper — extract method and tool name from JSON-RPC body
// ---------------------------------------------------------------------------

interface JsonRpcBody {
  method?: string;
    params?: {
      name?: string;
      arguments?: Record<string, unknown>;
    };
}

interface GwAuditTrail {
  introspection: { active: boolean; skipped?: boolean; sub?: string; exp?: number; error?: string } | null;
  policy: { passed: boolean; error?: string } | null;
  authorize: { decision: string; reason?: string } | null;
  exchange: { targetAud: string } | null;
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
  const introspectionClient = new GatewayIntrospectionClient(config);
  const authorizeClient = new PingOneAuthorizeClient(config);
  const exchangeClient = new McpTokenExchangeClient(config);

  return async (
    bearerToken: string,
    body: Buffer,
    _req: IncomingMessage,
    res: ServerResponse,
    forward: (upstreamToken: string, body: Buffer) => Promise<void>,
  ): Promise<void> => {
    // ── Dev bypass: passthrough mode (MCP_GW_DEV_BYPASS=true) ───────────────────────
    // Skip all validation, policy eval, and token exchange. Forward the
    // original bearer token directly to the upstream MCP server.
    // The gateway still handles routing and observability; auth is bypassed.
    if (config.devBypass) {
      teachLog.info('[GW] Dev bypass: forwarding request without auth pipeline');
      await forward(bearerToken, body);
      return;
    }

    const auditTrail: GwAuditTrail = {
      introspection: null,
      policy: null,
      authorize: null,
      exchange: null,
    };

    // Helper: set the audit trail header on any response path
    const setAuditHeader = (r: ServerResponse) => {
      try {
        r.setHeader('X-Gw-Audit-Trail', JSON.stringify(auditTrail));
      } catch {
        // headers already sent — ignore
      }
    };

    // ── Steps 0 + 1: transport-agnostic pipeline (introspection + policy) ─────
    // Delegated to authorizeMcpRequestCore so the same checks run on the WS
    // transport path (BL-02). HTTP-specific rendering (writeHead, WWW-Authenticate,
    // JSON body shape) stays here; the core only returns a tagged decision.
    const pipelineResult = await runMcpAuthorizationPipeline(bearerToken, introspectionClient, config);
    auditTrail.introspection = pipelineResult.audit.introspection;
    auditTrail.policy = pipelineResult.audit.policy;

    if (pipelineResult.kind === 'introspection_failed') {
      setAuditHeader(res);
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer realm="PingOne", resource_metadata="${config.gatewayResourceUri}/.well-known/mcp-server", error="invalid_token", error_description="Token is revoked or no longer active"`,
      });
      res.end(JSON.stringify({
        error: 'login_required',
        message: 'Token is revoked or no longer active (RFC 7662)',
        required_scopes: ['banking:read'],
        login_required: true,
      }));
      return;
    }

    if (pipelineResult.kind === 'policy_violation') {
      setAuditHeader(res);
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer realm="PingOne", resource_metadata="${config.gatewayResourceUri}/.well-known/mcp-server", error="${pipelineResult.code}", error_description="${pipelineResult.message}"`,
      });
      res.end(JSON.stringify({
        error: pipelineResult.code,
        message: pipelineResult.message,
        required_scopes: ['banking:read'],
        login_required: true,
      }));
      return;
    }

    const decoded = pipelineResult.decoded;

    // ── Step 2: Parse JSON-RPC to get method, tool name, and transaction args ──────
    const parsedBody = parseJsonRpcBody(body);
    const { method = 'unknown', params } = parsedBody;
    const toolName = params?.name;
    let toolArgs = params?.arguments as Record<string, unknown> | undefined;

    // WR-03: `_hitl_challenge_id` is a gateway-internal control field. The WS
    // path (index.ts) strips it before forwarding (Phase 2 CR-01); the HTTP
    // path forwarded the original body Buffer verbatim, leaking it to the
    // backend (which may reject unrecognized args under strict input-schema
    // validation). Rebuild the body with the field removed before forwarding.
    let outBody = body;
    if (toolArgs && '_hitl_challenge_id' in toolArgs) {
      const { _hitl_challenge_id: _stripped, ...rest } = toolArgs;
      toolArgs = rest;
      if (parsedBody.params) parsedBody.params.arguments = rest;
      outBody = Buffer.from(JSON.stringify(parsedBody), 'utf-8');
    }

    // ── Step 3: PingOne Authorize evaluation (D-06) ───────────────────────────────
    let authzDecision;
    try {
      authzDecision = await authorizeClient.evaluate(decoded, method, toolName, toolArgs as any);
    } catch {
      authzDecision = { decision: 'DENY' as const, reason: 'Authorization service unavailable' };
    }
    auditTrail.authorize = { decision: authzDecision.decision, reason: authzDecision.reason };

    if (authzDecision.decision !== 'PERMIT') {
      setAuditHeader(res);
      const statusCode = authzDecision.decision === 'INDETERMINATE' ? 403 : 403;
      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer realm="PingOne", resource_metadata="${config.gatewayResourceUri}/.well-known/mcp-server"`,
      });
      res.end(
        JSON.stringify(
          authzDecision.decision === 'INDETERMINATE'
            ? {
                error: 'hitl_required',
                message: authzDecision.reason ?? 'Request denied by policy',
                decision: authzDecision.decision,
                required_scopes: getScopesForGatewayTool(toolName ?? ''),
                login_required: false,
              }
            : {
                error: 'insufficient_scope',
                message: authzDecision.reason ?? 'Request denied by policy',
                decision: authzDecision.decision,
                required_scopes: getScopesForGatewayTool(toolName ?? ''),
                login_required: false,
              },
        ),
      );
      return;
    }

    // ── Step 4: RFC 8693 token exchange for next-hop audience (D-03, D-05) ─────────
    let exchangeResult;
    try {
      exchangeResult = await exchangeClient.exchange(bearerToken, toolName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      teachLog.error('[authorizeMcpRequest] Token exchange failed', err instanceof Error ? err : undefined, { detail: msg });
      setAuditHeader(res);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'token_exchange_failed',
          message: 'Could not obtain upstream token — try again',
        }),
      );
      return;
    }
    auditTrail.exchange = { targetAud: exchangeResult.targetAud };

    // ── Step 5: Forward with exchanged token (D-04: original bearer stays at gateway) ──
    // WR-03: outBody has `_hitl_challenge_id` stripped (or === body if absent).
    setAuditHeader(res);
    await forward(exchangeResult.token, outBody);
  };
}
