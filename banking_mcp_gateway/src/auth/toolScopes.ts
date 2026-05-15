'use strict';

/**
 * toolScopes.ts — canonical tool-to-scope map for the MCP gateway.
 *
 * Used by index.ts and authorizeMcpRequest.ts to populate `required_scopes`
 * in denial error responses (D-03 Wave 1).
 *
 * Write/transfer tools also drive `challenge_type: 'step_up'` in HITL errors.
 */

export const TOOL_SCOPES: Record<string, string[]> = {
  // OLB read tools
  get_my_accounts:              ['banking:read'],
  get_account_balance:          ['banking:read'],
  get_sensitive_account_details:['banking:read'],
  get_my_transactions:          ['banking:read'],
  query_user_by_email:          ['banking:read'],
  sequential_think:             ['banking:read'],

  // OLB write/transfer tools
  create_deposit:               ['banking:write'],
  create_withdrawal:            ['banking:write'],
  create_transfer:              ['banking:write', 'banking:transfer'],

  // Invest read tools
  get_investment_balance:       ['banking:read'],
  get_investment_accounts:      ['banking:read'],
  get_portfolio_summary:        ['banking:read'],

  // Phase 267 — Path A (api_key disposition) tool.
  // The gateway will swap the user's OAuth bearer for an X-API-Key when calling
  // banking_mortgage_service. The scope check below runs BEFORE the swap, so
  // the user MUST hold banking:mortgage:read on their MCP-side bearer for the
  // dispatch to proceed. This is the principal-consent gate before service-to-
  // service credential transformation.
  show_mortgage:                ['banking:mortgage:read'],
};

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

const STEP_UP_TOOLS = new Set(['create_deposit', 'create_withdrawal', 'create_transfer']);

/**
 * Returns 'step_up' for write/transfer tools that carry financial risk.
 * Returns 'consent' for all other tools.
 */
export function getChallengeTypeForTool(toolName: string): 'step_up' | 'consent' {
  return STEP_UP_TOOLS.has(toolName) ? 'step_up' : 'consent';
}
