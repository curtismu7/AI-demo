const axios = require('axios');
const crypto = require('crypto');
const oauthConfig = require('../config/oauth');
const { isOAuthVerboseDebug } = require('../utils/oauthDebugFlags');
const { verboseOAuthLog } = require('../utils/oauthVerboseLogger');
const { trackTokenEvent } = require('./tokenChainService');

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

/**
 * Apply client credentials for POST /token per the declared auth method.
 * method: 'basic' (default, CLIENT_SECRET_BASIC) → Authorization: Basic header
 *         'post'  (CLIENT_SECRET_POST)            → client_secret in request body
 * All PingOne apps in this project default to CLIENT_SECRET_BASIC — only override
 * via tokenEndpointAuthMethod / AGENT_TOKEN_ENDPOINT_AUTH_METHOD when your PingOne
 * app is explicitly configured for CLIENT_SECRET_POST.
 */
function applyTokenEndpointAuth(clientId, clientSecret, method, body, headers) {
  if (!clientSecret) return;
  if (method === 'post') {
    body.set('client_secret', clientSecret);
    return;
  }
  // Default: CLIENT_SECRET_BASIC (Authorization: Basic header)
  // Per RFC 7617, credentials are sent as base64(client_id:client_secret) with no URL encoding
  const credentials = `${clientId}:${clientSecret}`;
  headers.Authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
}

/**
 * Apply admin client credentials for POST /token per PingOne app setting (basic vs post).
 */
