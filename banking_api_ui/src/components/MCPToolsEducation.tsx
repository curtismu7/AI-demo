import React, { useState } from 'react';
import styles from './MCPToolsEducation.module.css';

interface MCPToolParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

interface MCPToolInfo {
  name: string;
  displayName: string;
  description: string;
  requiresUserAuth: boolean;
  requiredScopes: string[];
  readOnly: boolean;
  params: MCPToolParam[];
}

interface ToolCategory {
  name: string;
  description: string;
  tools: MCPToolInfo[];
  defaultExpanded: boolean;
}

const TOOL_CATEGORIES: ToolCategory[] = [
  {
    name: 'Read-Only Data Access',
    description: 'Safe read operations — no data is modified. Ideal for untrusted agents.',
    defaultExpanded: false,
    tools: [
      {
        name: 'get_my_accounts',
        displayName: 'Get My Accounts',
        description: 'Retrieve the user\'s bank accounts with full account details including account type, name, masked account number, balance, currency, holder name, SWIFT/BIC code, IBAN, branch, and opening date.',
        requiresUserAuth: true,
        requiredScopes: ['banking:accounts:read'],
        readOnly: true,
        params: []
      },
      {
        name: 'get_account_balance',
        displayName: 'Get Account Balance',
        description: 'Get balance for a specific account using its account ID.',
        requiresUserAuth: true,
        requiredScopes: ['banking:accounts:read'],
        readOnly: true,
        params: [
          { name: 'account_id', type: 'string', description: 'Account ID (UUID format)', required: true }
        ]
      },
      {
        name: 'get_my_transactions',
        displayName: 'Get My Transactions',
        description: 'Retrieve the user\'s transaction history across all accounts.',
        requiresUserAuth: true,
        requiredScopes: ['banking:transactions:read'],
        readOnly: true,
        params: []
      },
      {
        name: 'sequential_think',
        displayName: 'Sequential Think',
        description: 'Reason step-by-step through a complex banking question or decision. Returns structured chain of reasoning steps with a final conclusion.',
        requiresUserAuth: false,
        requiredScopes: [],
        readOnly: true,
        params: [
          { name: 'query', type: 'string', description: 'The question or decision to reason through', required: true },
          { name: 'context', type: 'string', description: 'Optional additional context', required: false }
        ]
      }
    ]
  },
  {
    name: 'Write Operations',
    description: 'These tools modify data or access sensitive information. Require user authentication and consent.',
    defaultExpanded: true,
    tools: [
      {
        name: 'create_deposit',
        displayName: 'Create Deposit',
        description: 'Create a deposit transaction to an account. Amounts over $500 require human consent on the web dashboard first.',
        requiresUserAuth: true,
        requiredScopes: ['banking:transactions:write'],
        readOnly: false,
        params: [
          { name: 'to_account_id', type: 'string', description: 'Account ID to deposit to', required: true },
          { name: 'amount', type: 'number', description: 'Amount to deposit', required: true },
          { name: 'description', type: 'string', description: 'Transaction description', required: false }
        ]
      },
      {
        name: 'create_withdrawal',
        displayName: 'Create Withdrawal',
        description: 'Create a withdrawal transaction from an account. Amounts over $500 require human consent on the web dashboard first.',
        requiresUserAuth: true,
        requiredScopes: ['banking:transactions:write'],
        readOnly: false,
        params: [
          { name: 'from_account_id', type: 'string', description: 'Account ID to withdraw from', required: true },
          { name: 'amount', type: 'number', description: 'Amount to withdraw', required: true },
          { name: 'description', type: 'string', description: 'Transaction description', required: false }
        ]
      },
      {
        name: 'create_transfer',
        displayName: 'Create Transfer',
        description: 'Transfer money between accounts. Amounts over $500 require human consent on the web dashboard first.',
        requiresUserAuth: true,
        requiredScopes: ['banking:transactions:write'],
        readOnly: false,
        params: [
          { name: 'from_account_id', type: 'string', description: 'Source account ID', required: true },
          { name: 'to_account_id', type: 'string', description: 'Destination account ID', required: true },
          { name: 'amount', type: 'number', description: 'Amount to transfer', required: true },
          { name: 'description', type: 'string', description: 'Transfer description', required: false }
        ]
      },
      {
        name: 'get_sensitive_account_details',
        displayName: 'Get Sensitive Account Details',
        description: 'Retrieve sensitive account details (full account number and routing number). The UI will prompt the user to approve access before this data is released.',
        requiresUserAuth: true,
        requiredScopes: ['banking:sensitive:read'],
        readOnly: false,
        params: []
      }
    ]
  },
  {
    name: 'Public',
    description: 'No authentication required. Available to any agent or caller.',
    defaultExpanded: false,
    tools: [
      {
        name: 'query_user_by_email',
        displayName: 'Query User by Email',
        description: 'Check if a user exists in the banking system by email address.',
        requiresUserAuth: false,
        requiredScopes: [],
        readOnly: false,
        params: [
          { name: 'email', type: 'string', description: 'Email address to search for', required: true }
        ]
      }
    ]
  }
];

