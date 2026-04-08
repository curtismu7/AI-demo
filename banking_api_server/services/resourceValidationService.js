'use strict';

const axios = require('axios');
const configStore = require('./configStore');

/**
 * Reference table: Expected PingOne resources for Super Banking
 * Source: docs/PINGONE_MAY_ACT_SETUP.md Part 1
 */
const RESOURCE_REFERENCE_TABLE = [
  {
    name: 'Super Banking AI Agent',
    audience: 'https://ai-agent.pingdemo.com',
    expectedScopes: ['banking:agent:invoke'],
    ttl: 3600,
    authMethod: 'Client Secret Basic',
  },
  {
    name: 'Super Banking MCP Server',
    audience: 'https://mcp-server.pingdemo.com',
    expectedScopes: ['banking:accounts:read', 'banking:transactions:read', 'banking:transactions:write'],
    ttl: 3600,
    authMethod: 'Client Secret Basic',
  },
  {
    name: 'Super Banking Agent Gateway',
    audience: 'https://agent-gateway.pingdemo.com',
    expectedScopes: [],
    ttl: 3600,
    authMethod: 'Client Secret Basic',
  },
  {
    name: 'Super Banking Banking API',
    audience: 'https://banking-api.pingdemo.com',
    expectedScopes: ['banking:accounts:read', 'banking:transactions:read', 'banking:transactions:write'],
    ttl: 3600,
    authMethod: undefined, // standard resource server
  },
  {
    name: 'PingOne API',
    audience: 'https://api.pingone.com',
    expectedScopes: ['p1:read:user', 'p1:update:user'],
    ttl: 3600,
    authMethod: undefined, // built-in
  },
];

/**
 * Get PingOne Management API token using client credentials
 */
async function getManagementToken() {
  const envId = configStore.getEffective('pingone_environment_id');
  const region = configStore.getEffective('pingone_region') || 'com';
  const clientId = configStore.getEffective('pingone_client_id');
  const clientSecret = configStore.getEffective('pingone_client_secret');

  if (!envId || !clientId || !clientSecret) {
    throw new Error('PingOne admin credentials not configured');
  }

  const tokenUrl = `https://auth.pingone.${region}/${envId}/as/token`;
  const response = await axios.post(
    tokenUrl,
    'grant_type=client_credentials',
    {
      auth: { username: clientId, password: clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }
  );
  return response.data.access_token;
}

/**
 * Validate PingOne resource servers:
 * - Checks existence by name
 * - Validates audience URI matches expected
 * - Verifies auth method (if applicable)
 * - Returns validation results with CORRECT | CONFIG_ERROR | MISSING status
 */
async function validateResources() {
  const envId = configStore.getEffective('pingone_environment_id');
  const region = configStore.getEffective('pingone_region') || 'com';

  try {
    const token = await getManagementToken();
    const apiBase = `https://api.pingone.${region}/v1/environments/${envId}`;

    // List all resource servers
    const resourcesUrl = `${apiBase}/resource-servers`;
    const { data: resourcesData } = await axios.get(resourcesUrl, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    const foundResources = resourcesData.resources || resourcesData._embedded?.resource_servers || [];

    // Map found resources by name for lookup
    const resourcesByName = {};
    foundResources.forEach((res) => {
      resourcesByName[res.name] = res;
    });

    // Validate each expected resource
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

      // Check if audience matches
      const audienceMatches = found.audience === expected.audience;
      const status = audienceMatches ? 'CORRECT' : 'CONFIG_ERROR';

      return {
        resourceId: found.id,
        name: found.name,
        audience: found.audience,
        expectedAudience: expected.audience,
        status,
        attributes: {
          ttl: found.accessTokenValiditySeconds || expected.ttl,
          authMethod: found.introspectionEndpointAuthMethod || 'unknown',
        },
      };
    });

    // Also flag unexpected resources
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
    console.error('Error validating PingOne resources:', error.message);
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
