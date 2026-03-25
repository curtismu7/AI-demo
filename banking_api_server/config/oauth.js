// PingOne OAuth Configuration — Admin client
// Authorization Code flow for admin/staff users
//
// All values are read lazily via configStore getters so that updates made
// through the Config UI take effect without a server restart.

'use strict';
const configStore = require('../services/configStore');

const config = {
  get environmentId()          { return configStore.getEffective('pingone_environment_id'); },
  get _region()                { return configStore.getEffective('pingone_region') || 'com'; },
  get _base()                  { return `https://auth.pingone.${this._region}/${this.environmentId}/as`; },

  // OAuth2 endpoints (computed from environment + region)
  get authorizationEndpoint()  { return `${this._base}/authorize`; },
  get tokenEndpoint()          { return `${this._base}/token`; },
  get userInfoEndpoint()       { return `${this._base}/userinfo`; },
  get jwksEndpoint()           { return `${this._base}/jwks`; },
  get issuer()                 { return this._base; },

  // Admin OAuth2 client
  get clientId()               { return configStore.getEffective('admin_client_id'); },
  get clientSecret()           { return configStore.getEffective('admin_client_secret'); },
  get redirectUri()            { return configStore.getEffective('admin_redirect_uri'); },

  // CIBA — Client-Initiated Backchannel Authentication
  get cibaEndpoint()           { return `${this._base}/bc-authorize`; },

  // offline_access: PingOne issues refresh_token for silent session renewal (admin + user flows)
  scopes: ['openid', 'profile', 'email', 'offline_access'],

  /**
   * When true, /authorize uses response_type=pi.flow and response_mode=pi.flow (PingOne non-redirect / DaVinci).
   * Requires a PingOne app configured for this mode; otherwise leave false (default authorization code + query).
   */
  get authorizeUsesPiFlow() {
    const v = configStore.getEffective('admin_pingone_authorize_pi_flow');
    return String(v).toLowerCase() === 'true' || v === '1';
  },

  get sessionSecret()          { return configStore.getEffective('session_secret'); },
  get adminRole()              { return configStore.getEffective('admin_role') || 'admin'; },
};

module.exports = config;

