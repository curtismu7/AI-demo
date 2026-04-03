/**
 * Banking Tool Registry
 * Defines all available banking tools and their schemas for MCP protocol
 */

import { ToolDefinition, JSONSchema } from '../interfaces/mcp';

export interface BankingToolDefinition extends ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  requiresUserAuth: boolean;
  requiredScopes: string[];
  handler: string; // Method name in BankingToolProvider
}

/**
 * Registry of all banking tools available through the MCP server
 */
export class BankingToolRegistry {
  private static readonly TOOLS: Record<string, BankingToolDefinition> = {
    get_my_accounts: {
      name: 'get_my_accounts',
      description: 'Retrieve user\'s bank accounts',
      requiresUserAuth: true,
      requiredScopes: ['banking:accounts:read'],
      handler: 'executeGetMyAccounts',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      }
    },

    get_account_balance: {
      name: 'get_account_balance',
      description: 'Get balance for a specific account. Use account ID (not account number) from get_my_accounts response.',
      requiresUserAuth: true,
      requiredScopes: ['banking:accounts:read'],
      handler: 'executeGetAccountBalance',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'Account ID (UUID format, not account number) - use the "id" field from get_my_accounts response',
            minLength: 1
          }
        },
        required: ['account_id'],
        additionalProperties: false
      }
    },


    get_sensitive_account_details: {
      name: 'get_sensitive_account_details',
      description: 'Retrieve sensitive account details (full account number and routing number). Requires banking:sensitive:read scope and user consent — the UI will prompt the user to approve access before this data is released.',
      requiresUserAuth: true,
      requiredScopes: ['banking:sensitive:read'],
      handler: 'executeGetSensitiveAccountDetails',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      }
    },

    get_my_transactions: {
      name: 'get_my_transactions',
      description: 'Retrieve user\'s transaction history',
      requiresUserAuth: true,
      requiredScopes: ['banking:transactions:read'],
      handler: 'executeGetMyTransactions',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      }
    },

    create_deposit: {
      name: 'create_deposit',
      description: 'Create a deposit transaction to an account. Use account ID (not account number) from get_my_accounts response. Amounts over $500 require human consent on the web dashboard first (returns consent_challenge_required if attempted without it).',
      requiresUserAuth: true,
      requiredScopes: ['banking:transactions:write'],
      handler: 'executeCreateDeposit',
      inputSchema: {
        type: 'object',
        properties: {
          to_account_id: {
            type: 'string',
            description: 'Account ID (UUID format, not account number) to deposit to - use the "id" field from get_my_accounts response',
            minLength: 1
          },
          amount: {
            type: 'number',
            description: 'Amount to deposit',
            minimum: 0.01,
            multipleOf: 0.01
          },
          description: {
            type: 'string',
            description: 'Transaction description',
            maxLength: 255
          }
        },
        required: ['to_account_id', 'amount'],
        additionalProperties: false
      }
    },

    create_withdrawal: {
      name: 'create_withdrawal',
      description: 'Create a withdrawal transaction from an account. Use account ID (not account number) from get_my_accounts response. Amounts over $500 require human consent on the web dashboard first (returns consent_challenge_required if attempted without it).',
      requiresUserAuth: true,
      requiredScopes: ['banking:transactions:write'],
      handler: 'executeCreateWithdrawal',
      inputSchema: {
        type: 'object',
        properties: {
          from_account_id: {
            type: 'string',
            description: 'Account ID (UUID format, not account number) to withdraw from - use the "id" field from get_my_accounts response',
            minLength: 1
          },
          amount: {
            type: 'number',
            description: 'Amount to withdraw',
            minimum: 0.01,
            multipleOf: 0.01
          },
          description: {
            type: 'string',
            description: 'Transaction description',
            maxLength: 255
          }
        },
        required: ['from_account_id', 'amount'],
        additionalProperties: false
      }
    },

    create_transfer: {
      name: 'create_transfer',
      description: 'Transfer money between accounts. Use account IDs (not account numbers) from get_my_accounts response. Amounts over $500 require human consent on the web dashboard first (returns consent_challenge_required if attempted without it).',
      requiresUserAuth: true,
      requiredScopes: ['banking:transactions:write'],
      handler: 'executeCreateTransfer',
      inputSchema: {
        type: 'object',
        properties: {
          from_account_id: {
            type: 'string',
            description: 'Source account ID (UUID format, not account number) - use the "id" field from get_my_accounts response',
            minLength: 1
          },
          to_account_id: {
            type: 'string',
            description: 'Destination account ID (UUID format, not account number) - use the "id" field from get_my_accounts response',
            minLength: 1
          },
          amount: {
            type: 'number',
            description: 'Amount to transfer (minimum $0.01)',
            minimum: 0.01,
            multipleOf: 0.01
          },
          description: {
            type: 'string',
            description: 'Transfer description',
            maxLength: 255
          }
        },
        required: ['from_account_id', 'to_account_id', 'amount'],
        additionalProperties: false
      }
    },

    query_user_by_email: {
      name: 'query_user_by_email',
      description: 'Check if a user exists in the banking system by email address',
      requiresUserAuth: false,
      requiredScopes: [],
      handler: 'executeQueryUserByEmail',
      inputSchema: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: 'Email address to search for',
            format: 'email',
            minLength: 1
          }
        },
        required: ['email'],
        additionalProperties: false
      }
    },

    sequential_think: {
      name: 'sequential_think',
      description: 'Reason step-by-step through a complex banking question or decision. '
        + 'Returns a structured chain of reasoning steps with titles, descriptions, and a final conclusion. '
        + 'Use this before making complex decisions (e.g., transfer eligibility, account analysis, loan assessment).',
      requiresUserAuth: false,
      requiredScopes: [],
      handler: 'executeSequentialThink',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The question or decision to reason through (e.g. "Should I transfer $500 from savings to checking?")',
            minLength: 1,
            maxLength: 500
          },
          context: {
            type: 'string',
            description: 'Optional additional context (e.g. account balances, user situation)',
            maxLength: 1000
          }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  };

  /**
   * Get all available banking tools
   */
  public static getAllTools(): BankingToolDefinition[] {
    return Object.values(this.TOOLS);
  }

  /**
   * Get tool definition by name
   */
  public static getTool(name: string): BankingToolDefinition | undefined {
    return this.TOOLS[name];
  }

  /**
   * Get tool names
   */
  public static getToolNames(): string[] {
    return Object.keys(this.TOOLS);
  }

  /**
   * Check if a tool exists
   */
  public static hasTool(name: string): boolean {
    return name in this.TOOLS;
  }

  /**
   * Get tools that require specific scopes
   */
  public static getToolsByScope(scope: string): BankingToolDefinition[] {
    return Object.values(this.TOOLS).filter(tool => 
      tool.requiredScopes.includes(scope)
    );
  }

  /**
   * Get MCP-compatible tool definitions (without handler property)
   */
  public static getMCPToolDefinitions(): ToolDefinition[] {
    return Object.values(this.TOOLS).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      requiresUserAuth: tool.requiresUserAuth,
      requiredScopes: tool.requiredScopes
    }));
  }
}