'use strict';

const axios = require('axios');
const configStore = require('./configStore');

/**
 * Scope reference: Expected scopes for each resource
 * Source: docs/PINGONE_MAY_ACT_SETUP.md
 */
const SCOPE_REFERENCE_TABLE = {
  'Super Banking AI Agent': ['banking:agent:invoke'],
  'Super Banking MCP Server': ['banking:accounts:read', 'banking:transactions:read', 'banking:transactions:write'],
  'Super Banking Agent Gateway': [],
  'Super Banking Banking API': ['banking:accounts:read', 'banking:transactions:read', 'banking:transactions:write'],
  'PingOne API': ['p1:read:user', 'p1:update:user'],
};

/**
 * Get PingOne Management API token
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
 * Compare current scopes against expected
 */
function compareScopes(current, expected) {
  const currentSet = new Set(current || []);
  const expectedSet = new Set(expected || []);

  // Exact match check (order-independent)
  if (currentSet.size === expectedSet.size && [...currentSet].every((s) => expectedSet.has(s))) {
    return { status: 'CORRECT', mismatches: null };
  }

  // Check for mismatches
  const missing = [...expectedSet].filter((s) => !currentSet.has(s));
  const extra = [...currentSet].filter((s) => !expectedSet.has(s));

  if (missing.length > 0 || extra.length > 0) {
    return {
      status: 'MISMATCH',
      mismatches: { missing: missing.length > 0 ? missing : undefined, extra: extra.length > 0 ? extra : undefined },
    };
  }

  return { status: 'NEEDS_REVIEW', mismatches: null };
}

/**
 * Audit resource scopes:
 * - Fetches current scopes from PingOne
 * - Compares against expected values
 * - Returns CORRECT | MISMATCH | NEEDS_REVIEW status
 */
async function auditResourceScopes(validatedResources) {
  const envId = configStore.getEffective('pingone_environment_id');
  const region = configStore.getEffective('pingone_region') || 'com';

  try {
    const token = await getManagementToken();
    const apiBase = `https://api.pingone.${region}/v1/environments/${envId}`;

    const results = await Promise.all(
      validatedResources
        // Skip MISSING resources
        .filter((res) => res.status !== 'MISSING')
        .map(async (res) => {
          try {
            // Fetch scopes for this resource
            const scopesUrl = `${apiBase}/resource-servers/${res.resourceId}/scopes`;
            const { data: scopesData } = await axios.get(scopesUrl, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 10000,
            });

            const scopeList = (scopesData.scopes || []).map((s) => s.name);
            const expectedScopes = SCOPE_REFERENCE_TABLE[res.name] || [];

            const scopeResult = compareScopes(scopeList, expectedScopes);

            return {
              resourceId: res.resourceId,
              name: res.name,
              audience: res.audience,
              currentScopes: scopeList,
              expectedScopes,
              status: scopeResult.status,
              mismatches: scopeResult.mismatches,
            };
          } catch (error) {
            console.error(`Error auditing scopes for ${res.name}:`, error.message);
            return {
              resourceId: res.resourceId,
              name: res.name,
              audience: res.audience,
              currentScopes: [],
              expectedScopes: SCOPE_REFERENCE_TABLE[res.name] || [],
              status: 'ERROR',
              error: error.message,
            };
          }
        })
    );

    return {
      status: 'success',
      auditedAt: new Date().toISOString(),
      scopeAudit: results,
    };
  } catch (error) {
    console.error('Error auditing PingOne resource scopes:', error.message);
    return {
      status: 'error',
      error: error.message,
      auditedAt: new Date().toISOString(),
      scopeAudit: [],
    };
  }
}

module.exports = {
  auditResourceScopes,
  SCOPE_REFERENCE_TABLE,
};
