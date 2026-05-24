// RFC 8707: Scope-Audience Mapping
// Audience values match docs/PINGONE_CONFIG.md Resource Servers.

const configStore = require('./configStore');

// Called at validation time (not module load) so runtime config changes are reflected.
function buildAllowedScopesByAudience() {
  const mapping = {};

  // enduser.ping.demo — Demo API resource; end-user access token audience
  const endUserAudience = configStore.getEffective('enduser_audience');
  if (endUserAudience) {
    mapping[endUserAudience] = ['read', 'write', 'admin', 'sensitive', 'ai:agent'];
  }

  // agentgateway.ping.demo — Demo Agent Gateway; RFC 8693 Exchange #1 actor token audience
  const agentGatewayUri = configStore.getEffective('pingone_resource_agent_gateway_uri');
  if (agentGatewayUri) {
    mapping[agentGatewayUri] = ['ai:agent', 'ai_agent'];
  }

  // mcpgateway.ping.demo — Demo MCP Gateway; canonical single subject+actor RFC 8693 exchange audience
  const mcpGatewayUri = configStore.getEffective('pingone_resource_mcp_gateway_uri');
  if (mcpGatewayUri) {
    mapping[mcpGatewayUri] = ['read', 'write', 'mcp:invoke', 'ai:agent'];
  }

  // mcpserver.ping.demo — Demo MCP Server; gateway re-exchanges to this audience downstream
  const mcpServerUri = configStore.getEffective('pingone_resource_mcp_server_uri');
  if (mcpServerUri) {
    mapping[mcpServerUri] = ['read', 'write', 'mcp:invoke'];
  }

  return mapping;
}

/**
 * @returns {{ valid: true, scopes: string[], narrowed: boolean }}
 * @throws {Error} for empty scopes or no matching scopes for audience
 */
function validateScopeAudience(scopes, audience) {
  if (!scopes || scopes.length === 0) {
    throw new Error(`SCOPE_ERROR: No scopes provided for audience ${audience}`);
  }

  const ALLOWED_SCOPES_BY_AUDIENCE = buildAllowedScopesByAudience();
  const allowedForAudience = ALLOWED_SCOPES_BY_AUDIENCE[audience];
  if (!allowedForAudience) {
    return {
      valid: true,
      scopes,
      narrowed: false,
      note: `Unknown audience (not in ALLOWED_SCOPES_BY_AUDIENCE mapping): ${audience}`,
    };
  }

  const allowedSet = new Set(allowedForAudience);
  const validScopes = scopes.filter(s => allowedSet.has(s));

  if (validScopes.length === 0) {
    throw new Error(
      `SCOPE_MISMATCH: User scopes [${scopes.join(', ')}] ` +
      `do not match allowed scopes for ${audience} ` +
      `[${allowedForAudience.join(', ')}]`
    );
  }

  return { valid: true, scopes: validScopes, narrowed: validScopes.length < scopes.length };
}

module.exports = { buildAllowedScopesByAudience, validateScopeAudience };
