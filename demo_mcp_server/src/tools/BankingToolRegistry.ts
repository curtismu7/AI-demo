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
      description: 'Retrieve the user\'s bank accounts with full account details including account type, name, masked account number, balance, currency, holder name, SWIFT/BIC code, IBAN, branch, and opening date. Use this for any request about account information, account details, or account overview. When the user asks about a specific account type (e.g. "my checking", "savings account", "car loan"), pass account_type to filter the results.',
      requiresUserAuth: true,
      requiredScopes: ['read'],
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
        properties: {
          account_type: {
            type: 'string',
            enum: ['checking', 'savings', 'loan', 'credit', 'investment'],
            description: 'Optional filter — only return accounts of this type. Omit to return all accounts.'
          }
        },
        required: [],
        additionalProperties: false
      }
    },

    get_account_balance: {
      name: 'get_account_balance',
      title: 'Account Balance',
      description: 'Get balance for a specific account. Use account ID (not account number) from get_my_accounts response.',
      requiresUserAuth: true,
      requiredScopes: ['read'],
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
      description: 'Retrieve sensitive account details (full account number and routing number). Requires sensitive:read scope and user consent — the UI will prompt the user to approve access before this data is released.',
      requiresUserAuth: true,
      requiredScopes: ['read'],
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
      requiredScopes: ['read'],
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
      requiredScopes: ['write'],
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
      requiredScopes: ['write'],
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
      requiredScopes: ['write'],
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

    lookup_customer: {
      name: 'lookup_customer',
      title: 'Look Up Customer',
      description: 'Search for customers by name, email, or username. Returns matching user records.',
      requiresUserAuth: true,
      requiredScopes: ['admin:read', 'users:read'],
      handler: 'executeLookupCustomer',
      readOnly: true,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%220055cc%22 d=%22M12 12c2.7 0 4-1.8 4-4s-1.3-4-4-4-4 1.8-4 4 1.3 4 4 4zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: { userFacing: { readable: true, destructive: false, idempotent: true, openWorld: false } },
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name, email, or username fragment to search for' }
        },
        required: ['query'],
        additionalProperties: false
      }
    },

    get_customer_profile: {
      name: 'get_customer_profile',
      title: 'Get Customer Profile',
      description: 'Retrieve the full profile for a customer by userId.',
      requiresUserAuth: true,
      requiredScopes: ['admin:read', 'users:read'],
      handler: 'executeGetCustomerProfile',
      readOnly: true,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%220055cc%22 d=%22M12 12c2.7 0 4-1.8 4-4s-1.3-4-4-4-4 1.8-4 4 1.3 4 4 4zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: { userFacing: { readable: true, destructive: false, idempotent: true, openWorld: false } },
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID to retrieve' }
        },
        required: ['userId'],
        additionalProperties: false
      }
    },

    get_customer_accounts: {
      name: 'get_customer_accounts',
      title: 'Get Customer Accounts',
      description: 'Retrieve all accounts for a customer by userId.',
      requiresUserAuth: true,
      requiredScopes: ['admin:read', 'users:read'],
      handler: 'executeGetCustomerAccounts',
      readOnly: true,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%220055cc%22 d=%22M12 12c2.7 0 4-1.8 4-4s-1.3-4-4-4-4 1.8-4 4 1.3 4 4 4zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: { userFacing: { readable: true, destructive: false, idempotent: true, openWorld: false } },
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID whose accounts to retrieve' }
        },
        required: ['userId'],
        additionalProperties: false
      }
    },

    get_customer_transactions: {
      name: 'get_customer_transactions',
      title: 'Get Customer Transactions',
      description: 'Retrieve the last N transactions for a customer. Defaults to 5.',
      requiresUserAuth: true,
      requiredScopes: ['admin:read', 'users:read'],
      handler: 'executeGetCustomerTransactions',
      readOnly: true,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%220055cc%22 d=%22M12 12c2.7 0 4-1.8 4-4s-1.3-4-4-4-4 1.8-4 4 1.3 4 4 4zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: { userFacing: { readable: true, destructive: false, idempotent: true, openWorld: false } },
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID' },
          limit: { type: 'number', description: 'Number of transactions to return (default 5, max 50)' }
        },
        required: ['userId'],
        additionalProperties: false
      }
    },

    freeze_account: {
      name: 'freeze_account',
      title: 'Freeze / Unfreeze Account',
      description: 'Toggle the active status of a customer account. freeze: true disables it.',
      requiresUserAuth: true,
      requiredScopes: ['admin:write', 'users:manage'],
      handler: 'executeFreezeAccount',
      readOnly: false,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22cc5500%22 d=%22M12 12c2.7 0 4-1.8 4-4s-1.3-4-4-4-4 1.8-4 4 1.3 4 4 4zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: { userFacing: { readable: false, destructive: true, idempotent: true, openWorld: false } },
      inputSchema: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'The account ID to freeze or unfreeze' },
          freeze: { type: 'boolean', description: 'true to freeze, false to unfreeze' }
        },
        required: ['accountId', 'freeze'],
        additionalProperties: false
      }
    },

    reset_customer_password: {
      name: 'reset_customer_password',
      title: 'Reset Customer Password',
      description: 'Mark a customer account as requiring a password reset. They are prompted on next login.',
      requiresUserAuth: true,
      requiredScopes: ['admin:write', 'users:manage'],
      handler: 'executeResetCustomerPassword',
      readOnly: false,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22cc5500%22 d=%22M12 12c2.7 0 4-1.8 4-4s-1.3-4-4-4-4 1.8-4 4 1.3 4 4 4zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: { userFacing: { readable: false, destructive: false, idempotent: true, openWorld: false } },
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID to mark for password reset' }
        },
        required: ['userId'],
        additionalProperties: false
      }
    },

    adjust_balance: {
      name: 'adjust_balance',
      title: 'Adjust Account Balance',
      description: 'Add or subtract from an account balance by seeding a transaction. Use positive amount to add, negative to subtract.',
      requiresUserAuth: true,
      requiredScopes: ['admin:write', 'users:manage'],
      handler: 'executeAdjustBalance',
      readOnly: false,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2020/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22cc5500%22 d=%22M12 12c2.7 0 4-1.8 4-4s-1.3-4-4-4-4 1.8-4 4 1.3 4 4 4zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: { userFacing: { readable: false, destructive: false, idempotent: false, openWorld: false } },
      inputSchema: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'The account ID to adjust' },
          amount: { type: 'number', description: 'Amount to add (positive) or subtract (negative)' },
          description: { type: 'string', description: 'Description for the seeded transaction' }
        },
        required: ['accountId', 'amount'],
        additionalProperties: false
      }
    },

    delete_customer: {
      name: 'delete_customer',
      title: 'Delete Customer',
      description: 'Permanently delete a customer and all their accounts and transactions. Requires confirm: true.',
      requiresUserAuth: true,
      requiredScopes: ['admin:write', 'admin:delete', 'users:manage'],
      handler: 'executeDeleteCustomer',
      readOnly: false,
      icons: [
        {
          src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22cc0000%22 d=%22M12 12c2.7 0 4-1.8 4-4s-1.3-4-4-4-4 1.8-4 4 1.3 4 4 4zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4z%22/%3E%3C/svg%3E',
          mimeType: 'image/svg+xml',
          sizes: ['16x16', '32x32']
        }
      ],
      annotations: { userFacing: { readable: false, destructive: true, idempotent: false, openWorld: false } },
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID to delete' },
          confirm: { type: 'boolean', description: 'Must be true — confirms the destructive action' }
        },
        required: ['userId', 'confirm'],
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