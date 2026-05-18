'use strict';

/**
 * toolScopes.ts — canonical tool-to-scope map for the MCP gateway.
 *
 * Used by index.ts and authorizeMcpRequest.ts to populate `required_scopes`
 * in denial error responses (D-03 Wave 1).
 *
 * Write/transfer tools also drive `challenge_type: 'step_up'` in HITL errors.
 */

import { gatewayToolNames, toolRequiredScopes, toolChallengeType } from './scopeTopology';

/**
 * Canonical tool→scope map for the MCP gateway, DERIVED from
 * scope-topology.json (the SSOT). Do not hand-edit — edit the manifest.
 * Only gateway-surface tools appear here (exchange-only/legacy tools are
 * BFF-side concerns). scopeTopology.regression.test.js guards drift.
 */
export const TOOL_SCOPES: Record<string, string[]> = Object.freeze(
  gatewayToolNames().reduce<Record<string, string[]>>((acc, name) => {
    acc[name] = toolRequiredScopes(name) as string[];
    return acc;
  }, {}),
) as Record<string, string[]>;

/** Scopes required by a given tool. Falls back to ['banking:read'] for unknown tools. */
export function getScopesForGatewayTool(toolName: string): string[] {
  return TOOL_SCOPES[toolName] ?? ['banking:read'];
}

/**
 * Pure scope check. Returns the required scopes the caller's bearer does NOT
 * carry. Empty array == all present. `scopeClaim` is the raw space-delimited
 * `scope` claim from the decoded token (may be undefined/empty).
 */
export function missingScopesForTool(toolName: string, scopeClaim?: string): string[] {
  const required = getScopesForGatewayTool(toolName);
  const granted = new Set(String(scopeClaim || '').split(/\s+/).filter(Boolean));
  return required.filter((s) => !granted.has(s));
}

/**
 * Local Authorize decision — the scope rule applied when PingOne Authorize is
 * NOT configured. It MUST mirror the outcome a PingOne Authorize policy would
 * return for the same inputs so the gateway behaves identically with or
 * without PA wired:
 *
 *   - bearer missing a required tool scope → DENY (insufficient_scope)
 *   - otherwise                            → PERMIT
 *
 * Both transports call this from the same no-PA branch (HTTP:
 * PingOneAuthorizeClient.evaluate, WS: pingAuthorizeGuard.guardToolCall) so
 * "Authorize" and "PingOne Authorize" produce the same PERMIT/DENY result.
 */
export function evaluateScopeDecisionLocally(
  toolName: string,
  scopeClaim?: string,
): { decision: 'PERMIT' } | { decision: 'DENY'; reason: string; missingScopes: string[] } {
  const missing = missingScopesForTool(toolName, scopeClaim);
  if (missing.length === 0) return { decision: 'PERMIT' };
  return {
    decision: 'DENY',
    reason: `insufficient_scope: missing ${missing.join(', ')}`,
    missingScopes: missing,
  };
}

const STEP_UP_TOOLS = new Set<string>(
  gatewayToolNames().filter((n) => toolChallengeType(n) === 'step_up'),
);

/**
 * Returns 'step_up' for write/transfer tools that carry financial risk.
 * Returns 'consent' for all other tools.
 */
export function getChallengeTypeForTool(toolName: string): 'step_up' | 'consent' {
  return STEP_UP_TOOLS.has(toolName) ? 'step_up' : 'consent';
}
