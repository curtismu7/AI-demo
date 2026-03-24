const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const oauthService = require('../services/oauthService');
const configStore = require('../services/configStore');
const dataStore = require('../data/store');
const { determineClientType } = require('../middleware/auth');
const {
  getFrontendOrigin,
  getAdminRedirectUri,
  validateRedirectUriOrigin,
  getExpectedFrontendOrigin,
} = require('../services/oauthRedirectUris');
const { setPkceCookie, readPkceCookie, clearPkceCookie } = require('../services/pkceStateCookie');
const { setAuthCookie, clearAuthCookie } = require('../services/authStateCookie');

const _isProd = () => !!(process.env.VERCEL || process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === 'production');

/**
 * GET /api/auth/oauth/redirect-info — implemented on app in server.js (before /api/auth mount).
 */

/**
 * Initiate OAuth login for admin users
 * Redirects to PingOne Core authorization endpoint
 */
router.get('/login', (req, res) => {
  try {
    // Guard: redirect to config if PingOne credentials are not set
    if (!configStore.isConfigured()) {
      return res.redirect(`${getFrontendOrigin(req)}/config?error=not_configured`);
    }

    // Drop a prior end-user OAuth session so Admin sign-in does not reuse customer tokens/role.
    const isEndUserSession =
      req.session?.oauthType === 'user' || req.session?.user?.role === 'customer';
    if (isEndUserSession) {
      delete req.session.oauthTokens;
      delete req.session.user;
      delete req.session.clientType;
      delete req.session.oauthType;
      // Also clear the _auth cookie so the session-restore middleware cannot
      // resurrect the customer identity on a different Vercel instance.
      clearAuthCookie(res, _isProd());
    }

    // Generate state parameter for CSRF protection
    const state = oauthService.generateState();

    // Generate PKCE code_verifier and store in session
    const codeVerifier = oauthService.generateCodeVerifier();
    const redirectUri = getAdminRedirectUri(req);

    // Validate redirect_uri domain matches the expected deployment origin
    const uriCheck = validateRedirectUriOrigin(redirectUri);
    if (!uriCheck.ok) {
      console.warn('[oauth] Redirect URI rejected:', uriCheck.reason, redirectUri);
      return res.status(400).json({ error: 'invalid_redirect_uri', message: uriCheck.reason });
    }

    req.session.oauthState = state;
    req.session.oauthCodeVerifier = codeVerifier;
    req.session.oauthRedirectUri = redirectUri;

    // Generate a nonce for OIDC replay protection (RFC 6749 / OIDC Core §3.1.2.1)
    const nonce = crypto.randomBytes(16).toString('hex');
    req.session.oauthNonce = nonce;

    // Generate authorization URL (includes code_challenge derived from verifier)
    const resourceParam = process.env.ENDUSER_AUDIENCE
      ? `&resource=${encodeURIComponent(process.env.ENDUSER_AUDIENCE)}`
      : '';
    const authUrl = oauthService.generateAuthorizationUrl(state, codeVerifier, redirectUri, nonce) + resourceParam;

    const cfg = oauthService.config || {};
    console.log('[oauth/login] client_id=%s redirect_uri=%s env_id=%s',
      cfg.clientId ? cfg.clientId.slice(0, 8) + '...' : 'MISSING',
      redirectUri,
      cfg.tokenEndpoint ? cfg.tokenEndpoint.split('/')[4] : 'MISSING'
    );

    // Vercel / serverless: also store PKCE data in a signed cookie so the
    // callback can recover it if the in-memory session is on a different instance.
    setPkceCookie(res, { state, codeVerifier, redirectUri, nonce }, _isProd());

    // Explicitly save before redirecting — required with async stores (Redis/Upstash)
    // so the state/verifier are persisted before PingOne sends the callback.
    req.session.save((err) => {
      if (err) {
        console.error('[oauth] Session save error before redirect:', err);
        return res.status(500).json({ error: 'Failed to initiate OAuth login' });
      }
      res.redirect(authUrl);
    });
  } catch (error) {
    console.error('OAuth login error:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth login' });
  }
});

