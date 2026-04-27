'use strict';
const configStore = require('./configStore');

/**
 * Resolves OAuth endpoints using priority:
 * 1. Explicit configStore value (supports any IDP via OAUTH_* env vars or Config UI)
 * 2. PingOne pattern computed from environment_id + region
 * 3. Empty string (not configured)
 */

function _pingOneBase() {
  const region = configStore.getEffective('pingone_region') || 'com';
  const envId  = configStore.getEffective('pingone_environment_id');
  if (!envId) return '';
  return `https://auth.pingone.${region}/${envId}/as`;
}

function getAuthorizationEndpoint() {
  const explicit = configStore.getEffective('oauth_authorization_endpoint');
  if (explicit) return explicit;
  const base = _pingOneBase();
  return base ? `${base}/authorize` : '';
}

function getTokenEndpoint() {
  const explicit = configStore.getEffective('oauth_token_endpoint');
  if (explicit) return explicit;
  const base = _pingOneBase();
  return base ? `${base}/token` : '';
}

function getUserInfoEndpoint() {
  const explicit = configStore.getEffective('oauth_userinfo_endpoint');
  if (explicit) return explicit;
  const base = _pingOneBase();
  return base ? `${base}/userinfo` : '';
}

function getJwksUri() {
  const explicit = configStore.getEffective('oauth_jwks_uri');
  if (explicit) return explicit;
  const base = _pingOneBase();
  return base ? `${base}/jwks` : '';
}

function getIssuer() {
  const explicit = configStore.getEffective('oauth_issuer');
  if (explicit) return explicit;
  return _pingOneBase();
}

function getDiscoveryEndpoint() {
  const explicit = configStore.getEffective('oauth_discovery_endpoint');
  if (explicit) return explicit;
  const region = configStore.getEffective('pingone_region') || 'com';
  const envId  = configStore.getEffective('pingone_environment_id');
  if (!envId) return '';
  return `https://auth.pingone.${region}/${envId}/as/.well-known/openid-configuration`;
}

function getOAuthEndpoints() {
  return {
    authorization_endpoint: getAuthorizationEndpoint(),
    token_endpoint:         getTokenEndpoint(),
    userinfo_endpoint:      getUserInfoEndpoint(),
    jwks_uri:               getJwksUri(),
    issuer:                 getIssuer(),
    discovery_endpoint:     getDiscoveryEndpoint(),
  };
}

module.exports = {
  getAuthorizationEndpoint,
  getTokenEndpoint,
  getUserInfoEndpoint,
  getJwksUri,
  getIssuer,
  getDiscoveryEndpoint,
  getOAuthEndpoints,
};
