const configStore = require('./configStore');
const axios = require('axios');
const scopeTopology = require('./scopeTopology');
const { getManagementToken } = require('./pingOneClientService');

/**
 * Scope audit reference table.
 *
 * Keys are the ACTUAL PingOne resource server display names (as seen in the
 * Management API response and in docs/PINGONE_CONFIG.md).
 *
 * scope-topology.json uses internal "Super Banking *" names; the provisioning
 * block maps those to the "Demo *" names used in PingOne.  Where a resource is
 * owned by the topology manifest we derive scopes from it; otherwise we pin them
 * explicitly so they stay in sync with docs/PINGONE_CONFIG.md.
 *
 * Source of truth: docs/PINGONE_CONFIG.md (Resource Scopes section).
 */
const SCOPE_REFERENCE_TABLE = {
  // Topology-managed resources — scopes derived from scope-topology.json
  'Demo API':          scopeTopology.resourceScopes('Super Banking API'),
  'Demo Agent Gateway': scopeTopology.resourceScopes('Super Banking Agent Gateway'),
  'Demo MCP Gateway':  scopeTopology.resourceScopes('Super Banking MCP Gateway'),
  'Demo MCP Server':   scopeTopology.resourceScopes('Super Banking MCP Server'),
};

/**
 * Compare current scopes against expected (order-independent set comparison).
 */
function compareScopes(current, expected) {
  const currentSet = new Set(current || []);
  const expectedSet = new Set(expected || []);

  if (currentSet.size === expectedSet.size && [...currentSet].every((s) => expectedSet.has(s))) {
    return { status: 'CORRECT', mismatches: null };
  }

  const missing = [...expectedSet].filter((s) => !currentSet.has(s));
  const extra   = [...currentSet].filter((s) => !expectedSet.has(s));

  if (missing.length > 0 || extra.length > 0) {
    return {
      status: 'MISMATCH',
      mismatches: {
        missing: missing.length > 0 ? missing : undefined,
        extra:   extra.length   > 0 ? extra   : undefined,
      },
    };
  }

  return { status: 'NEEDS_REVIEW', mismatches: null };
}

/**
 * Audit resource scopes:
 * - Fetches current scopes from PingOne for each validated resource
 * - Compares against expected values from SCOPE_REFERENCE_TABLE
 * - Returns CORRECT | MISMATCH | NEEDS_REVIEW status per resource
 *
 * @param {Array} validatedResources - output from resourceValidationService.validateResources()
 */
async function auditResourceScopes(validatedResources) {
  const envId  = configStore.getEffective('PINGONE_ENVIRONMENT_ID');
  const region = configStore.getEffective('PINGONE_REGION') || 'com';

  try {
    const token   = await getManagementToken();
    const apiBase = `https://api.pingone.${region}/v1/environments/${envId}`;

    const results = await Promise.all(
      validatedResources
        .filter((res) => res.status !== 'MISSING')
        .map(async (res) => {
          try {
            const { data: scopesData } = await axios.get(
              `${apiBase}/resource-servers/${res.resourceId}/scopes`,
              { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
            );

            const scopeList     = (scopesData.scopes || []).map((s) => s.name);
            const expectedScopes = SCOPE_REFERENCE_TABLE[res.name] || [];
            const scopeResult    = compareScopes(scopeList, expectedScopes);

            return {
              resourceId:     res.resourceId,
              name:           res.name,
              audience:       res.audience,
              currentScopes:  scopeList,
              expectedScopes,
              status:         scopeResult.status,
              mismatches:     scopeResult.mismatches,
            };
          } catch (error) {
            console.error(`[scopeAudit] Error auditing scopes for ${res.name}:`, error.message);
            return {
              resourceId:     res.resourceId,
              name:           res.name,
              audience:       res.audience,
              currentScopes:  [],
              expectedScopes: SCOPE_REFERENCE_TABLE[res.name] || [],
              status:         'ERROR',
              error:          error.message,
            };
          }
        })
    );

    return {
      status:     'success',
      auditedAt:  new Date().toISOString(),
      scopeAudit: results,
    };
  } catch (error) {
    console.error('[scopeAudit] Error auditing PingOne resource scopes:', error.message);
    return {
      status:     'error',
      error:      error.message,
      auditedAt:  new Date().toISOString(),
      scopeAudit: [],
    };
  }
}

module.exports = {
  auditResourceScopes,
  SCOPE_REFERENCE_TABLE,
};
