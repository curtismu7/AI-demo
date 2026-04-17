/**
 * Tool-to-Scope Mapping — Least-privilege scope configuration per MCP tool.
 * Implements D-03: Narrowed scopes per tool.
 *
 * Each tool requests only the scopes it needs for token exchange,
 * rather than requesting the full set of user scopes.
 */

export const TOOL_SCOPES: Record<string, string[]> = {
  // Read-only tools
  get_my_accounts: ['banking:read'],
  get_account_balance: ['banking:read'],
  get_sensitive_account_details: ['banking:read'],
  get_my_transactions: ['banking:read'],

  // Write tools
  create_deposit: ['banking:write'],
  create_withdrawal: ['banking:write'],
  create_transfer: ['banking:write'],

  // Admin / user lookup tools
  query_user_by_email: ['banking:read'],

  // Internal reasoning (no banking scope needed, but still requires delegation)
  sequential_think: ['banking:read'],
};

/**
 * Return the narrowed scopes required for a specific tool.
 * Falls back to ['banking:read'] for unknown tools (safe default — read-only).
 */
export function getScopesForTool(toolName: string): string[] {
  return TOOL_SCOPES[toolName] ?? ['banking:read'];
}
