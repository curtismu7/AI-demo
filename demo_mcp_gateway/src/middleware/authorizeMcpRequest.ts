'use strict';

/**
 * authorizeMcpRequest — the gateway's McpRequestMiddleware pipeline (D-05, D-06).
 *
 * Composes GatewayTokenPolicy + PingOneAuthorizeClient into the McpRequestMiddleware
 * hook that GatewayServer accepts.
 *
 * Pipeline per request:
 *   1. GatewayTokenPolicy.validate(decoded)             — claim invariants (sub, act, anti-bypass)
 *   2. PingOneAuthorizeClient.evaluate(...)             — PingOne Authorize policy decision (D-06)
 *   3. forward(bearerToken, body)                       — proxy to upstream MCP server (TX token forwarded unchanged)
 *
 * Failure modes:
 *   - Policy violation (claim validation)  → 401 via sendUnauthorized (handled upstream)
 *   - Authorize DENY or unavailable        → 403 Forbidden
 *
 * The TX token issued by the BFF (aud: ping.demo) is valid at both the gateway
 * and downstream MCP servers — no re-exchange is needed. The original bearer
 * token is forwarded unchanged to the upstream MCP server.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { PingOneAuthorizeClient } from '../auth/PingOneAuthorizeClient';
import { GatewayIntrospectionClient } from '../auth/GatewayIntrospectionClient';
import { runMcpAuthorizationPipeline } from '../auth/authorizeMcpRequestCore';
import type { McpRequestMiddleware } from '../server/GatewayServer';
import type { GatewayConfig } from '../config';
import { getScopesForGatewayTool } from '../auth/toolScopes';
import { teachLog } from '../teachLogger';
import { routeTool } from '../router';
import { buildApiKeyToolResult } from '../apiKeyDispatch';

// ---------------------------------------------------------------------------
// Body parsing helper — extract method and tool name from JSON-RPC body
// ---------------------------------------------------------------------------

interface JsonRpcBody {
  method?: string;
  id?: unknown;
    params?: {
      name?: string;
      arguments?: Record<string, unknown>;
    };
}

interface GwAuditTrail {
  introspection: { active: boolean; skipped?: boolean; sub?: string; exp?: number; error?: string } | null;
  policy: { passed: boolean; error?: string } | null;
  authorize: { decision: string; reason?: string } | null;
  mtls: { enabled: boolean; subject?: string } | null;
}

/**
 * Injectable dependencies for `buildAuthorizeMcpRequest`.
 * When provided (e.g. in tests), the production introspection + authorize
 * pipeline is bypassed and these functions are used instead.
 */
export interface AuthorizeMcpRequestDeps {
  introspect: (token: string) => Promise<{ active: boolean; sub?: string; exp?: number }>;
  authorize: (decoded: any, method: string, toolName?: string, toolArgs?: any) =>
    Promise<{ decision: 'PERMIT' | 'DENY' | 'INDETERMINATE'; reason?: string }>;
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

export function buildAuthorizeMcpRequest(
  config: GatewayConfig,
  deps?: AuthorizeMcpRequestDeps,
): McpRequestMiddleware {
  const introspectionClient = new GatewayIntrospectionClient(config);
  const authorizeClient = new PingOneAuthorizeClient(config);

  return async (
    bearerToken: string,
    body: Buffer,
    _req: IncomingMessage,
    res: ServerResponse,
    forward: (upstreamToken: string, body: Buffer) => Promise<void>,
  ): Promise<void> => {
    // ── Dev bypass: passthrough mode (MCP_GW_DEV_BYPASS=true) ───────────────────────
    // Skip all validation and policy eval. Forward the original bearer token
    // directly to the upstream MCP server.
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
      mtls: null,
    };

    // Helper: set the audit trail header on any response path
    const setAuditHeader = (r: ServerResponse) => {
      try {
        r.setHeader('X-Gw-Audit-Trail', JSON.stringify(auditTrail));
      } catch {
        // headers already sent — ignore
      }
    };

    // ── Steps 0 + 1: introspection + policy ─────────────────────────────────────────
    // When injectable deps are provided (tests), use them directly and skip the
    // production pipeline. In production, delegate to authorizeMcpRequestCore so
    // the same checks run on the WS transport path (BL-02).
    let decoded: any;
    if (deps) {
      // Test path: use injected introspect + authorize stubs
      const introspResult = await deps.introspect(bearerToken);
      auditTrail.introspection = {
        active: introspResult.active,
        sub: introspResult.sub,
        exp: introspResult.exp,
      };
      if (!introspResult.active) {
        setAuditHeader(res);
        teachLog.info('gateway audit trail', { gw_audit_trail: auditTrail });
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer realm="PingOne", resource_metadata="${config.gatewayResourceUri}/.well-known/mcp-server", error="invalid_token", error_description="Token is revoked or no longer active"`,
        });
        res.end(JSON.stringify({
          error: 'login_required',
          message: 'Token is revoked or no longer active (RFC 7662)',
          required_scopes: ['read'],
          login_required: true,
        }));
        return;
      }
      auditTrail.policy = { passed: true };
      decoded = { sub: introspResult.sub };
    } else {
      // Production path: transport-agnostic pipeline (introspection + policy)
      // HTTP-specific rendering (writeHead, WWW-Authenticate, JSON body shape)
      // stays here; the core only returns a tagged decision.
      const pipelineResult = await runMcpAuthorizationPipeline(bearerToken, introspectionClient, config);
      auditTrail.introspection = pipelineResult.audit.introspection;
      auditTrail.policy = pipelineResult.audit.policy;

      if (pipelineResult.kind === 'introspection_failed') {
        setAuditHeader(res);
        teachLog.info('gateway audit trail', { gw_audit_trail: auditTrail });
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer realm="PingOne", resource_metadata="${config.gatewayResourceUri}/.well-known/mcp-server", error="invalid_token", error_description="Token is revoked or no longer active"`,
        });
        res.end(JSON.stringify({
          error: 'login_required',
          message: 'Token is revoked or no longer active (RFC 7662)',
          required_scopes: ['read'],
          login_required: true,
        }));
        return;
      }

