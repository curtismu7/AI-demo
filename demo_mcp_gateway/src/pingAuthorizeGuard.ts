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
import { GatewayConfig, isP1AZActive } from './config';
import { buildAuthorizeParameters, ToolArgs, TratClaims } from './auth/PingOneAuthorizeClient';
import { evaluateScopeDecisionLocally } from './auth/toolScopes';

export interface AuthzDecision {
  permitted: boolean;
  reason?: string;
}

export async function guardToolsList(
  decoded: DecodedGatewayToken,
  config: GatewayConfig,
): Promise<AuthzDecision> {
  if (!isP1AZActive(config)) {
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
  xTratContext?: string,
  hitlApproved?: boolean,
): Promise<AuthzDecision> {
  // Extract TraT claims from X-TraT-Context header for Authorize enrichment
  let tratClaims: TratClaims | null = null;
  if (xTratContext) {
    try {
      const parsed = JSON.parse(xTratContext);
      if (typeof parsed.purp === 'string' && typeof parsed.reqctx?.tool === 'string' && parsed.azd && parsed.rctx) {
        tratClaims = { reqctx: parsed.reqctx, purp: parsed.purp, azd: parsed.azd, rctx: parsed.rctx, trat_sim: parsed.trat_sim ?? true };
      }
    } catch { /* malformed */ }
  }

  // No P1AZ configured or flag off — apply the local scope decision so the WS
  // transport behaves IDENTICALLY to the HTTP transport
  // (PingOneAuthorizeClient.evaluate) and to a wired PingOne Authorize policy.
  if (!isP1AZActive(config)) {
    const local = evaluateScopeDecisionLocally(toolName, decoded.scope);
    if (local.decision === 'DENY') {
      return { permitted: false, reason: local.reason };
    }
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
        tratClaims,
        hitlApproved,
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
