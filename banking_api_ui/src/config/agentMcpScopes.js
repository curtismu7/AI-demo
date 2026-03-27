// banking_api_ui/src/config/agentMcpScopes.js
/** Human-readable catalog for Agent MCP OAuth scopes (RFC 8693 to banking_mcp_server). */

export const AGENT_MCP_SCOPE_CATALOG = [
  {
    scope: 'banking:accounts:read',
    label: 'Accounts',
    description: 'List accounts and balances (get_my_accounts, get_account_balance).',
  },
  {
    scope: 'banking:transactions:read',
    label: 'Transactions',
    description: 'Read transaction history (get_my_transactions).',
  },
  {
    scope: 'banking:transactions:write',
    label: 'Transfers & movement',
    description:
      'Deposits, withdrawals, and transfers — includes the transfer scope for MCP write tools.',
  },
  {
    scope: 'ai_agent',
    label: 'User lookup (agent)',
    description: 'Resolve user by email for agent workflows (query_user_by_email).',
  },
];

export const DEFAULT_AGENT_MCP_ALLOWED_SCOPES = AGENT_MCP_SCOPE_CATALOG.map((c) => c.scope).join(' ');