function applyAdminTokenEndpointClientAuth(config, body, headers) {
  applyTokenEndpointAuth(config.clientId, config.clientSecret, config.tokenEndpointAuthMethod, body, headers);
}

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
   * Build PingOne /authorize URL: default response_type=code + PKCE; if authorizeUsesPiFlow,
   * uses response_type=pi.flow and response_mode=pi.flow (PingOne apps that support it).
   */
  generateAuthorizationUrl(state, codeVerifier, redirectUri, nonce = null) {
    const usePiFlow = !!this.config.authorizeUsesPiFlow;
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const responseType = usePiFlow ? 'pi.flow' : 'code';
    const params = new URLSearchParams({
      response_type: responseType,
      client_id: this.config.clientId,
      redirect_uri: redirectUri || this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      login_hint: 'bankadmin'
    });

    if (usePiFlow) {
      params.set('response_mode', 'pi.flow');
    }

    if (nonce) {
      params.set('nonce', nonce);
    }

    return `${this.config.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token.
   * codeVerifier must match the code_challenge sent during /authorize (PKCE S256).
   * Enhanced to support RFC 9728 resource indicators.
   */
  async exchangeCodeForToken(code, codeVerifier, redirectUri, resources = null) {
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
      
      // Add RFC 9728 resource indicators if provided
      if (resources && Array.isArray(resources) && resources.length > 0) {
        // Validate resource format
        const resourceIndicatorService = require('./resourceIndicatorService');
        const validResources = resources.filter(resource => 
          resourceIndicatorService.validateResourceFormat(resource)
        );
        
        if (validResources.length > 0) {
          // Add each resource as a separate parameter (RFC 9728)
          validResources.forEach(resource => {
            body.append('resource', resource);
          });
          console.log('[exchangeCodeForToken] RFC 9728 resources:', validResources);
        }
      }
      
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      applyAdminTokenEndpointClientAuth(this.config, body, headers);
      const tokenResponse = await axios.post(this.config.tokenEndpoint, body.toString(), {
        headers,
      });

      // Log the received access token information
      if (tokenResponse.data.access_token) {
        logTokenInfo(tokenResponse.data.access_token, 'OAuth Token Exchange');
        
        // Record token exchange event for token chain tracking
        const jwt = require('jsonwebtoken');
        try {
          const claims = jwt.decode(tokenResponse.data.access_token);
          if (claims?.sub) {
            trackTokenEvent({
              eventType: 'auth',
              token: tokenResponse.data.access_token,
              userId: claims.sub,
              description: 'OAuth authorization code exchange for access token',
            }).catch(err => {
              console.error('[oauthService] Failed to track token event:', err.message);
            });
          }
        } catch (decodeErr) {
          console.warn('[oauthService] Could not decode token for tracking');
        }
        
        // Add resource binding validation if resources were requested
        if (resources && resources.length > 0) {
          const resourceIndicatorService = require('./resourceIndicatorService');
          try {
            const decoded = JSON.parse(Buffer.from(tokenResponse.data.access_token.split('.')[1], 'base64').toString());
            const hasResourceBinding = decoded.resource || decoded.aud;
            console.log('[exchangeCodeForToken] Resource binding in token:', !!hasResourceBinding);
          } catch (decodeError) {
            console.warn('[exchangeCodeForToken] Could not decode token for resource binding validation');
          }
        }
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
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    applyAdminTokenEndpointClientAuth(this.config, body, headers);
    console.log(
      '[TokenExchange:REQUEST] endpoint=%s client_id=%s audience=%s scope="%s"',
      this.config.tokenEndpoint,
      this.config.clientId,
      audience,
      scopeStr
    );
    try {
      const response = await axios.post(this.config.tokenEndpoint, body.toString(), { headers });
      const exchanged = response.data.access_token;
      if (!exchanged) throw new Error('Token exchange response missing access_token');
      console.log(`[TokenExchange] Issued delegated token for audience=${audience} scope="${scopeStr}"`);
      return exchanged;
    } catch (error) {
      const pingoneData = error.response?.data || {};
      const httpStatus  = error.response?.status;
      console.error('[TokenExchange:FAILED] httpStatus=%s error=%s description=%s detail=%s audience=%s scope="%s"',
        httpStatus,
        pingoneData.error ?? error.message,
        pingoneData.error_description ?? '(none)',
        pingoneData.error_detail ?? pingoneData.details ?? '(none)',
        audience,
        scopeStr
      );
      const richErr = new Error(
        `Token exchange failed: ${pingoneData.error_description || pingoneData.error || error.message}`
      );
      richErr.httpStatus              = httpStatus;
      richErr.pingoneError            = pingoneData.error;
      richErr.pingoneErrorDescription = pingoneData.error_description;
      richErr.pingoneErrorDetail      = pingoneData.error_detail || pingoneData.details;
      richErr.requestContext          = { audience, scope: scopeStr, client_id: this.config.clientId };
      throw richErr;
    }
  }

  /**
   * RFC 8693 Token Exchange with both subject (end user) and actor (agent OAuth client) tokens.
   * The issued access token represents the user (subject) with the agent acting on their behalf.
   * Requires PingOne token-exchange grant on the Backend-for-Frontend (BFF) client and compatible may_act / actor policy.
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
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    applyAdminTokenEndpointClientAuth(this.config, body, headers);
    try {
      const response = await axios.post(this.config.tokenEndpoint, body.toString(), { headers });
      const exchanged = response.data.access_token;
      if (!exchanged) throw new Error('Token exchange response missing access_token');
      console.log(`[TokenExchange+Actor] Delegated token audience=${audience} scope="${scopeStr}"`);
      return exchanged;
    } catch (error) {
      const pingoneData = error.response?.data || {};
      const httpStatus  = error.response?.status;
      console.error('[TokenExchange+Actor] Failed:', { httpStatus, ...pingoneData, rawMessage: error.message });
      const richErr = new Error(
        `Actor token exchange failed: ${pingoneData.error_description || pingoneData.error || error.message}`
      );
      richErr.httpStatus              = httpStatus;
      richErr.pingoneError            = pingoneData.error;
      richErr.pingoneErrorDescription = pingoneData.error_description;
      richErr.pingoneErrorDetail      = pingoneData.error_detail || pingoneData.details;
      richErr.requestContext          = { audience, scope: scopeStr, client_id: this.config.clientId };
      throw richErr;
    }
  }

  /**
   * Client-credentials token for the PingOne Worker Token app (Management API).
   * Used for verifying apps, resources, scopes, users in PingOne.
   * PingOne App: Super Banking Worker Token — configure via PINGONE_WORKER_TOKEN_CLIENT_ID / PINGONE_WORKER_TOKEN_CLIENT_SECRET.
   */
  async getAgentClientCredentialsToken() {
    const clientId = process.env.PINGONE_WORKER_TOKEN_CLIENT_ID || process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID || process.env.AGENT_OAUTH_CLIENT_ID;
    const clientSecret = process.env.PINGONE_WORKER_TOKEN_CLIENT_SECRET || process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET || process.env.AGENT_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('PINGONE_WORKER_TOKEN_CLIENT_ID and PINGONE_WORKER_TOKEN_CLIENT_SECRET must be set for worker token (PingOne App: Super Banking Worker Token)');
    }
    const agentAuthMethod = (process.env.PINGONE_WORKER_TOKEN_AUTH_METHOD || process.env.MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD || process.env.AGENT_TOKEN_ENDPOINT_AUTH_METHOD || 'basic').toLowerCase();
    
    // For Basic auth: only grant_type in body
    // For POST auth: include client_id and client_secret in body
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
    });
    if (agentAuthMethod === 'post') {
      body.set('client_id', clientId);
    }
    
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    applyTokenEndpointAuth(clientId, clientSecret, agentAuthMethod, body, headers);
    
    try {
      const response = await axios.post(this.config.tokenEndpoint, body.toString(), { headers });
      const at = response.data.access_token;
      if (!at) throw new Error('Client credentials response missing access_token');
      return at;
    } catch (error) {
      const pingoneData = error.response?.data || {};
      const httpStatus  = error.response?.status;
      console.error('[AgentClientCredentials] Failed:', { httpStatus, ...pingoneData, rawMessage: error.message });
      const richErr = new Error(
        `Agent client credentials failed: ${pingoneData.error_description || pingoneData.error || error.message}`
      );
      richErr.httpStatus              = httpStatus;
      richErr.pingoneError            = pingoneData.error;
      richErr.pingoneErrorDescription = pingoneData.error_description;
      richErr.pingoneErrorDetail      = pingoneData.error_detail || pingoneData.details;
      richErr.requestContext          = { client_id: clientId };
      throw richErr;
    }
  }

  /**
   * Client-credentials token with expiry information for the PingOne Worker Token app.
   * Used for PingOne Management API calls (e.g., verifying apps, resources, scopes, users).
   * Returns token along with expiresAt timestamp and expiresIn seconds.
   * Per PingOne documentation, worker apps (client credentials) should NOT include scope in the request.
   */
  async getAgentClientCredentialsTokenWithExpiry() {
    const clientId = process.env.PINGONE_WORKER_TOKEN_CLIENT_ID || process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID || process.env.AGENT_OAUTH_CLIENT_ID;
    const clientSecret = process.env.PINGONE_WORKER_TOKEN_CLIENT_SECRET || process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET || process.env.AGENT_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('PINGONE_WORKER_TOKEN_CLIENT_ID and PINGONE_WORKER_TOKEN_CLIENT_SECRET must be set for worker token (PingOne App: Super Banking Worker Token)');
    }
    const agentAuthMethod = (process.env.PINGONE_WORKER_TOKEN_AUTH_METHOD || process.env.MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD || process.env.AGENT_TOKEN_ENDPOINT_AUTH_METHOD || 'basic').toLowerCase();
    
    // Per PingOne documentation: client credentials grant should NOT include scope
    // https://developer.pingidentity.com/pingone-api/getting-started/create-a-test-environment/step-1-get-access-token.html
    // For Basic auth: only grant_type in body, credentials go in Authorization header
    // For POST auth: include client_id and client_secret in body
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
    });
    if (agentAuthMethod === 'post') {
      body.set('client_id', clientId);
    }
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    applyTokenEndpointAuth(clientId, clientSecret, agentAuthMethod, body, headers);
    
    console.log('[AgentClientCredentialsWithExpiry] Request body:', body.toString());
    console.log('[AgentClientCredentialsWithExpiry] Headers:', headers);
    
    try {
      const response = await axios.post(this.config.tokenEndpoint, body.toString(), { headers });
      const at = response.data.access_token;
      if (!at) throw new Error('Client credentials response missing access_token');
      const expiresIn = response.data.expires_in || 3600; // Default to 1 hour if not provided
      const expiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();
      return { token: at, expiresAt, expiresIn };
    } catch (error) {
      const pingoneData = error.response?.data || {};
      const httpStatus  = error.response?.status;
      console.error('[AgentClientCredentialsWithExpiry] Failed:', { httpStatus, ...pingoneData, rawMessage: error.message });
      const richErr = new Error(
        `Agent client credentials failed: ${pingoneData.error_description || pingoneData.error || error.message}`
      );
      richErr.httpStatus              = httpStatus;
      richErr.pingoneError            = pingoneData.error;
      richErr.pingoneErrorDescription = pingoneData.error_description;
      richErr.pingoneErrorDetail      = pingoneData.error_detail || pingoneData.details;
      richErr.requestContext          = { client_id: clientId };
      throw richErr;
    }
  }

  /**
   * Generic Client Credentials token for any explicit clientId/clientSecret + audience.
   * Used in the 2-exchange delegation chain where each exchanger has its own identity.
   *
   * @param {string} clientId
   * @param {string} clientSecret
   * @param {string} audience  Resource server audience URI (returned token will have aud=[audience])
   */
  async getClientCredentialsTokenAs(clientId, clientSecret, audience, method = 'basic') {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      audience,
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    applyTokenEndpointAuth(clientId, clientSecret, method, body, headers);
    try {
      const response = await axios.post(this.config.tokenEndpoint, body.toString(), { headers });
      const at = response.data.access_token;
      if (!at) throw new Error('Client credentials response missing access_token');
      console.log(`[CC-As] Issued actor token for client=${clientId} audience=${audience}`);
      return at;
    } catch (error) {
      const pingoneData = error.response?.data || {};
      const httpStatus  = error.response?.status;
      console.error('[CC-As] Failed:', { httpStatus, ...pingoneData, rawMessage: error.message });
      const richErr = new Error(
        `Client credentials failed for ${clientId}: ${pingoneData.error_description || pingoneData.error || error.message}`
      );
      richErr.httpStatus              = httpStatus;
      richErr.pingoneError            = pingoneData.error;
      richErr.pingoneErrorDescription = pingoneData.error_description;
      richErr.pingoneErrorDetail      = pingoneData.error_detail || pingoneData.details;
      richErr.requestContext          = { audience, client_id: clientId };
      throw richErr;
    }
  }

  /**
   * RFC 8693 Token Exchange performed by an explicit exchanger (clientId/clientSecret).
   * Used in the 2-exchange chain where AI Agent and MCP Service have distinct credentials.
   *
   * @param {string}   subjectToken   - Incoming subject token
   * @param {string}   actorToken     - Actor token (exchanger's CC token)
   * @param {string}   clientId       - Exchanger's client ID
   * @param {string}   clientSecret   - Exchanger's client secret
   * @param {string}   audience       - Requested token audience
   * @param {string[]} scopes         - Requested scopes
   */
  async performTokenExchangeAs(subjectToken, actorToken, clientId, clientSecret, audience, scopes, method = 'basic') {
    const scopeStr = Array.isArray(scopes) ? scopes.join(' ') : scopes;
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      actor_token: actorToken,
      actor_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      audience,
      scope: scopeStr,
      client_id: clientId,
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    applyTokenEndpointAuth(clientId, clientSecret, method, body, headers);
    try {
      const response = await axios.post(this.config.tokenEndpoint, body.toString(), { headers });
      const exchanged = response.data.access_token;
      if (!exchanged) throw new Error('Token exchange response missing access_token');
      console.log(`[Exchange-As] client=${clientId} audience=${audience} scope="${scopeStr}"`);
      return exchanged;
    } catch (error) {
      const pingoneData = error.response?.data || {};
      const httpStatus  = error.response?.status;
      console.error('[Exchange-As] Failed:', { httpStatus, ...pingoneData, rawMessage: error.message });
      const richErr = new Error(
        `Token exchange failed for ${clientId}: ${pingoneData.error_description || pingoneData.error || error.message}`
      );
      richErr.httpStatus              = httpStatus;
      richErr.pingoneError            = pingoneData.error;
      richErr.pingoneErrorDescription = pingoneData.error_description;
      richErr.pingoneErrorDetail      = pingoneData.error_detail || pingoneData.details;
      richErr.requestContext          = { audience, scope: scopeStr, client_id: clientId };
      throw richErr;
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
   * RFC 6749 §6 — Refresh an access token using a stored refresh token (admin OAuth client).
   * Client authentication matches exchangeCodeForToken (basic vs post).
   */
  async refreshAccessToken(refreshToken) {
    if (!refreshToken) throw new Error('No refresh token provided');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId,
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    applyAdminTokenEndpointClientAuth(this.config, body, headers);
    try {
      const response = await axios.post(this.config.tokenEndpoint, body.toString(), {
        headers,
        timeout: 10000,
      });
      console.log('[TokenRefresh] Admin access token refreshed successfully');
      
      // Record token refresh event for token chain tracking
      if (response.data.access_token) {
        const jwt = require('jsonwebtoken');
        try {
          const claims = jwt.decode(response.data.access_token);
          if (claims?.sub) {
            trackTokenEvent({
              eventType: 'refresh',
              token: response.data.access_token,
              userId: claims.sub,
              description: 'OAuth access token refreshed',
            }).catch(err => {
              console.error('[oauthService] Failed to track token refresh event:', err.message);
            });
          }
        } catch (decodeErr) {
          console.warn('[oauthService] Could not decode refreshed token for tracking');
        }
      }
      
      return response.data;
    } catch (error) {
      console.error('[TokenRefresh] Admin refresh failed:', error.response?.data || error.message);
      throw new Error(`Token refresh failed: ${error.response?.data?.error_description || error.message}`);
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
  hasAdminRole(_userInfo) {
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
    const email = userInfo.email || userInfo.email_address || null;
    const firstName = userInfo.given_name || userInfo.first_name || userInfo.name?.split(' ')[0] || '';
    const lastName = userInfo.family_name || userInfo.last_name || userInfo.name?.split(' ').slice(1).join(' ') || '';
    if (!email) {
      console.warn(
        '[createUserFromOAuth] No email in userinfo/ID token — check PingOne app attribute mappings ' +
        '(email scope must be authorized and the "email" attribute mapped). sub:', userInfo.sub || userInfo.id,
      );
    }
    return {
      id: userInfo.sub || userInfo.id,
      username: userInfo.preferred_username || userInfo.username || email || userInfo.sub,
      email,
      firstName,
      lastName,
      role: 'customer', // Default role, will be overridden in OAuth callback if needed
      isActive: true,
      createdAt: new Date(),
      oauthProvider: 'pingone_ai_core',
      oauthId: userInfo.sub || userInfo.id,
    };
  }
}

module.exports = new OAuthService();
