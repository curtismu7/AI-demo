'use strict';

/**
 * PingAuthorize guard for tools/list.
 *
 * When PINGAUTHORIZE_ENDPOINT and PINGAUTHORIZE_WORKER_ID are set, the gateway
 * calls the decision endpoint to verify the agent's client is permitted to
 * discover tools on this gateway at all (client-credential check per the diagram).
 *
 * Returns { permitted: true } on PERMIT or when PA is not configured.
 * Returns { permitted: false, reason } on DENY.
 */

import axios from 'axios';
import { DecodedGatewayToken } from './tokenValidator';
import { GatewayConfig } from './config';
import { buildAuthorizeParameters, ToolArgs } from './auth/PingOneAuthorizeClient';

export interface AuthzDecision {
  permitted: boolean;
  reason?: string;
}

export async function guardToolsList(
  decoded: DecodedGatewayToken,
  config: GatewayConfig,
): Promise<AuthzDecision> {
  if (!config.pingAuthorizeEndpoint || !config.pingAuthorizeWorkerId) {
    return { permitted: true };
  }

  try {
    const body = {
      parameters: {
        DecisionContext: 'McpToolsList',
        ClientId: decoded.sub,
        ActClientId: decoded.act?.sub || '',
        TokenAudience: config.gatewayResourceUri,
      },
    };

    const response = await axios.post(
      `${config.pingAuthorizeEndpoint}/governance/pap/alpha/policy/${config.pingAuthorizeWorkerId}/decision`,
      body,
      { timeout: 5000, headers: { 'Content-Type': 'application/json' } },
    );

    const decision: string = response.data?.decision || 'DENY';
    if (decision === 'PERMIT') return { permitted: true };

    return { permitted: false, reason: `PingAuthorize decision: ${decision}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[GW] PingAuthorize guard failed — failing closed:', msg);
    return { permitted: false, reason: 'Authorization check unavailable' };
  }
}

export async function guardToolCall(
  toolName: string,
  decoded: DecodedGatewayToken,
  config: GatewayConfig,
  toolArgs?: ToolArgs,
): Promise<AuthzDecision> {
  if (!config.pingAuthorizeEndpoint || !config.pingAuthorizeWorkerId) {
    return { permitted: true };
  }

  try {
    // WR-02: use the shared param-builder so the WS transport sends the SAME
    // PingAuthorize inputs (TransactionAmount/TransactionType/ToAccountId,
    // McpMethod) as the HTTP transport. An amount-conditioned policy now
    // fires identically regardless of transport (T-2 parity).
    const body = {
      parameters: buildAuthorizeParameters(
        decoded,
        'tools/call',
        config.gatewayResourceUri,
        toolName,
        toolArgs,
      ),
    };

    const response = await axios.post(
      `${config.pingAuthorizeEndpoint}/governance/pap/alpha/policy/${config.pingAuthorizeWorkerId}/decision`,
      body,
      { timeout: 5000, headers: { 'Content-Type': 'application/json' } },
    );

    const decision: string = response.data?.decision || 'DENY';
    if (decision === 'PERMIT') return { permitted: true };
    if (decision === 'INDETERMINATE') {
      return { permitted: false, reason: 'HITL_REQUIRED' };
    }

    return { permitted: false, reason: `PingAuthorize decision: ${decision}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[GW] PingAuthorize tool guard failed — failing closed:', msg);
    return { permitted: false, reason: 'Authorization check unavailable' };
  }
}
