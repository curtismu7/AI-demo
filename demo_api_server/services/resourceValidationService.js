const axios = require('axios');
const configStore = require('./configStore');
const { getManagementToken } = require('./pingOneClientService');

/**
 * Reference table: expected PingOne resource servers for this demo.
 * Source of truth: docs/PINGONE_CONFIG.md (Resource Servers section).
 *
 * audience values MUST match the resource server's "audience" field in PingOne exactly.
 * These are plain strings, NOT URLs (e.g. "enduser.ping.demo", not "https://...").
 */
const RESOURCE_REFERENCE_TABLE = [
  {
    name: 'Demo API',
    audience: 'enduser.ping.demo',
    expectedScopes: [
      'read', 'write', 'transfer', 'mortgage:read',
      'accounts:read', 'transactions:read', 'ai_agent',
      'ai:agent:read', 'users:read', 'users:manage',
      'admin:read', 'admin:write', 'admin:delete',
    ],
  },
  {
    name: 'Demo Agent Gateway',
    audience: 'agentgateway.ping.demo',
    expectedScopes: ['agent:invoke', 'banking:agent:invoke'],
  },
  {
    name: 'Demo MCP Gateway',
    audience: 'mcpgateway.ping.demo',
    expectedScopes: ['read', 'write', 'transfer', 'mortgage:read', 'mcp:invoke'],
  },
  {
    name: 'Demo MCP Server',
    audience: 'mcpserver.ping.demo',
    expectedScopes: [
      'read', 'write', 'mortgage:read', 'mcp:invoke',
      'banking:read', 'banking:write', 'banking:mcp:invoke', 'banking:mortgage:read',
      'ai:agent:read', 'banking:ai:agent:read',
      'users:read', 'users:manage', 'admin:read', 'admin:write', 'admin:delete',
    ],
  },
];

/**
 * Validate PingOne resource servers:
 * - Checks existence by name
 * - Validates audience URI matches expected
 * - Returns validation results with CORRECT | CONFIG_ERROR | MISSING status
 *
 * Unexpected resources (present in PingOne but not in the reference table) are
 * flagged as UNEXPECTED — this is informational, not an error.
 */
async function validateResources() {
  const envId = configStore.getEffective('PINGONE_ENVIRONMENT_ID');
  const region = configStore.getEffective('PINGONE_REGION') || 'com';

  try {
    const token = await getManagementToken();
    const apiBase = `https://api.pingone.${region}/v1/environments/${envId}`;

    const { data: resourcesData } = await axios.get(`${apiBase}/resource-servers`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    const foundResources = resourcesData.resources || resourcesData._embedded?.resource_servers || [];

    const resourcesByName = {};
    foundResources.forEach((res) => {
      resourcesByName[res.name] = res;
    });

    const results = RESOURCE_REFERENCE_TABLE.map((expected) => {
      const found = resourcesByName[expected.name];

      if (!found) {
        return {
          resourceId: null,
          name: expected.name,
          audience: null,
          expectedAudience: expected.audience,
          status: 'MISSING',
          attributes: null,
        };
      }

      const audienceMatches = found.audience === expected.audience;

      return {
        resourceId: found.id,
        name: found.name,
        audience: found.audience,
        expectedAudience: expected.audience,
        status: audienceMatches ? 'CORRECT' : 'CONFIG_ERROR',
        attributes: {
          ttl: found.accessTokenValiditySeconds,
          authMethod: found.introspectionEndpointAuthMethod || 'unknown',
        },
      };
    });

    // Flag resources that exist in PingOne but are not in the reference table
    const expectedNames = new Set(RESOURCE_REFERENCE_TABLE.map((r) => r.name));
    foundResources.forEach((res) => {
      if (!expectedNames.has(res.name)) {
        results.push({
          resourceId: res.id,
          name: res.name,
          audience: res.audience,
          expectedAudience: null,
          status: 'UNEXPECTED',
          attributes: {
            ttl: res.accessTokenValiditySeconds,
            authMethod: res.introspectionEndpointAuthMethod || 'unknown',
          },
        });
      }
    });

    return {
      status: 'success',
      auditedAt: new Date().toISOString(),
      resourceValidation: results,
    };
  } catch (error) {
    console.error('[resourceValidation] Error validating PingOne resources:', error.message);
    return {
      status: 'error',
      error: error.message,
      auditedAt: new Date().toISOString(),
      resourceValidation: [],
    };
  }
}

module.exports = {
  validateResources,
  RESOURCE_REFERENCE_TABLE,
};
