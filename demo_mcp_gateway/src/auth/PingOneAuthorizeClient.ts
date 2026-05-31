'use strict';

/**
 * PingOneAuthorizeClient — gateway-side PingOne Authorize integration (D-06).
 *
 * Evaluates per-request MCP policy decisions by calling the PingOne Authorize
 * decision endpoint. Adapts the existing pingAuthorizeGuard patterns for the
 * HTTP MCP transport layer.
 *
 * Decision outcomes:
 *   PERMIT      — allow the request, proceed to token exchange + forwarding
 *   DENY        — block the request, return 403
 *   INDETERMINATE — block and surface as HITL opportunity (treated as DENY here)
 *
 * Fails CLOSED: if PingAuthorize is unavailable, the decision is DENY.
 * If no endpoint is configured, all requests are PERMIT (dev/test mode).
 */

import axios from 'axios';
import type { DecodedGatewayToken } from '../tokenValidator';
import { isP1AZActive, type GatewayConfig } from '../config';
import { evaluateScopeDecisionLocally } from './toolScopes';

export type AuthzDecisionOutcome = 'PERMIT' | 'DENY' | 'INDETERMINATE';

export interface AuthzDecision {
  decision: AuthzDecisionOutcome;
  reason?: string;
  // HI-09: surface decision metadata for the audit trail. PingAuthorize
  // returns a unique decision_id / policy_version per evaluation — without
  // these, a stale or replayed PERMIT cannot be distinguished from a
  // fresh one. Optional because dev/no-authz mode and PA error paths
  // don't carry them.
  decisionId?: string;
  policyVersion?: string;
  traceId?: string;
}

export interface ToolArgs {
  amount?: number;
  transaction_type?: string;
  to_account_id?: string;
  [key: string]: unknown;
}

export interface TratClaims {
  reqctx: { tool: string; session_id: string; correlation_id: string };
  purp: string;
  azd: { sub: string; act?: string; gateway?: string };
  rctx: { ip: string; user_agent: string; timestamp: string };
  trat_sim?: boolean;
}


/**
 * Build the PingAuthorize decision `parameters` block.
 *
 * Single source of truth for the policy-input shape so the HTTP transport
 * (PingOneAuthorizeClient.evaluate) and the WS transport
 * (pingAuthorizeGuard.guardToolCall) send IDENTICAL inputs for the same
 * logical tool call. Without this, an amount-conditioned policy
 * (`TransactionAmount > 500`) fired on HTTP but silently not on WS — the
 * path real agents use for create_transfer (T-2 parity gap, WR-02).
 */
export function buildAuthorizeParameters(
  decoded: DecodedGatewayToken,
  method: string,
  gatewayResourceUri: string,
  toolName?: string,
  toolArgs?: ToolArgs,
  tratClaims?: TratClaims | null,
  hitlApproved?: boolean,
): Record<string, string> {
  const decisionContext = method === 'tools/call' ? 'McpToolCall' : 'McpRequest';
  const tokenScopes = (decoded.scope ?? '').split(' ').filter(Boolean);
  const base: Record<string, string> = {
    DecisionContext: decisionContext,
    McpMethod: method,
    ToolName: toolName ?? '',
    ClientId: decoded.sub,
    ActClientId: decoded.act?.sub ?? '',
    TokenScopes: tokenScopes.join(' '),
    TokenAudience: gatewayResourceUri,
    TransactionAmount: toolArgs?.amount !== undefined ? String(toolArgs.amount) : '',
    TransactionType: toolArgs?.transaction_type ?? toolName ?? '',
    ToAccountId: toolArgs?.to_account_id ?? '',
  };

  if (tratClaims) {
    base['TratPurp'] = tratClaims.purp;
    base['TratAzdAct'] = tratClaims.azd.act ?? '';
    base['TratSessionId'] = tratClaims.reqctx.session_id;
    base['TratTool'] = tratClaims.reqctx.tool;
    base['TratSim'] = String(tratClaims.trat_sim ?? false);
  }

  if (hitlApproved) {
    base['HitlApproved'] = 'true';
  }

  return base;
}

export class PingOneAuthorizeClient {
  constructor(private readonly config: GatewayConfig) {}

  /**
   * Evaluate a request against PingOne Authorize.
   *
   * @param decoded  — validated inbound token (sub, act, scope already extracted)
   * @param method   — MCP JSON-RPC method (e.g. "tools/call", "tools/list")
   * @param toolName — tool name from params.name if method is tools/call
   */
  async evaluate(
    decoded: DecodedGatewayToken,
    method: string,
    toolName?: string,
    toolArgs?: ToolArgs,
    hitlApproved?: boolean,
  ): Promise<AuthzDecision> {
    // No P1AZ configured or flag off — apply the local scope decision so the
    // gateway behaves the SAME as it would with a PingOne Authorize policy
    // wired (scope-based PERMIT/DENY). Identity/transaction policy still
    // requires PA; only the scope rule has a local equivalent.
    if (!isP1AZActive(this.config)) {
      const mode = !this.config.p1azEnabled ? 'ff=off' : 'endpoint not configured';
      const local = evaluateScopeDecisionLocally(toolName ?? '', decoded.scope);
      if (local.decision === 'DENY') {
        return { decision: 'DENY', reason: local.reason };
      }
      return { decision: 'PERMIT', reason: `P1AZ local scope decision: PERMIT (${mode})` };
    }

    const body = {
      parameters: buildAuthorizeParameters(
        decoded,
        method,
        this.config.gatewayResourceUri,
        toolName,
        toolArgs,
        null,
        hitlApproved,
      ),
    };

    try {
      const response = await axios.post(
        `${this.config.pingAuthorizeEndpoint}/governance/pap/alpha/policy/${this.config.pingAuthorizeWorkerId}/decision`,
        body,
        { timeout: 5000, headers: { 'Content-Type': 'application/json' } },
      );

      const outcome: string = response.data?.decision ?? 'DENY';
      // HI-09: lift decision_id / policy_version / trace_id off the
      // response so downstream audit logs can attribute the PERMIT to a
      // specific policy evaluation. PingAuthorize naming varies (decision_id
      // vs decisionId; policy_version vs policyVersion); accept either.
      const meta = {
        decisionId: (response.data?.decision_id ?? response.data?.decisionId) as string | undefined,
        policyVersion: (response.data?.policy_version ?? response.data?.policyVersion) as string | undefined,
        traceId: (response.data?.trace_id ?? response.data?.traceId) as string | undefined,
      };
      if (outcome === 'PERMIT') return { decision: 'PERMIT', ...meta };
      if (outcome === 'INDETERMINATE') {
        return { decision: 'INDETERMINATE', reason: 'HITL_REQUIRED', ...meta };
      }
      return { decision: 'DENY', reason: `PingAuthorize decision: ${outcome}`, ...meta };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[PingOneAuthorizeClient] Authorize endpoint unavailable — failing closed:', msg);
      return { decision: 'DENY', reason: 'Authorization service unavailable' };
    }
  }
}
