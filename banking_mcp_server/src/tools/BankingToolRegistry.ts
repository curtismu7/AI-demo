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
  readOnly: boolean; // true = safe read-only; false = writes data or accesses PII
}

/**
 * Registry of all banking tools available through the MCP server
 */
export class BankingToolRegistry {
  private static readonly TOOLS: Record<string, BankingToolDefinition> = {
    get_my_accounts: {
      name: 'get_my_accounts',
      title: 'My Bank Accounts',
      description: 'Retrieve the user\'s bank accounts with full account details including account type, name, masked account number, balance, currency, holder name, SWIFT/BIC code, IBAN, branch, and opening date. Use this for any request about account information, account details, or account overview.',
      requiresUserAuth: true,
      requiredScopes: ['banking:read'],
      handler: 'executeGetMyAccounts',
      readOnly: true,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%220055cc%22 d=%22M12 1C6.48 1 2 5.48 2 11s4.48 10 10 10 10-4.48 10-10S17.52 1 12 1zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 7 15.5 7 14 7.67 14 8.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 7 8.5 7 7 7.67 7 8.5 7.67 10 8.5 10zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: {
        userFacing: {
          readable: true,
          destructive: false,
          idempotent: true,
          openWorld: false
        }
      },
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      }
    },

    get_account_balance: {
      name: 'get_account_balance',
      title: 'Account Balance',
      description: 'Get balance for a specific account. Use account ID (not account number) from get_my_accounts response.',
      requiresUserAuth: true,
      requiredScopes: ['banking:read'],
      handler: 'executeGetAccountBalance',
      readOnly: true,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%220055cc%22 d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-13c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: {
        userFacing: {
          readable: true,
          destructive: false,
          idempotent: true,
          openWorld: false
        }
      },
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
      title: 'Account Details (Sensitive)',
      description: 'Retrieve sensitive account details (full account number and routing number). Requires banking:sensitive:read scope and user consent — the UI will prompt the user to approve access before this data is released.',
      requiresUserAuth: true,
      requiredScopes: ['banking:read', 'banking:sensitive:read'],
      handler: 'executeGetSensitiveAccountDetails',
      readOnly: false,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22cc0000%22 d=%22M12 1C6.48 1 2 5.48 2 11s4.48 10 10 10 10-4.48 10-10S17.52 1 12 1zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 7 15.5 7 14 7.67 14 8.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 7 8.5 7 7 7.67 7 8.5 7.67 10 8.5 10zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: {
        userFacing: {
          readable: true,
          destructive: false,
          idempotent: true,
          openWorld: false
        }
      },
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      }
    },

    get_my_transactions: {
      name: 'get_my_transactions',
      title: 'Transaction History',
      description: 'Retrieve user\'s transaction history',
      requiresUserAuth: true,
      requiredScopes: ['banking:read'],
      handler: 'executeGetMyTransactions',
      readOnly: true,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%220055cc%22 d=%22M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75 3.54-2.08-2.08-2.41 2.41L12 18l5.02-7.44-1.06-.27z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: {
        userFacing: {
          readable: true,
          destructive: false,
          idempotent: true,
          openWorld: false
        }
      },
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Maximum number of transactions to return (default: all)',
            minimum: 1
          }
        },
        required: [],
        additionalProperties: false
      }
    },

    create_deposit: {
      name: 'create_deposit',
      title: 'Create Deposit',
      description: 'Create a deposit transaction to an account. Use account ID (not account number) from get_my_accounts response. Amounts over $250 require human consent on the web dashboard first (returns hitl_required if attempted without it).',
      requiresUserAuth: true,
      requiredScopes: ['banking:write'],
      handler: 'executeCreateDeposit',
      readOnly: false,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22ff9900%22 d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: {
        userFacing: {
          readable: false,
          destructive: false,
          idempotent: false,
          openWorld: false
        }
      },
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
      title: 'Create Withdrawal',
      description: 'Create a withdrawal transaction from an account. Use account ID (not account number) from get_my_accounts response. Amounts over $250 require human consent on the web dashboard first (returns hitl_required if attempted without it).',
      requiresUserAuth: true,
      requiredScopes: ['banking:write'],
      handler: 'executeCreateWithdrawal',
      readOnly: false,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22ff9900%22 d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: {
        userFacing: {
          readable: false,
          destructive: true,
          idempotent: false,
          openWorld: false
        }
      },
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
      title: 'Transfer Money',
      description: 'Transfer money between accounts. Use account IDs (not account numbers) from get_my_accounts response. Amounts over $250 require human consent on the web dashboard first (returns hitl_required if attempted without it).',
      requiresUserAuth: true,
      requiredScopes: ['banking:write'],
      handler: 'executeCreateTransfer',
      readOnly: false,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22ff9900%22 d=%22M16 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-11h-1V5c0-.55-.45-1-1-1zm0 11l-4 4v-3H5v-2h7v-3l4 4z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: {
        userFacing: {
          readable: false,
          destructive: true,
          idempotent: false,
          openWorld: false
        }
      },
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
      title: 'Check Email',
      description: 'Check if a user exists in the banking system by email address',
      requiresUserAuth: false,
      requiredScopes: [],
      handler: 'executeQueryUserByEmail',
      readOnly: false,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22999999%22 d=%22M15.5 1h-8C6.12 1 5 2.12 5 3.5v17C5 21.88 6.12 23 7.5 23h8c1.38 0 2.5-1.12 2.5-2.5v-17C18 2.12 16.88 1 15.5 1zm-4 21c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5-4H7V4h9v14z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: {
        userFacing: {
          readable: true,
          destructive: false,
          idempotent: true,
          openWorld: false
        }
      },
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
      title: 'Reason & Analyze',
      description: 'Reason step-by-step through a complex banking question or decision. '
        + 'Returns a structured chain of reasoning steps with titles, descriptions, and a final conclusion. '
        + 'Use this before making complex decisions (e.g., transfer eligibility, account analysis, loan assessment).',
      requiresUserAuth: false,
      requiredScopes: [],
      handler: 'executeSequentialThink',
      readOnly: true,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%220055cc%22 d=%22M11 14h2v2h-2zm0-6h2v2h-2zm0-6h2v2h-2zm6 0h2v2h-2zm0 6h2v2h-2zm0 6h2v2h-2zm-12 0h2v2H5zm0-6h2v2H5zm0-6h2v2H5z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: {
        userFacing: {
          readable: true,
          destructive: false,
          idempotent: true,
          openWorld: true
        }
      },
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
   * Get read-only tools (safe for external agents without write scopes)
   */
  public static getReadOnlyTools(): BankingToolDefinition[] {
    return Object.values(this.TOOLS).filter(t => t.readOnly);
  }

  /**
   * Get authenticated/write tools (require user auth and write scopes)
   */
  public static getAuthenticatedTools(): BankingToolDefinition[] {
    return Object.values(this.TOOLS).filter(t => !t.readOnly);
  }

  /**
   * Get MCP-compatible tool definitions (without handler property)
   * Includes MCP 2025-11-25 spec-compliant metadata: title, icons, annotations
   */
  public static getMCPToolDefinitions(): ToolDefinition[] {
    return Object.values(this.TOOLS).map(tool => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      icons: tool.icons,
      annotations: tool.annotations,
      requiresUserAuth: tool.requiresUserAuth,
      requiredScopes: tool.requiredScopes
    }));
  }
}