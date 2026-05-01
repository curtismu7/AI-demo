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
};

/** Scopes required by a given tool. Falls back to ['banking:read'] for unknown tools. */
export function getScopesForGatewayTool(toolName: string): string[] {
  return TOOL_SCOPES[toolName] ?? ['banking:read'];
}

const STEP_UP_TOOLS = new Set(['create_deposit', 'create_withdrawal', 'create_transfer']);

/**
 * Returns 'step_up' for write/transfer tools that carry financial risk.
 * Returns 'consent' for all other tools.
 */
export function getChallengeTypeForTool(toolName: string): 'step_up' | 'consent' {
  return STEP_UP_TOOLS.has(toolName) ? 'step_up' : 'consent';
}
