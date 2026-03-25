// PingOne OAuth Configuration — End-user client
// Authorization Code + PKCE flow for banking customers
//
// All values are read lazily via configStore getters so that updates made
// through the Config UI take effect without a server restart.

'use strict';
const configStore = require('../services/configStore');

const config = {
  get environmentId()         { return configStore.getEffective('pingone_environment_id'); },
  get _region()               { return configStore.getEffective('pingone_region') || 'com'; },
  get _base()                 { return `https://auth.pingone.${this._region}/${this.environmentId}/as`; },

  // OAuth2 endpoints (same AS, different client)
  get authorizationEndpoint() { return `${this._base}/authorize`; },
  get tokenEndpoint()         { return `${this._base}/token`; },
  get userInfoEndpoint()      { return `${this._base}/userinfo`; },
  get jwksEndpoint()          { return `${this._base}/jwks`; },
  get issuer()                { return this._base; },

  // End-user Web application client
  get clientId()              { return configStore.getEffective('user_client_id'); },
  get clientSecret()          { return configStore.getEffective('user_client_secret'); },
  get redirectUri()           { return configStore.getEffective('user_redirect_uri'); },

  // offline_access: PingOne issues a refresh_token (RFC 6749 §6) — required for BFF auto-refresh and /api/auth/oauth/user/refresh
  scopes: ['openid', 'profile', 'email', 'offline_access'],

  get sessionSecret()         { return configStore.getEffective('session_secret'); },
  get userRole()              { return configStore.getEffective('user_role') || 'customer'; },
};

module.exports = config;

