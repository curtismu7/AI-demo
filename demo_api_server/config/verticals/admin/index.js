'use strict';

const { verticalManifest } = require('../../../services/verticalManifest');

// Admin overlay heuristics — always enabled for admin users
// These patterns match admin-specific actions: lookup, freeze, reset password, etc.
const HEURISTICS = [
  { re: /\b(lookup|search|find)\s*(customer|user|account)\b|\bwho\s*(is|are)\b/, action: 'lookup_customer' },
  { re: /\b(customer|user).*profile\b|\bprofile\s*(information|details)\b/, action: 'get_customer_profile' },
  { re: /\b(freeze|lock|disable|unfreeze|unlock|enable)\s*(account|customer)\b/, action: 'freeze_account' },
  { re: /\b(reset|change)\s*(password|pwd)\b|\bforce.*password.*reset\b/, action: 'reset_customer_password' },
];

/**
 * Admin overlay provides admin-scoped tools that work across all verticals.
 * When an admin user is detected, these tools are merged with the current vertical's tools.
 * The admin overlay itself is NOT a vertical — it's a role-based overlay that augments the active vertical.
 */
function getManifest() {
  // Admin overlay uses its own manifest for theming/terminology in admin mode
  // But it's only activated when user.isAdmin = true
  return verticalManifest.resolver.resolve('admin') || {
    id: 'admin-overlay',
    identity: {
      displayName: 'Admin Tools',
      headerTitle: 'Admin Tools',
      documentTitle: 'Admin Tools',
      logoAlt: 'Admin icon',
      tagline: 'Administrative Operations',
      logoPath: '/super-bank-icon.png',
    },
    terminology: {
      agent: 'Admin Agent',
      dashboard: 'Admin',
    },
  };
}

function getSystemPrompt(ctx) {
  return [
    'You are an administrative assistant with elevated privileges.',
    'You can look up customers, inspect accounts, freeze/unfreeze accounts, and reset passwords.',
    `The signed-in user is an administrator.`,
    'Always confirm destructive actions (freeze, password reset) before executing them.',
  ].join(' ');
}

// Admin tools are always the same four: lookup_customer, get_customer_profile, freeze_account, reset_customer_password
// These are exposed by the MCP server; executeTool delegates to MCP
function getToolsWithActionAliases() {
  return [
    {
      name: 'lookup_customer',
      description: 'Search for customers by name, email, or username.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term (name, email, or username)' },
        },
        required: ['query'],
      },
      scopes: ['admin:read'],
      authz: {},
    },
    {
      name: 'get_customer_profile',
      description: 'Retrieve detailed profile information for a customer.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'PingOne user ID' },
        },
        required: ['userId'],
      },
      scopes: ['admin:read'],
      authz: {},
    },
    {
      name: 'freeze_account',
      description: 'Freeze or unfreeze a customer account.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'PingOne user ID' },
          freeze: { type: 'boolean', description: 'true to freeze, false to unfreeze' },
        },
        required: ['userId', 'freeze'],
      },
      scopes: ['admin:write'],
      authz: { consent: true }, // Destructive action requires consent
    },
    {
      name: 'reset_customer_password',
      description: 'Force a customer to reset their password on next login.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'PingOne user ID' },
        },
        required: ['userId'],
      },
      scopes: ['admin:write'],
      authz: { consent: true }, // Destructive action requires consent
    },
  ];
}

function getAuthz() {
  const tools = getToolsWithActionAliases();
  const out = {};
  for (const t of tools) {
    out[t.name] = t.authz || {};
  }
  return out;
}

module.exports = {
  getManifest,
  getTools: () => getToolsWithActionAliases(),
  getHeuristics: () => HEURISTICS,
  getSystemPrompt,
  getDataStore: () => ({ get: () => ({}) }), // Admin overlay has no local data store
  executeTool: async (name, params, ctx) => {
    // All admin tools are delegated to MCP execution.
    // The MCP gateway handles the actual lookup_customer, freeze_account, etc. API calls.
    const adminToolNames = ['lookup_customer', 'get_customer_profile', 'freeze_account', 'reset_customer_password'];

    if (adminToolNames.includes(name)) {
      // In Phase B2 (wire overlay into dispatch), this will integrate with
      // dispatchVerticalIntent or a dedicated MCP gateway flow.
      // For now, return a placeholder response.
      return {
        result: { data: { message: `Admin action "${name}" would execute via MCP gateway` } },
        render: 'card',
      };
    }

    return { result: { error: `unknown admin action: ${name}` }, render: 'text' };
  },
  getAuthz,
};