export const MCPToolsEducation: React.FC = () => {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TOOL_CATEGORIES.map(cat => [cat.name, cat.defaultExpanded]))
  );

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };

  const totalTools = TOOL_CATEGORIES.reduce((sum, cat) => sum + cat.tools.length, 0);

  return (
    <div className={styles.mcpToolsEducation} data-testid="mcp-tools-education">
      <h2>MCP Banking Tools</h2>

      <div className={styles.introduction}>
        <p>
          The MCP server provides <strong>{totalTools} tools</strong> that an AI agent can use to interact with
          your banking data. Each tool requires specific OAuth scopes and may need user authentication.
        </p>
      </div>

      <div className={styles.categories}>
        {TOOL_CATEGORIES.map(category => {
          const isExpanded = expandedCategories[category.name];
          return (
            <div key={category.name} className={styles.category}>
              <button
                className={styles.categoryHeader}
                onClick={() => toggleCategory(category.name)}
                aria-expanded={isExpanded}
                type="button"
              >
                <span className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}>▶</span>
                <span className={styles.categoryName}>{category.name}</span>
                <span className={styles.toolCount}>{category.tools.length} tool{category.tools.length !== 1 ? 's' : ''}</span>
              </button>

              {isExpanded && (
                <div className={styles.categoryContent}>
                  <p className={styles.categoryDescription}>{category.description}</p>
                  {category.tools.map(tool => (
                    <div key={tool.name} className={styles.toolCard} data-testid={`tool-${tool.name}`}>
                      <div className={styles.toolHeader}>
                        <h3 className={styles.toolName}>{tool.displayName}</h3>
                        {tool.requiresUserAuth ? (
                          <span className={styles.authRequired} title="Requires user authentication">
                            🔐 Auth Required
                          </span>
                        ) : (
                          <span className={styles.authPublic} title="No authentication required">
                            🌐 Public
                          </span>
                        )}
                      </div>

                      <p className={styles.toolDescription}>{tool.description}</p>

                      <div className={styles.toolMeta}>
                        <div className={styles.scopes}>
                          {tool.requiredScopes.length > 0 ? (
                            tool.requiredScopes.map(scope => (
                              <span key={scope} className={styles.scopeBadge}>{scope}</span>
                            ))
                          ) : (
                            <span className={styles.noScopes}>No scopes required</span>
                          )}
                        </div>

                        {tool.params.length > 0 && (
                          <div className={styles.params}>
                            <span className={styles.paramsLabel}>Parameters:</span>
                            {tool.params.map(param => (
                              <span key={param.name} className={styles.paramBadge} title={param.description}>
                                {param.name}
                                {param.required && <span className={styles.required}>*</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
