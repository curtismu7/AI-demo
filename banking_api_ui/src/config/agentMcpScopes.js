// banking_api_ui/src/config/agentMcpScopes.js
/** Human-readable catalog for Agent MCP OAuth scopes (RFC 8693 to banking_mcp_server). */

export const AGENT_MCP_SCOPE_CATALOG = [
  // ── Broad umbrella scopes ──────────────────────────────────────────────────
  {
    scope: 'banking:read',
    label: 'Read (all data)',
    description:
      'View own accounts, balances, and transaction history. Satisfies any read tool without needing specific scopes.',
    group: 'broad',
  },
  {
    scope: 'banking:write',
    label: 'Write (transfers & deposits)',
    description:
      'Transfer funds, make deposits, and withdrawals. Satisfies any write tool without needing specific scopes.',
    group: 'broad',
  },
  // ── Specific scopes ────────────────────────────────────────────────────────
  {
    scope: 'banking:accounts:read',
    label: 'Accounts (specific)',
    description: 'List accounts and balances (get_my_accounts, get_account_balance). Narrower alternative to banking:read.',
    group: 'specific',
  },
  {
    scope: 'banking:transactions:read',
    label: 'Transactions (specific)',
    description: 'Read transaction history (get_my_transactions). Narrower alternative to banking:read.',
    group: 'specific',
  },
  {
    scope: 'banking:transactions:write',
    label: 'Transfers & movement (specific)',
    description:
      'Deposits, withdrawals, and transfers. Narrower alternative to banking:write.',
    group: 'specific',
  },
  {
    scope: 'ai_agent',
    label: 'User lookup (agent)',
    description: 'Resolve user by email for agent workflows (query_user_by_email).',
    group: 'specific',
  },
{
    scope: 'banking:sensitive:read',
    label: 'Sensitive account details',
    description:
      'Access full account number and routing number. Requires explicit user consent each session. Used by get_sensitive_account_details.',
    group: 'sensitive',
  },
];

export const DEFAULT_AGENT_MCP_ALLOWED_SCOPES = AGENT_MCP_SCOPE_CATALOG.map((c) => c.scope).join(' ');