/**
 * OAuth callback handler
 * Receives authorization code from PingOne Core and exchanges it for tokens
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    // Validate the request origin matches our expected deployment (defence-in-depth)
    const isProdDeployment = process.env.VERCEL || process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT;
    if (isProdDeployment) {
      const referer = req.get('referer') || req.get('origin') || '';
      const expectedOrigin = getExpectedFrontendOrigin(req);
      if (referer && !referer.startsWith(expectedOrigin) && !referer.startsWith('https://auth.pingone')) {
        console.warn('[oauth/callback] Unexpected referer:', referer, '— expected:', expectedOrigin);
        // Log but don't block — PingOne already validates; this is observability only
        // If you want to harden further, change the console.warn to a return res.redirect error
      }
    }

    // Check for OAuth errors
    if (error) {
      console.error('OAuth error:', error);
      return res.redirect(`${getFrontendOrigin(req)}/login?error=oauth_error`);
    }

    // Validate state — prefer session, fall back to PKCE cookie (Vercel serverless)
    const pkceCookie = readPkceCookie(req);
    const sessionState = req.session.oauthState;
    const resolvedState = sessionState || pkceCookie?.state;

    if (!state || state !== resolvedState) {
      console.error('[oauth/callback] Invalid state parameter. session:', sessionState, 'cookie:', pkceCookie?.state, 'received:', state);
      clearPkceCookie(res, _isProd());
      return res.redirect(`${getFrontendOrigin(req)}/login?error=invalid_state`);
    }

    // Clear state, code_verifier and redirect URI from session and cookie
    const codeVerifier = req.session.oauthCodeVerifier || pkceCookie?.codeVerifier;
    const redirectUri   = req.session.oauthRedirectUri  || pkceCookie?.redirectUri;
    const expectedNonce = req.session.oauthNonce         || pkceCookie?.nonce;
    delete req.session.oauthState;
    delete req.session.oauthCodeVerifier;
    delete req.session.oauthRedirectUri;
    delete req.session.oauthNonce;
    clearPkceCookie(res, _isProd());

    // Exchange authorization code for access token (with PKCE verifier)
    const tokenData = await oauthService.exchangeCodeForToken(code, codeVerifier, redirectUri);

    // Verify nonce in ID token to prevent ID token replay attacks (OIDC Core §3.1.2.7)
    if (expectedNonce && tokenData.id_token) {
      try {
        const idPayload = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64url').toString());
        if (!idPayload.nonce) {
          console.warn('[oauth/callback] ID token has no nonce claim');
        } else if (idPayload.nonce !== expectedNonce) {
          console.error('[oauth/callback] Nonce mismatch — possible ID token replay attack');
          return res.redirect(`${getFrontendOrigin(req)}/login?error=nonce_mismatch`);
        }
      } catch (e) {
        console.warn('[oauth/callback] Could not decode ID token for nonce verification:', e.message);
      }
    }
    const userInfo = await oauthService.getUserInfo(tokenData.access_token);
    console.log('User info from PingOne Core:', JSON.stringify(userInfo, null, 2));
    
    // Create user object from OAuth data
    const oauthUser = oauthService.createUserFromOAuth(userInfo);
    
    // Check if user already exists in our system
    let user = dataStore.getUserByUsername(oauthUser.username);
    console.log('Looking for existing user:', oauthUser.username);
    console.log('Found user:', user);
    
    if (!user) {
      // For OAuth users, we'll create them as admin by default
      // In production, you might want to check a whitelist or specific PingOne Core attributes
      console.log('Creating new OAuth user as admin:', oauthUser.username);
      oauthUser.role = 'admin'; // Make OAuth users admin by default
    } else {
      console.log('Found existing user:', user.username, 'with role:', user.role);
      // This flow is the Admin PingOne app only — always grant admin in the demo store so
      // users who previously signed in as Customer can switch to Admin without staying "customer".
      // Do not downgrade an existing admin.
      oauthUser.role = 'admin';
    }
    
    if (!user) {
      // Create new user from OAuth data
      console.log('Creating new user with data:', oauthUser);
      user = await dataStore.createUser({
        ...oauthUser,
        password: null // OAuth users don't have passwords
      });
      console.log('Created user:', user);
    } else {
      // Update existing user with OAuth data
      console.log('Updating existing user with data:', {
        email: oauthUser.email,
        firstName: oauthUser.firstName,
        lastName: oauthUser.lastName,
        role: oauthUser.role,
        oauthProvider: oauthUser.oauthProvider,
        oauthId: oauthUser.oauthId
      });
      user = await dataStore.updateUser(user.id, {
        email: oauthUser.email,
        firstName: oauthUser.firstName,
        lastName: oauthUser.lastName,
        role: oauthUser.role,
        oauthProvider: oauthUser.oauthProvider,
        oauthId: oauthUser.oauthId
      });
      console.log('Updated user:', user);
    }

    // Regenerate session ID before storing OAuth tokens to prevent session fixation.
    // Pre-capture the data we need to store, then assign after regeneration.
    const oauthTokens = {
      accessToken: tokenData.access_token,
      idToken: tokenData.id_token || null,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      tokenType: tokenData.token_type || 'Bearer'
    };
    const clientType = determineClientType(tokenData.access_token);
    const authedUser = user;
    const redirectOrigin = getFrontendOrigin(req);

    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('Session regeneration error during OAuth callback:', regenErr);
        return res.redirect(`${redirectOrigin}/login?error=session_error`);
      }
      req.session.oauthTokens = oauthTokens;
      req.session.user = authedUser;
      req.session.clientType = clientType;

      // Save session before redirect to prevent race condition where status
      // endpoint runs before session is persisted to the store
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.redirect(`${redirectOrigin}/login?error=session_error`);
        }
        // Set a signed auth-state cookie so the session-restore middleware can
        // answer /status and /nl requests even when the session hits a different
        // serverless instance on Vercel.
        setAuthCookie(res, {
          ...authedUser,
          oauthType: 'admin',
          expiresAt: oauthTokens.expiresAt,
        }, _isProd());
        const adminUrl = process.env.FRONTEND_ADMIN_URL || `${redirectOrigin}/admin`;
        res.redirect(`${adminUrl}?oauth=success`);
      });
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    const detail = error.pingoneError || 'unknown';
    const desc   = error.pingoneDesc   || '';
    const query  = desc
      ? `error=callback_failed&detail=${encodeURIComponent(detail)}&info=${encodeURIComponent(desc)}`
      : `error=callback_failed&detail=${encodeURIComponent(detail)}`;
    res.redirect(`${getFrontendOrigin(req)}/login?${query}`);
  }
});

/**
 * Logout - clear local session and end PingOne SSO session
 */
