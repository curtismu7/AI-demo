'use strict';

/**
 * GatewayTokenPolicy — additional claim validation beyond aud/exp.
 *
 * `validateInboundToken()` in tokenValidator.ts handles aud + exp.
 * This module enforces identity-layer invariants:
 *   - sub must be non-empty (caller identity required)
 *   - act.sub must be non-empty if act is present (valid delegation chain)
 *   - Upstream MCP-server audiences must NEVER appear in the token's aud
 *     (anti-bypass invariant per D-05 — a per-hop token must not skip hops)
 */

import type { DecodedGatewayToken } from '../tokenValidator';
import type { GatewayConfig } from '../config';

export class GatewayTokenPolicyError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'GatewayTokenPolicyError';
  }
}

export class GatewayTokenPolicy {
  /**
   * Validate identity claims in an already aud/exp-validated token.
   * Throws GatewayTokenPolicyError on any violation.
   */
  static validate(decoded: DecodedGatewayToken, config: GatewayConfig): void {
    // sub must be present — every token must carry an identity
    if (!decoded.sub || decoded.sub.trim() === '') {
      throw new GatewayTokenPolicyError(
        'Token missing required sub claim',
        'missing_sub',
      );
    }

    // act chain: if present, act.sub must be non-empty
    if (decoded.act !== undefined) {
      if (!decoded.act.sub || decoded.act.sub.trim() === '') {
        throw new GatewayTokenPolicyError(
          'Malformed delegation chain: act.sub is empty',
          'invalid_act',
        );
      }
    }

    // Anti-bypass (D-05): upstream audiences must NEVER appear in the token's
    // aud. A client must obtain a gateway-targeted token first; only the
    // gateway may then exchange it for the next-hop audience.
    //
    // The blacklist must cover *every* downstream the gateway can route
    // toward, not just the two MCP servers. Phase 266 added
    // `bankingResourceServerResourceUri` (the RS audience used by
    // credentialSwap for the dualtoken/bankingdata dispositions). A
    // multi-aud token [gatewayResourceUri, bankingResourceServerResourceUri]
    // passes the inbound aud check but would be force-forwarded with the RS
    // audience already present — exactly the bypass shape D-05 exists to
    // stop. None of these URIs is ever a valid *inbound* aud, so
    // blacklisting them is safe (the gateway's own URI is excluded).
    const audList = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
    const upstreamAuds = [
      config.mcpOlbResourceUri,
      config.mcpInvestResourceUri,
      config.bankingResourceServerResourceUri,
    ].filter((a) => a && a !== config.gatewayResourceUri);
    for (const ua of upstreamAuds) {
      if (ua && audList.includes(ua)) {
        throw new GatewayTokenPolicyError(
          `Token aud [${audList.join(', ')}] targets an upstream MCP server — cannot bypass gateway (D-05)`,
          'bypass_attempt',
        );
      }
    }
  }
}