      if (pipelineResult.kind === 'policy_violation') {
        setAuditHeader(res);
        teachLog.info('gateway audit trail', { gw_audit_trail: auditTrail });
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer realm="PingOne", resource_metadata="${config.gatewayResourceUri}/.well-known/mcp-server", error="${pipelineResult.code}", error_description="${pipelineResult.message}"`,
        });
        res.end(JSON.stringify({
          error: pipelineResult.code,
          message: pipelineResult.message,
          required_scopes: ['read'],
          login_required: true,
        }));
        return;
      }

      decoded = pipelineResult.decoded;
    }

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
      if (deps) {
        authzDecision = await deps.authorize(decoded, method, toolName, toolArgs);
      } else {
        authzDecision = await authorizeClient.evaluate(decoded, method, toolName, toolArgs as any);
      }
    } catch {
      authzDecision = { decision: 'DENY' as const, reason: 'Authorization service unavailable' };
    }
    auditTrail.authorize = { decision: authzDecision.decision, reason: authzDecision.reason };

    if (authzDecision.decision !== 'PERMIT') {
      setAuditHeader(res);
      teachLog.info('gateway audit trail', { gw_audit_trail: auditTrail });
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

    // ── Step 3.5: Phase 266/267 disposition dispatch (BL-02 transport parity) ──────
    // tools/call for an api_key-disposition tool bypasses upstream forwarding —
    // the gateway calls the api-key backend directly (Phase 267: show_mortgage →
    // banking_mortgage_service). The WS handler (index.ts) has always done this;
    // the HTTP path used to skip it and raw-proxy to OLB, producing "Unknown tool".
    // Shared logic lives in apiKeyDispatch (one source, both transports).
    // dualtoken/bankingdata remain WS-only for now — see REGRESSION_PLAN §4.
    if (method === 'tools/call' && toolName && routeTool(toolName) === 'apikey') {
      const rpcId = parsedBody.id ?? null;
      const outcome = await buildApiKeyToolResult(toolName, decoded.sub, undefined, config);
      setAuditHeader(res);
      teachLog.info('gateway audit trail', { gw_audit_trail: auditTrail });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (outcome.ok) {
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpcId, result: outcome.result }));
      } else {
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: rpcId,
          error: { code: outcome.code, message: outcome.message, data: outcome.data },
        }));
      }
      return;
    }

    // ── Step 4: Forward with original TX token (unchanged) ───────────────────────────
    // The TX token (aud: ping.demo) is valid at both the gateway and the downstream
    // MCP server — no RFC 8693 re-exchange is needed. The original bearer token is
    // forwarded unchanged.
    // WR-03: outBody has `_hitl_challenge_id` stripped (or === body if absent).
    auditTrail.mtls = config.mtlsEnabled
      ? { enabled: true, subject: 'banking-mcp-gateway' }
      : { enabled: false };
    setAuditHeader(res);
    teachLog.info('gateway audit trail', { gw_audit_trail: auditTrail });
    await forward(bearerToken, outBody);
  };
}
