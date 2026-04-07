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
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const configStore = require('./configStore');

// ── Internal: build a client_assertion JWT (client_secret_jwt or private_key_jwt) ──
function buildClientAssertion(clientId, tokenUrl, authMethod, clientSecret, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientId,
    sub: clientId,
    aud: tokenUrl,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 300,
  };
  if (authMethod === 'client_secret_jwt') {
    return jwt.sign(payload, clientSecret, { algorithm: 'HS256' });
  }
  // private_key_jwt — RS256 or ES256 depending on key type
  const keyObj = crypto.createPrivateKey(privateKeyPem);
  const alg = keyObj.asymmetricKeyType === 'ec' ? 'ES256' : 'RS256';
  return jwt.sign(payload, privateKeyPem, { algorithm: alg });
}

// ── Internal: obtain a Management-API access token ────────────────────────────
async function getManagementToken() {
  const envId   = configStore.getEffective('PINGONE_ENVIRONMENT_ID');
  const region  = configStore.getEffective('PINGONE_REGION') || 'com';
  // Prefer dedicated management worker credentials; fall back to shared PINGONE_MANAGEMENT_CLIENT_ID/secret.
  const clientId     = configStore.getEffective('PINGONE_MGMT_CLIENT_ID') || configStore.getEffective('PINGONE_MANAGEMENT_CLIENT_ID');
  const clientSecret = configStore.getEffective('PINGONE_MGMT_CLIENT_SECRET') || configStore.getEffective('PINGONE_MANAGEMENT_CLIENT_SECRET');
  const authMethod   = (configStore.getEffective('pingone_mgmt_token_auth_method') || 'basic').toLowerCase();

  const needsSecret = authMethod !== 'none' && authMethod !== 'private_key_jwt';
  if (!envId || !clientId || (needsSecret && !clientSecret)) {
    throw new Error('PingOne management worker credentials not configured. Set pingone_mgmt_client_id + pingone_mgmt_client_secret (or pingone_client_id + pingone_client_secret) via the Worker App tab at /config.');
  }

  const tokenUrl = `https://auth.pingone.${region}/${envId}/as/token`;

  let body = 'grant_type=client_credentials';
  const axiosConfig = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };

  if (authMethod === 'none') {
    body += `&client_id=${encodeURIComponent(clientId)}`;
  } else if (authMethod === 'post') {
    body += `&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  } else if (authMethod === 'client_secret_jwt' || authMethod === 'private_key_jwt') {
    const privateKeyPem = authMethod === 'private_key_jwt'
      ? configStore.getEffective('pingone_mgmt_private_key')
      : null;
    if (authMethod === 'private_key_jwt' && !privateKeyPem) {
      throw new Error('private_key_jwt selected but no private key configured. Generate or paste a PEM key in the Worker App config tab.');
    }
    const assertion = buildClientAssertion(clientId, tokenUrl, authMethod, clientSecret, privateKeyPem);
    body += `&client_id=${encodeURIComponent(clientId)}&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer&client_assertion=${encodeURIComponent(assertion)}`;
  } else {
    // default: basic
    axiosConfig.auth = { username: clientId, password: clientSecret };
  }

  const response = await axios.post(tokenUrl, body, axiosConfig);
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
  const envId  = configStore.getEffective('PINGONE_ENVIRONMENT_ID');
  const region = configStore.getEffective('PINGONE_REGION') || 'com';
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
  const envId  = configStore.getEffective('PINGONE_ENVIRONMENT_ID');
  const region = configStore.getEffective('PINGONE_REGION') || 'com';
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