router.get('/logout', (req, res) => {
  const idToken = req.session.oauthTokens?.idToken || null;
  const postLogoutUri = `${getFrontendOrigin(req)}/login`;

  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }

    // Redirect to PingOne RP-Initiated Logout so the SSO session is cleared.
    // PingOne signoff endpoint: /as/signoff
    const envId = process.env.PINGONE_ENVIRONMENT_ID;
    const region = process.env.PINGONE_REGION || 'com';
    const pingoneSignoff = `https://auth.pingone.${region}/${envId}/as/signoff`;

    const params = new URLSearchParams({
      post_logout_redirect_uri: postLogoutUri
    });
    // Include id_token_hint if available (PingOne uses it to identify the session)
    if (idToken) {
      params.set('id_token_hint', idToken);
    }

    res.redirect(`${pingoneSignoff}?${params.toString()}`);
  });
});

/**
 * Get current OAuth session status
 */
router.get('/status', (req, res) => {
  const isAuthenticated = !!(req.session.user && req.session.oauthTokens?.accessToken);
  
  res.json({
    authenticated: isAuthenticated,
    user: isAuthenticated ? {
      id: req.session.user.id,
      username: req.session.user.username,
      email: req.session.user.email,
      firstName: req.session.user.firstName,
      lastName: req.session.user.lastName,
      role: req.session.user.role
    } : null,
    oauthProvider: isAuthenticated ? req.session.user.oauthProvider : null,
    // accessToken intentionally omitted — token stays on the backend (BFF pattern)
    tokenType: isAuthenticated ? req.session.oauthTokens.tokenType : null,
    expiresAt: isAuthenticated ? req.session.oauthTokens.expiresAt : null,
    clientType: isAuthenticated ? req.session.clientType : null
  });
});

/**
 * RFC 6749 §6 — Refresh the admin OAuth access token using the stored refresh token.
 * Called by the frontend or auto-refresh middleware when the access token is near expiry.
 */
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.session.oauthTokens?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'no_refresh_token', message: 'No refresh token in session' });
    }

    const tokenData = await oauthService.refreshAccessToken(refreshToken);
    
    // Update session with new tokens (refresh token rotation per RFC 6749 best practices)
    req.session.oauthTokens = {
      ...req.session.oauthTokens,
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token || req.session.oauthTokens.refreshToken,
      idToken:      tokenData.id_token      || req.session.oauthTokens.idToken,
      expiresAt:    Date.now() + ((tokenData.expires_in || 3600) * 1000),
      tokenType:    tokenData.token_type    || 'Bearer',
    };

    req.session.save((err) => {
      if (err) console.error('[admin refresh] Session save error:', err);
    });

    return res.json({ success: true, expiresAt: req.session.oauthTokens.expiresAt });
  } catch (err) {
    console.error('[admin refresh] Token refresh failed:', err.message);
    return res.status(401).json({ error: 'refresh_failed', message: err.message });
  }
});

module.exports = router;
