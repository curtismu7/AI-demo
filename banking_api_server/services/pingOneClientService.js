/**
 * pingOneClientService.js
 *
 * Calls the PingOne Management API to create / list OAuth applications.
 * Uses a client_credentials grant with the admin (worker) client so that
 * Management-API tokens are obtained server-side and never exposed to the UI.
 *
 * Trust boundary (PingOne egress):
 * - Browser → this BFF only (/api/* with session or Bearer). The SPA does not call api.pingone or auth.pingone.
 * - Human OAuth (authorize, token, JWKS) runs in routes/oauth*.js and config/oauth*.js — must stay on the BFF.
 * - banking_mcp_server calls PingOne for token introspection / CIBA for MCP tools, then calls this API for data.
 *   Banking tools are not intended to re-implement full Management API; keep worker credentials on the BFF.
 */
const axios = require('axios');
const configStore = require('./configStore');

// ── Internal: obtain a Management-API access token ────────────────────────────
async function getManagementToken() {
  const envId   = configStore.getEffective('pingone_environment_id');
  const region  = configStore.getEffective('pingone_region') || 'com';
  // Prefer dedicated management worker credentials; fall back to shared pingone_client_id/secret.
  const clientId     = configStore.getEffective('pingone_mgmt_client_id') || configStore.getEffective('pingone_client_id');
  const clientSecret = configStore.getEffective('pingone_mgmt_client_secret') || configStore.getEffective('pingone_client_secret');

  if (!envId || !clientId || !clientSecret) {
    throw new Error('PingOne management worker credentials not configured. Set pingone_mgmt_client_id + pingone_mgmt_client_secret (or pingone_client_id + pingone_client_secret) via the Worker App tab at /config.');
  }

  const tokenUrl = `https://auth.pingone.${region}/${envId}/as/token`;
  const response = await axios.post(
    tokenUrl,
    'grant_type=client_credentials',
    {
      auth: { username: clientId, password: clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  return response.data.access_token;
}

// ── Map CIMD/OIDC grant_types to PingOne enum values ─────────────────────────
function mapGrantTypes(grantTypes) {
  const map = {
    authorization_code: 'AUTHORIZATION_CODE',
    implicit:           'IMPLICIT',
    client_credentials: 'CLIENT_CREDENTIALS',
    refresh_token:      'REFRESH_TOKEN',
    'urn:openid:params:grant-type:ciba': 'CIBA',
  };
  return (grantTypes || ['authorization_code']).map(g => map[g] || g.toUpperCase().replace(/-/g, '_'));
}

// ── Map application_type to PingOne type ─────────────────────────────────────
function mapAppType(applicationType) {
  if (applicationType === 'native') return 'NATIVE_APP';
  if (applicationType === 'service') return 'WORKER';
  return 'WEB_APP'; // default: "web" or anything else
}

// ── Map token_endpoint_auth_method ───────────────────────────────────────────
function mapTokenAuthMethod(method) {
  if (method === 'none') return 'NONE';
  if (method === 'client_secret_post') return 'CLIENT_SECRET_POST';
  return 'CLIENT_SECRET_BASIC'; // default
}

/**
 * Create a new OAuth/OIDC application in PingOne via the Management API.
 *
 * @param {object} metadata  Client metadata (CIMD / RFC 7591 field names)
 * @returns {object}  PingOne application object including id, clientId, clientSecret
 */
async function createApplication(metadata) {
  const envId  = configStore.getEffective('pingone_environment_id');
  const region = configStore.getEffective('pingone_region') || 'com';
  const token  = await getManagementToken();

  const grantTypes   = mapGrantTypes(metadata.grant_types);
  const responseTypes = (metadata.response_types || ['code']).map(r => r.toUpperCase());

  const appPayload = {
    name:        metadata.client_name || 'CIMD Registered Client',
    description: metadata.client_description || 'Created via Client ID Metadata Document interface',
    enabled:     true,
    type:        mapAppType(metadata.application_type),
    protocol:    'OPENID_CONNECT',
    grantTypes,
    responseTypes,
    redirectUris:              metadata.redirect_uris              || [],
    postLogoutRedirectUris:    metadata.post_logout_redirect_uris  || [],
    tokenEndpointAuthMethod:   mapTokenAuthMethod(metadata.token_endpoint_auth_method),
    pkceEnforcement:           'OPTIONAL',
    refreshTokenDuration:      metadata.grant_types?.includes('refresh_token') ? 86400 : undefined,
  };

  // Remove undefined values to avoid PingOne validation errors
  Object.keys(appPayload).forEach(k => appPayload[k] === undefined && delete appPayload[k]);

  const url = `https://api.pingone.${region}/v1/environments/${envId}/applications`;
  const response = await axios.post(url, appPayload, {
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const app = response.data;

  // Fetch client secret separately (PingOne stores it under /secret sub-resource)
  let clientSecret = null;
  if (mapTokenAuthMethod(metadata.token_endpoint_auth_method) !== 'NONE') {
    try {
      const secretUrl = `https://api.pingone.${region}/v1/environments/${envId}/applications/${app.id}/secret`;
      const secretResp = await axios.get(secretUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      clientSecret = secretResp.data.secret;
    } catch (err) {
      // Non-fatal – secret may not be available for all app types
      console.warn('[pingOneClientService] Could not fetch client secret:', err.message);
    }
  }

  return { ...app, clientSecret };
}

/**
 * Raw OIDC application objects from PingOne (for bootstrap idempotency / matching by name).
 * @returns {Promise<object[]>}
 */
async function listOidcApplicationsRaw() {
  const envId  = configStore.getEffective('pingone_environment_id');
  const region = configStore.getEffective('pingone_region') || 'com';
  const token  = await getManagementToken();

  const url = `https://api.pingone.${region}/v1/environments/${envId}/applications?filter=protocol%20eq%20%22OPENID_CONNECT%22`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000,
  });

  return response.data?._embedded?.applications || [];
}

/**
 * List all OIDC applications in the PingOne environment.
 * Returns a summarised array (id, name, type, enabled, createdAt).
 */
async function listApplications() {
  const items = await listOidcApplicationsRaw();
  return items.map(a => ({
    id:        a.id,
    name:      a.name,
    type:      a.type,
    enabled:   a.enabled,
    createdAt: a.createdAt,
    protocol:  a.protocol,
  }));
}

module.exports = { createApplication, listApplications, listOidcApplicationsRaw, getManagementToken };
