const axios = require('axios');
const configStore = require('./configStore');
const { getManagementToken } = require('./pingOneClientService');

function getBaseUrl() {
  const region = configStore.getEffective('pingone_region') || 'com';
  const envId = configStore.getEffective('pingone_environment_id');
  if (!envId) throw new Error('pingone_environment_id not configured');
  return `https://api.pingone.${region}/v1/environments/${envId}`;
}

/**
 * Get PingOne application configuration by app ID.
 */
async function getAppConfig(appId) {
  const token = await getManagementToken();
  const baseUrl = getBaseUrl();
  const res = await axios.get(`${baseUrl}/applications/${appId}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  return res.data;
}

/**
 * Update PingOne application configuration (PUT — full replace).
 */
async function updateAppConfig(appId, config) {
  const token = await getManagementToken();
  const baseUrl = getBaseUrl();
  const res = await axios.put(`${baseUrl}/applications/${appId}`, config, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 15000
  });
  return res.data;
}

/**
 * Fix logout URLs on a PingOne application.
 * Adds postLogoutRedirectUris so RP-initiated logout works.
 */
async function fixLogoutUrls(appId, publicAppUrl) {
  const current = await getAppConfig(appId);
  const url = publicAppUrl || configStore.getEffective('public_app_url') || 'http://localhost:3000';

  const logoutUrls = [
    url,
    `${url}/login`,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4000'
  ];
  // Deduplicate
  const uniqueUrls = [...new Set(logoutUrls)];

  const before = {
    postLogoutRedirectUris: current.postLogoutRedirectUris || [],
    signOffUrl: current.signOffUrl || null
  };

  // Merge — keep existing, add missing
  const existing = new Set(current.postLogoutRedirectUris || []);
  for (const u of uniqueUrls) existing.add(u);

  const updated = { ...current, postLogoutRedirectUris: [...existing] };
  // signOffUrl is a single string in PingOne — set to primary
  if (!current.signOffUrl) {
    updated.signOffUrl = url;
  }

  const after = await updateAppConfig(appId, updated);

  return {
    appId,
    appName: current.name,
    before,
    after: {
      postLogoutRedirectUris: after.postLogoutRedirectUris || [],
      signOffUrl: after.signOffUrl || null
    },
    changed: true
  };
}

/**
 * Audit a PingOne app for common configuration issues.
 */
async function auditAppConfig(appId) {
  const config = await getAppConfig(appId);
  const issues = [];
  const passes = [];

  // Check logout URLs
  if (!config.postLogoutRedirectUris || config.postLogoutRedirectUris.length === 0) {
    issues.push({ check: 'postLogoutRedirectUris', severity: 'error', message: 'No logout redirect URIs configured — logout will fail silently' });
  } else {
    passes.push({ check: 'postLogoutRedirectUris', message: `${config.postLogoutRedirectUris.length} logout URIs configured` });
  }

  // Check redirect URIs
  if (!config.redirectUris || config.redirectUris.length === 0) {
    issues.push({ check: 'redirectUris', severity: 'error', message: 'No redirect URIs configured' });
  } else {
    const hasLocalhost = config.redirectUris.some(u => u.includes('localhost'));
    if (!hasLocalhost) {
      issues.push({ check: 'redirectUris', severity: 'warning', message: 'No localhost redirect URIs — local development will fail' });
    } else {
      passes.push({ check: 'redirectUris', message: `${config.redirectUris.length} redirect URIs configured (includes localhost)` });
    }
  }

  // Check PKCE
  if (config.pkceEnforcement !== 'S256_REQUIRED') {
    issues.push({ check: 'pkce', severity: 'warning', message: `PKCE enforcement is "${config.pkceEnforcement || 'not set'}" — should be S256_REQUIRED` });
  } else {
    passes.push({ check: 'pkce', message: 'PKCE S256 required ✓' });
  }

  // Check grant types
  if (config.grantTypes && !config.grantTypes.includes('AUTHORIZATION_CODE')) {
    issues.push({ check: 'grantTypes', severity: 'error', message: 'AUTHORIZATION_CODE grant not enabled' });
  } else {
    passes.push({ check: 'grantTypes', message: 'AUTHORIZATION_CODE grant enabled ✓' });
  }

  // Check token endpoint auth method
  if (config.tokenEndpointAuthMethod === 'NONE') {
    issues.push({ check: 'tokenEndpointAuth', severity: 'warning', message: 'Token endpoint auth is NONE — should use CLIENT_SECRET_BASIC' });
  } else {
    passes.push({ check: 'tokenEndpointAuth', message: `Token endpoint auth: ${config.tokenEndpointAuthMethod || 'default'} ✓` });
  }

  return {
    appId,
    appName: config.name,
    appType: config.type,
    enabled: config.enabled,
    issues,
    passes,
    issueCount: issues.length,
    passCount: passes.length,
    healthy: issues.filter(i => i.severity === 'error').length === 0
  };
}

module.exports = {
  getAppConfig,
  updateAppConfig,
  fixLogoutUrls,
  auditAppConfig
};
