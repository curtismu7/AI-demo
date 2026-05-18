// PingOne OAuth Configuration — End-user client
// Authorization Code + PKCE flow for banking customers
//
// All values are read lazily via configStore getters so that updates made
// through the Config UI take effect without a server restart.

'use strict';
const configStore = require('../services/configStore');
const { getScopesForUserType, BANKING_SCOPES, COMPOUND_SCOPES } = require('./scopes');
const endpointResolver = require('../services/oauthEndpointResolver');

const config = {
  get environmentId()         { return configStore.getEffective('pingone_environment_id'); },
  get _region()               { return configStore.getEffective('pingone_region') || 'com'; },
  // _base kept for backward compatibility
  get _base()                 { return `https://auth.pingone.${this._region}/${this.environmentId}/as`; },

  // OAuth2 endpoints — resolved via endpointResolver (explicit config > PingOne fallback)
  get authorizationEndpoint() { return endpointResolver.getAuthorizationEndpoint(); },
  get tokenEndpoint()         { return endpointResolver.getTokenEndpoint(); },
  get userInfoEndpoint()      { return endpointResolver.getUserInfoEndpoint(); },
  get jwksEndpoint()          { return endpointResolver.getJwksUri(); },
  get issuer()                { return endpointResolver.getIssuer(); },

  // End-user Web application client
  get clientId()              { return configStore.getEffective('user_client_id'); },
  get clientSecret()          { return configStore.getEffective('user_client_secret'); },
  get redirectUri()           { return configStore.getEffective('user_redirect_uri'); },

  /**
   * OIDC + banking API scopes for authorize. Must yield ≥5 distinct scopes on the access token
   * so RFC 8693 MCP exchange can narrow audience and scopes (see MIN_USER_SCOPES_FOR_MCP_EXCHANGE).
   *
   * When ff_oidc_only_authorize is ON, only OIDC scopes are requested to avoid PingOne
   * "May not request scopes for multiple resources" when banking:* lives on a Resource Server.
   */
  get scopes() {
    const oidcOnly =
      configStore.getEffective('ff_oidc_only_authorize') === true ||
      configStore.getEffective('ff_oidc_only_authorize') === 'true';
    const base = ['openid', 'profile', 'email', 'offline_access'];
    if (oidcOnly) return base;
    // When a custom resource audience is configured the banking:* scopes all live on the
    // same resource server (enduserAudience), so PingOne will not reject with
    // "May not request scopes for multiple resources".
    const enduserAudience = process.env.ENDUSER_AUDIENCE;
    if (enduserAudience) {
      // All banking scopes are on the same resource server (enduserAudience),
      // so PingOne will not reject with "May not request scopes for multiple resources".
      // banking:mortgage:read (Phase 267 Path A) is provisioned on this same
      // resource server ("Super Banking API" / banking_api_enduser), so
      // requesting it here stays single-resource and unblocks show_mortgage's
      // RFC 8693 exchange.
      return ['openid', 'profile', 'email', 'offline_access', 'banking:read', 'banking:write', BANKING_SCOPES.AI_AGENT, COMPOUND_SCOPES.MORTGAGE_READ];
    }
    const role = configStore.getEffective('user_role') || 'customer';
    const banking = getScopesForUserType(role);
    return [...new Set([...base, ...banking])];
  },

  /** Same as admin oauth.js — opt-in pi.flow authorize for supported PingOne apps. */
  get authorizeUsesPiFlow() {
    const v = configStore.getEffective('user_pingone_authorize_pi_flow');
    return String(v).toLowerCase() === 'true' || v === '1';
  },

  get sessionSecret()         { return configStore.getEffective('session_secret'); },
  get userRole()              { return configStore.getEffective('user_role') || 'customer'; },
};

module.exports = config;

