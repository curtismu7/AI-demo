const axios = require('axios');
const crypto = require('crypto');
const oauthConfig = require('../config/oauth');
const { isOAuthVerboseDebug } = require('../utils/oauthDebugFlags');
const { verboseOAuthLog } = require('../utils/oauthVerboseLogger');

// Utility function to decode and log OAuth token information
const logTokenInfo = (token, context = '') => {
  if (!isOAuthVerboseDebug()) return;

  try {
    // Parse JWT without verification (just for reading claims)
    const parts = token.split('.');
    if (parts.length !== 3) {
      verboseOAuthLog(`🔐 [${context}] Invalid token format`);
      return;
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    if (!header || !payload) {
      verboseOAuthLog(`🔐 [${context}] Failed to decode token`);
      return;
    }

    verboseOAuthLog(`🔐 [${context}] Token Information:`);
    verboseOAuthLog(`   Algorithm: ${header.alg}`);
    verboseOAuthLog(`   Type: ${header.typ}`);
    if (header.kid) verboseOAuthLog(`   Key ID: ${header.kid}`);

    verboseOAuthLog(`   Subject: ${payload.sub || 'N/A'}`);
    verboseOAuthLog(`   Issuer: ${payload.iss || 'N/A'}`);
    verboseOAuthLog(`   Audience: ${Array.isArray(payload.aud) ? payload.aud.join(', ') : payload.aud || 'N/A'}`);

    if (payload.exp) {
      const expDate = new Date(payload.exp * 1000);
      const now = new Date();
      const timeUntilExp = expDate.getTime() - now.getTime();
      verboseOAuthLog(`   Expires: ${expDate.toISOString()} (in ${Math.round(timeUntilExp / 1000 / 60)} minutes)`);
    }

    if (payload.iat) {
      const iatDate = new Date(payload.iat * 1000);
      verboseOAuthLog(`   Issued At: ${iatDate.toISOString()}`);
    }

    if (payload.preferred_username) verboseOAuthLog(`   Username: ${payload.preferred_username}`);
    if (payload.email) verboseOAuthLog(`   Email: ${payload.email}`);
    if (payload.given_name) verboseOAuthLog(`   First Name: ${payload.given_name}`);
    if (payload.family_name) verboseOAuthLog(`   Last Name: ${payload.family_name}`);

    if (payload.realm_access?.roles) {
      verboseOAuthLog(`   Realm Roles: ${payload.realm_access.roles.join(', ')}`);
    }
    if (payload.resource_access) {
      verboseOAuthLog(`   Resource Access: ${JSON.stringify(payload.resource_access)}`);
    }
    if (payload.scope) {
      verboseOAuthLog(`   Scopes: ${payload.scope}`);
    }
  } catch (error) {
    verboseOAuthLog(`🔐 [${context}] Error decoding token: ${error.message}`);
  }
};

class OAuthService {
  constructor() {
    this.config = oauthConfig;
  }

  /**
   * Generate a PKCE code_verifier (random 64-byte hex string)
   */
  generateCodeVerifier() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Derive PKCE code_challenge (S256) from code_verifier
   */
  generateCodeChallenge(codeVerifier) {
    return crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
  }

  /**
   * Generate authorization URL for the authorization code flow with PKCE (S256)
   */
  generateAuthorizationUrl(state, codeVerifier, redirectUri, nonce = null) {
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri || this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      login_hint: 'admin'
    });

    if (nonce) {
      params.set('nonce', nonce);
    }

    return `${this.config.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token.
   * codeVerifier must match the code_challenge sent during /authorize (PKCE S256).
   */
  async exchangeCodeForToken(code, codeVerifier, redirectUri) {
    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri || this.config.redirectUri,
        client_id: this.config.clientId,
      });
      // PKCE code_verifier goes in the body regardless of client type (RFC 7636).
      if (codeVerifier) {
        body.set('code_verifier', codeVerifier);
      }
      // Use CLIENT_SECRET_BASIC (Authorization header) per RFC 6749 §2.3.1 and PingOne app config.
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      if (this.config.clientSecret) {
        const credentials = `${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`;
        headers.Authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
      }
      const tokenResponse = await axios.post(this.config.tokenEndpoint, body.toString(), {
        headers,
      });

      // Log the received access token information
      if (tokenResponse.data.access_token) {
        logTokenInfo(tokenResponse.data.access_token, 'OAuth Token Exchange');
      }

      return tokenResponse.data;
    } catch (error) {
      const pingoneError = error.response?.data?.error;
      const pingoneDesc  = error.response?.data?.error_description;
      console.error('[exchangeCodeForToken] Failed:', error.response?.data || error.message);
      const msg = pingoneError
        ? `Token exchange failed: ${pingoneError}${pingoneDesc ? ' — ' + pingoneDesc : ''}`
        : 'Failed to exchange authorization code for token';
      const err = new Error(msg);
      err.pingoneError = pingoneError || 'token_exchange_failed';
      err.pingoneDesc  = pingoneDesc  || '';
      throw err;
    }
  }

  /**
   * RFC 8693 Token Exchange — exchange a subject token for a narrowly-scoped
   * delegated token targeted at a specific audience (e.g. the MCP server).
   *
   * The resulting token will contain an `act` claim identifying this client
   * as the actor, and its scope/audience will be restricted to what was requested.
   *
   * PingOne must be configured to:
   *   1. Issue `may_act` on user tokens (naming this client_id as permitted actor)
   *   2. Allow the token-exchange grant type on this client
   */
  async performTokenExchange(subjectToken, audience, scopes) {
    const scopeStr = Array.isArray(scopes) ? scopes.join(' ') : scopes;
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      audience: audience,
      scope: scopeStr,
      client_id: this.config.clientId,
    });
    if (this.config.clientSecret) {
      body.set('client_secret', this.config.clientSecret);
    }
    try {
      const response = await axios.post(this.config.tokenEndpoint, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const exchanged = response.data.access_token;
      if (!exchanged) throw new Error('Token exchange response missing access_token');
      console.log(`[TokenExchange] Issued delegated token for audience=${audience} scope="${scopeStr}"`);
      return exchanged;
    } catch (error) {
      console.error('[TokenExchange] Failed:', error.response?.data || error.message);
      throw new Error(`Token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * RFC 8693 Token Exchange with both subject (end user) and actor (agent OAuth client) tokens.
   * The issued access token represents the user (subject) with the agent acting on their behalf.
   * Requires PingOne token-exchange grant on the BFF client and compatible may_act / actor policy.
   *
   * @param {string} subjectToken - User's access token (who is affected)
   * @param {string} actorToken   - Agent client-credentials token (who performs the action)
   */
  async performTokenExchangeWithActor(subjectToken, actorToken, audience, scopes) {
    const scopeStr = Array.isArray(scopes) ? scopes.join(' ') : scopes;
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      actor_token: actorToken,
      actor_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      audience: audience,
      scope: scopeStr,
      client_id: this.config.clientId,
    });
    if (this.config.clientSecret) {
      body.set('client_secret', this.config.clientSecret);
    }
    try {
      const response = await axios.post(this.config.tokenEndpoint, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const exchanged = response.data.access_token;
      if (!exchanged) throw new Error('Token exchange response missing access_token');
      console.log(`[TokenExchange+Actor] Delegated token audience=${audience} scope="${scopeStr}"`);
      return exchanged;
    } catch (error) {
      console.error('[TokenExchange+Actor] Failed:', error.response?.data || error.message);
      throw new Error(`Actor token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Client-credentials token for the dedicated "agent actor" OAuth application (PingOne).
   * Used as actor_token when exchanging for an on-behalf-of MCP access token.
   * Configure via AGENT_OAUTH_CLIENT_ID / AGENT_OAUTH_CLIENT_SECRET.
   */
  async getAgentClientCredentialsToken() {
    const clientId = process.env.AGENT_OAUTH_CLIENT_ID;
    const clientSecret = process.env.AGENT_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('AGENT_OAUTH_CLIENT_ID and AGENT_OAUTH_CLIENT_SECRET must be set for agent actor tokens');
    }
    const scope = process.env.AGENT_OAUTH_CLIENT_SCOPES || 'openid';
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    });
    try {
      const response = await axios.post(this.config.tokenEndpoint, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const at = response.data.access_token;
      if (!at) throw new Error('Client credentials response missing access_token');
      return at;
    } catch (error) {
      console.error('[AgentClientCredentials] Failed:', error.response?.data || error.message);
      throw new Error(`Agent client credentials failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Get user information from PingOne Core
   */
  async getUserInfo(accessToken) {
    try {
      const userInfoResponse = await axios.get(this.config.userInfoEndpoint, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return userInfoResponse.data;
    } catch (error) {
      console.error('User info error:', error.response?.data || error.message);
      throw new Error('Failed to get user information');
    }
  }

  /**
   * Validate access token
   */
  async validateToken(accessToken) {
    try {
      // Validate token by making a request to userinfo endpoint
      const userInfo = await this.getUserInfo(accessToken);
      return {
        valid: true,
        userInfo: userInfo
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Check if user has admin role (deprecated - now handled in local user management)
   */
  hasAdminRole(userInfo) {
    // This method is kept for backward compatibility but is no longer used
    // Admin role checking is now handled in the local user management system
    console.log('hasAdminRole called but deprecated - using local user management instead');
    return false;
  }

  /**
   * RFC 7009 — Revoke a token (access or refresh) at the PingOne revocation endpoint.
   * Best-effort: logs errors but does not throw, so logout always completes.
   *
   * @param {string} token        - The token to revoke
   * @param {string} [tokenType]  - 'access_token' | 'refresh_token' (hint only, optional)
   */
  async revokeToken(token, tokenType) {
    if (!token) return;
    // PingOne revocation endpoint: replace /token with /token/revoke in the token endpoint URL
    // PingOne AI IAM Core exposes: POST /{envId}/as/revoke
    const revocationEndpoint = this.config.tokenEndpoint
      ? this.config.tokenEndpoint.replace(/\/as\/token$/, '/as/revoke')
      : null;
    if (!revocationEndpoint) {
      console.warn('[RFC7009] Cannot revoke token: tokenEndpoint not configured');
      return;
    }
    const body = new URLSearchParams({ token, client_id: this.config.clientId });
    if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret);
    if (tokenType) body.set('token_type_hint', tokenType);
    try {
      await axios.post(revocationEndpoint, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 5000,
      });
      console.log(`[RFC7009] Token revoked (hint: ${tokenType || 'none'})`);
    } catch (err) {
      // Log but don't block logout on revocation failure
      console.warn('[RFC7009] Token revocation failed (non-fatal):', err.response?.data || err.message);
    }
  }

  /**
   * Generate a random state parameter for CSRF protection
   */
  generateState() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a user object from PingOne Core user info
   */
  createUserFromOAuth(userInfo) {
    return {
      id: userInfo.sub || userInfo.id,
      username: userInfo.preferred_username || userInfo.username || userInfo.email,
      email: userInfo.email,
      firstName: userInfo.given_name || userInfo.first_name || userInfo.name?.split(' ')[0] || '',
      lastName: userInfo.family_name || userInfo.last_name || userInfo.name?.split(' ').slice(1).join(' ') || '',
      role: 'customer', // Default role, will be overridden in OAuth callback if needed
      isActive: true,
      createdAt: new Date(),
      oauthProvider: 'pingone_ai_core',
      oauthId: userInfo.sub || userInfo.id
    };
  }
}

module.exports = new OAuthService();
