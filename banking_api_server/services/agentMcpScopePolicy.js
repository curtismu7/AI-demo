// banking_api_server/services/agentMcpScopePolicy.js
/**
 * Agent MCP scope policy — OAuth scopes allowed for RFC 8693 token exchange to banking_mcp_server.
 * Admins tune these on the Application Configuration page (`agent_mcp_allowed_scopes`).
 */
'use strict';

const { BANKING_SCOPES } = require('../config/scopes');

/** Scopes this demo understands for MCP banking tools (must match PingOne + MCP registry). */
const KNOWN_AGENT_MCP_SCOPES = [
  // Broad umbrella scopes — accepted by any matching tool; easier to configure in PingOne
  BANKING_SCOPES.BANKING_READ,              // accounts + transactions read
  BANKING_SCOPES.BANKING_WRITE,             // transfers, deposits, withdrawals
  // Specific scopes — finer-grained; accepted as an alternative to the broad scope
  BANKING_SCOPES.BANKING_READ,              // accounts + transactions read
  BANKING_SCOPES.BANKING_WRITE,             // transfers, deposits, withdrawals
  BANKING_SCOPES.SENSITIVE,                 // sensitive data operations
  BANKING_SCOPES.ADMIN,                     // admin operations
  BANKING_SCOPES.AI_AGENT,                  // AI Agent operations
];

const DEFAULT_AGENT_MCP_ALLOWED_SCOPES = KNOWN_AGENT_MCP_SCOPES.join(' ');

/**
 * Parse stored config into a Set of allowed scopes. Unknown tokens are dropped.
 * Empty / missing config → all known scopes (least surprising default).
 */
function parseAllowedScopesFromConfig(configStr) {
  const raw = (configStr || '').trim();
  if (!raw) {
    return new Set(KNOWN_AGENT_MCP_SCOPES);
  }
  const tokens = raw.split(/\s+/).filter(Boolean);
  const allowed = new Set(tokens.filter((t) => KNOWN_AGENT_MCP_SCOPES.includes(t)));
  if (allowed.size === 0) {
    return new Set(KNOWN_AGENT_MCP_SCOPES);
  }
  return allowed;
}

/**
 * True when the admin config has enabled at least one of the tool's required scopes.
 * OR logic: if a tool accepts ['banking:accounts:read', 'banking:read'], enabling EITHER
 * broad or specific scope in admin policy is sufficient to allow the tool.
 */
function isToolPermittedByAgentPolicy(toolRequiredScopes, allowedSet) {
  if (!toolRequiredScopes || toolRequiredScopes.length === 0) {
    return true;
  }
  return toolRequiredScopes.some((s) => allowedSet.has(s));
}

/**
 * Tool scopes that are NOT covered by the admin allowed set (none of the alternatives enabled).
 */
function missingAgentPolicyScopes(toolRequiredScopes, allowedSet) {
  if (!toolRequiredScopes || toolRequiredScopes.length === 0) {
    return [];
  }
  // If any scope satisfies the tool, nothing is "missing"
  if (toolRequiredScopes.some((s) => allowedSet.has(s))) return [];
  return toolRequiredScopes.filter((s) => !allowedSet.has(s));
}

/** True when every scope is one we expose in Config UI — policy applies only to these tools. */
function scopesAreCatalogOnly(toolRequiredScopes) {
  if (!toolRequiredScopes || toolRequiredScopes.length === 0) {
    return true;
  }
  return toolRequiredScopes.every((s) => KNOWN_AGENT_MCP_SCOPES.includes(s));
}

module.exports = {
  KNOWN_AGENT_MCP_SCOPES,
  DEFAULT_AGENT_MCP_ALLOWED_SCOPES,
  parseAllowedScopesFromConfig,
  isToolPermittedByAgentPolicy,
  missingAgentPolicyScopes,
  scopesAreCatalogOnly,
};
