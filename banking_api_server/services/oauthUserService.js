const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/oauthUser');
const { isOAuthVerboseDebug } = require('../utils/oauthDebugFlags');
const { verboseOAuthLog } = require('../utils/oauthVerboseLogger');

// Utility function to decode and log OAuth token information
const logTokenInfo = (token, context = '') => {
  if (!isOAuthVerboseDebug()) return;

  try {
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

class OAuthUserService {
  constructor() {
    this.config = config;
  }

  /**
   * Generate PKCE code verifier (random 64-byte hex string)
   */
  generateCodeVerifier() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate PKCE code challenge (S256 = base64url(sha256(verifier)))
   */
  generateCodeChallenge(codeVerifier) {
    return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  }

  /**
   * Generate authorization URL for end user OAuth flow.
   * Pass acr_values to trigger step-up MFA (e.g. 'Multi_factor' — must match the PingOne Sign-On Policy name).
   */
  generateAuthorizationUrl(state, codeVerifier, options = {}, redirectUri) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri || this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state: state,
      code_challenge: this.generateCodeChallenge(codeVerifier),
      code_challenge_method: 'S256'
    });

    if (options.acr_values) {
      params.set('acr_values', options.acr_values);
    }

    return `${this.config.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token (Authorization Code + PKCE S256).
   * client_secret is optional: PingOne public clients can use PKCE without a secret;
   * confidential clients should keep the secret only on this server (never in the browser).
   */
  async exchangeCodeForToken(code, codeVerifier, redirectUri) {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri || this.config.redirectUri,
        client_id: this.config.clientId,
      });
      if (this.config.clientSecret) {
        params.set('client_secret', this.config.clientSecret);
      }
      if (codeVerifier) {
        params.set('code_verifier', codeVerifier);
      }
      const response = await axios.post(this.config.tokenEndpoint, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (response.data.access_token) {
        logTokenInfo(response.data.access_token, 'User OAuth Token Exchange');
      }

      return response.data;
    } catch (error) {
      console.error('Token exchange error:', error.response?.data || error.message);
      throw new Error('Failed to exchange code for token');
    }
  }

  /**
   * Resource Owner Password grant — only if enabled on the PingOne application.
   * Used to re-validate credentials when binding an agent identity to a human user.
   */
  async exchangeResourceOwnerPassword(username, password) {
    const body = new URLSearchParams({
      grant_type: 'password',
      username: String(username).trim(),
      password: String(password),
      client_id: this.config.clientId,
      scope: this.config.scopes.join(' '),
    });
    if (this.config.clientSecret) {
      body.set('client_secret', this.config.clientSecret);
    }
    try {
      const response = await axios.post(this.config.tokenEndpoint, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return response.data;
    } catch (error) {
      console.error('[ROPC] Failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error_description || error.message || 'ROPC failed');
    }
  }

  /**
   * Get user information from PingOne Core
   */
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(this.config.userInfoEndpoint, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('User info error:', error.response?.data || error.message);
      throw new Error('Failed to get user information');
    }
  }

  /**
   * Validate JWT token
   */
  validateToken(token) {
    try {
      const decoded = jwt.verify(token, this.config.tokenValidation.issuer, {
        issuer: this.config.tokenValidation.issuer,
        audience: this.config.tokenValidation.audience
      });
      return decoded;
    } catch (error) {
      console.error('Token validation error:', error.message);
      return null;
    }
  }

  /**
   * Create a user object from PingOne Core user info (end users get customer role)
   */
  createUserFromOAuth(userInfo) {
    return {
      id: userInfo.sub || userInfo.id,
      username: userInfo.preferred_username || userInfo.username || userInfo.email,
      email: userInfo.email,
      firstName: userInfo.given_name || userInfo.first_name || userInfo.name?.split(' ')[0] || '',
      lastName: userInfo.family_name || userInfo.last_name || userInfo.name?.split(' ').slice(1).join(' ') || '',
      role: this.config.userRole, // End users get customer role
      isActive: true,
      createdAt: new Date(),
      oauthProvider: 'pingone_ai_core',
      oauthId: userInfo.sub || userInfo.id
    };
  }

  /**
   * Generate random state parameter for CSRF protection
   */
  generateState() {
    return crypto.randomBytes(32).toString('hex');
  }

}

module.exports = new OAuthUserService();
