// banking_api_server/services/agentMcpScopePolicy.js
/**
 * Agent MCP scope policy — OAuth scopes allowed for RFC 8693 token exchange to banking_mcp_server.
 * Admins tune these on the Application Configuration page (`agent_mcp_allowed_scopes`).
 */
'use strict';

/** Scopes this demo understands for MCP banking tools (must match PingOne + MCP registry). */
const KNOWN_AGENT_MCP_SCOPES = [
  'banking:accounts:read',
  'banking:transactions:read',
  'banking:transactions:write',
  'ai_agent',
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
 * True when every scope required by the MCP tool is enabled in admin config.
 */
function isToolPermittedByAgentPolicy(toolRequiredScopes, allowedSet) {
  if (!toolRequiredScopes || toolRequiredScopes.length === 0) {
    return true;
  }
  return toolRequiredScopes.every((s) => allowedSet.has(s));
}

/**
 * Scopes the tool still needs but that are disabled in config.
 */
function missingAgentPolicyScopes(toolRequiredScopes, allowedSet) {
  if (!toolRequiredScopes || toolRequiredScopes.length === 0) {
    return [];
  }
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
