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
import type { GatewayConfig } from '../config';

export type AuthzDecisionOutcome = 'PERMIT' | 'DENY' | 'INDETERMINATE';

export interface AuthzDecision {
  decision: AuthzDecisionOutcome;
  reason?: string;
}

export interface ToolArgs {
  amount?: number;
  transaction_type?: string;
  to_account_id?: string;
  [key: string]: unknown;
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
  ): Promise<AuthzDecision> {
    // No PingAuthorize configured — permit all (dev/no-authz mode)
    if (!this.config.pingAuthorizeEndpoint || !this.config.pingAuthorizeWorkerId) {
      return { decision: 'PERMIT', reason: 'PingAuthorize not configured — permit all' };
    }

    const decisionContext = method === 'tools/call' ? 'McpToolCall' : 'McpRequest';
    const tokenScopes = (decoded.scope ?? '').split(' ').filter(Boolean);

    const body = {
      parameters: {
        DecisionContext: decisionContext,
        McpMethod: method,
        ToolName: toolName ?? '',
        ClientId: decoded.sub,
        ActClientId: decoded.act?.sub ?? '',
        TokenScopes: tokenScopes.join(' '),
        TokenAudience: this.config.gatewayResourceUri,
        TransactionAmount: toolArgs?.amount !== undefined ? String(toolArgs.amount) : '',
        TransactionType: toolArgs?.transaction_type ?? toolName ?? '',
        ToAccountId: toolArgs?.to_account_id ?? '',
      },
    };

    try {
      const response = await axios.post(
        `${this.config.pingAuthorizeEndpoint}/governance/pap/alpha/policy/${this.config.pingAuthorizeWorkerId}/decision`,
        body,
        { timeout: 5000, headers: { 'Content-Type': 'application/json' } },
      );

      const outcome: string = response.data?.decision ?? 'DENY';
      if (outcome === 'PERMIT') return { decision: 'PERMIT' };
      if (outcome === 'INDETERMINATE') {
        return { decision: 'INDETERMINATE', reason: 'HITL_REQUIRED' };
      }
      return { decision: 'DENY', reason: `PingAuthorize decision: ${outcome}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[PingOneAuthorizeClient] Authorize endpoint unavailable — failing closed:', msg);
      return { decision: 'DENY', reason: 'Authorization service unavailable' };
    }
  }
}
