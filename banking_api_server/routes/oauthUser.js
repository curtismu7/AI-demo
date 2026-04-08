const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const oauthService = require('../services/oauthUserService');
const oauthUserConfig = require('../config/oauthUser');
const configStore = require('../services/configStore');
const dataStore = require('../data/store');
const { determineClientType } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const { getFrontendOrigin, getUserRedirectUri, validateRedirectUriOrigin, getExpectedFrontendOrigin } = require('../services/oauthRedirectUris');
const { setPkceCookie, readPkceCookie, clearPkceCookie } = require('../services/pkceStateCookie');
const { setAuthCookie, clearAuthCookie } = require('../services/authStateCookie');
const { buildPingOneAuthorizeResourceQueryParam } = require('../utils/oauthAuthorizeResource');

const STEP_UP_TTL_MS = 5 * 60 * 1000; // 5 min step-up validity

const _isProd = () => !!(process.env.VERCEL || process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === 'production');

/**
 * Same-origin SPA path only — used after customer OAuth to return to marketing home instead of /dashboard.
 * @param {unknown} raw
 * @returns {string|null}
 */
function sanitizePostLoginReturnPath(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t.startsWith('/') || t.startsWith('//') || t.length > 160) return null;
  if (!/^[/a-zA-Z0-9._~-]+$/.test(t)) return null;
  return t;
}

/**
 * After end-user OAuth failure, redirect to an SPA path where App still mounts BankingAgent
 * (`/` and `/marketing`). `/login` is not in that set — users lose FAB + dock there.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Record<string, string>} params query keys (values truncated)
 * @param {string|null} [pathOverride] e.g. postLoginReturnToPath || '/marketing'
 */
function redirectEndUserOAuthSpaFailure(req, res, params, pathOverride) {
  const origin = getFrontendOrigin(req);
  const path =
    typeof pathOverride === 'string' && pathOverride.startsWith('/')
      ? pathOverride
      : (sanitizePostLoginReturnPath(req.session?.postLoginReturnToPath) || '/marketing');
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    const s = String(v);
    if (!s) continue;
    q.set(k, s.length > 400 ? s.slice(0, 400) : s);
  }
  res.redirect(`${origin}${path}?${q.toString()}`);
}

/**
 * Create sample accounts and transactions for new customers
 */
async function createSampleDataForCustomer(userId, firstName, lastName) {
  try {
    // Create sample accounts with deterministic starting balances.
    // Random values were used previously but produced confusing totals;
    // fixed balances keep the demo consistent and predictable.
    const checkingAccount = await dataStore.createAccount({
      id: uuidv4(),
      userId: userId,
      accountNumber: `100${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`,
      accountType: 'checking',
      balance: 3000.00,
      currency: 'USD',
      createdAt: new Date(),
      isActive: true
    });

    const savingsAccount = await dataStore.createAccount({
      id: uuidv4(),
      userId: userId,
      accountNumber: `100${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`,
      accountType: 'savings',
      balance: 2000.00,
      currency: 'USD',
      createdAt: new Date(),
      isActive: true
    });

    // Create sample transactions
    const transactions = [
      {
        id: uuidv4(),
        fromAccountId: null,
        toAccountId: checkingAccount.id,
        amount: Math.floor(Math.random() * 2000) + 1000,
        type: 'deposit',
        description: 'Initial account funding',
        status: 'completed',
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
        userId: userId
      },
      {
        id: uuidv4(),
        fromAccountId: null,
        toAccountId: savingsAccount.id,
        amount: Math.floor(Math.random() * 5000) + 2000,
        type: 'deposit',
        description: 'Savings account opening bonus',
        status: 'completed',
        createdAt: new Date(Date.now() - Math.random() * 25 * 24 * 60 * 60 * 1000),
        userId: userId
      },
      {
        id: uuidv4(),
        fromAccountId: checkingAccount.id,
        toAccountId: savingsAccount.id,
        amount: Math.floor(Math.random() * 500) + 100,
        type: 'transfer',
        description: 'Monthly savings transfer',
        status: 'completed',
        createdAt: new Date(Date.now() - Math.random() * 20 * 24 * 60 * 60 * 1000),
        userId: userId
      },
      {
        id: uuidv4(),
        fromAccountId: checkingAccount.id,
        toAccountId: null,
        amount: Math.floor(Math.random() * 200) + 50,
        type: 'withdrawal',
        description: 'ATM withdrawal',
        status: 'completed',
        createdAt: new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000),
        userId: userId
      },
      {
        id: uuidv4(),
        fromAccountId: null,
        toAccountId: checkingAccount.id,
        amount: Math.floor(Math.random() * 1000) + 500,
        type: 'deposit',
        description: 'Salary deposit',
        status: 'completed',
        createdAt: new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000),
        userId: userId
      }
    ];

    // Create all transactions
    for (const transaction of transactions) {
      await dataStore.createTransaction(transaction);
    }

    console.debug(`Created sample data for customer ${firstName} ${lastName}: 2 accounts, ${transactions.length} transactions`);
    return { checkingAccount, savingsAccount, transactions };
  } catch (error) {
    console.error('Error creating sample data for customer:', error);
    throw error;
  }
}

/**
 * Initiate OAuth login for end users
 */
router.get('/login', (req, res) => {
  try {
    const _mask = (v, n) => v ? v.slice(0, n) + '...' : 'MISSING';
    console.log('[oauth/user/login] env_id=%s  user_client_id=%s  user_secret=%s  authorize_pi.flow=%s',
      _mask(configStore.getEffective('pingone_environment_id'), 8),
      _mask(configStore.getEffective('user_client_id'), 8),
      _mask(configStore.getEffective('user_client_secret'), 4),
      !!oauthUserConfig.authorizeUsesPiFlow
    );

    // Guard: end-user flow needs user client + env (not admin_client_id)
    if (!configStore.isUserOAuthConfigured()) {
      return res.redirect(`${getFrontendOrigin(req)}/config?error=not_configured`);
    }

    // Drop any prior admin session so Customer sign-in starts fresh.
    const isAdminSession = req.session?.oauthType === 'admin' || req.session?.user?.role === 'admin';
    if (isAdminSession) {
      delete req.session.oauthTokens;
      delete req.session.user;
      delete req.session.clientType;
      delete req.session.oauthType;
      // Also clear the _auth cookie so the session-restore middleware cannot
      // resurrect the admin identity on a different Vercel instance.
      clearAuthCookie(res, _isProd());
    }

    const returnPath = sanitizePostLoginReturnPath(req.query.return_to);
    if (returnPath) {
      req.session.postLoginReturnToPath = returnPath;
    } else {
      delete req.session.postLoginReturnToPath;
    }

    const state = oauthService.generateState();
    const codeVerifier = oauthService.generateCodeVerifier();
    const redirectUri = getUserRedirectUri(req);

    // Validate redirect_uri domain matches the expected deployment origin
    const uriCheck = validateRedirectUriOrigin(redirectUri);
    if (!uriCheck.ok) {
      console.warn('[oauth/user] Redirect URI rejected:', uriCheck.reason, redirectUri);
      return res.status(400).json({ error: 'invalid_redirect_uri', message: uriCheck.reason });
    }

    const resourceParam = buildPingOneAuthorizeResourceQueryParam(
      process.env.ENDUSER_AUDIENCE,
      oauthUserConfig.scopes,
    );

    // Generate a nonce for OIDC replay protection (RFC 6749 / OIDC Core §3.1.2.1)
    const nonce = crypto.randomBytes(16).toString('hex');
    const forcePiFlow =
      req.query.use_pi_flow === '1' || String(req.query.use_pi_flow || '').toLowerCase() === 'true';
    const url =
      oauthService.generateAuthorizationUrl(
        state,
        codeVerifier,
        { nonce, ...(forcePiFlow ? { forcePiFlow: true } : {}) },
        redirectUri
      ) + resourceParam;

    // Store state, verifier and redirect URI in session for CSRF protection and PKCE
    req.session.oauthState = state;
    req.session.oauthCodeVerifier = codeVerifier;
    req.session.oauthRedirectUri = redirectUri;
    req.session.oauthNonce = nonce;
    req.session.oauthType = 'user'; // Distinguish from admin OAuth

    // Vercel / serverless: also persist PKCE data in a signed cookie so the
    // callback can recover it when the in-memory session is on a different instance.
    setPkceCookie(res, { state, codeVerifier, redirectUri, nonce }, _isProd());

    // Persist PKCE state before redirecting so the callback can validate.
    // Non-fatal: state/verifier are already in the signed PKCE cookie (setPkceCookie above),
    // so the callback can recover even when the Redis session write fails (Vercel cold start).
    req.session.oauthLoginStartedAt = Date.now();
    req.session.save((err) => {
      if (err) {
        console.warn('[oauth/user] Session save failed before PingOne redirect (PKCE cookie is fallback):', err.message);
      }
      console.log('Redirecting end user to PingOne Core:', url);
      res.redirect(url);
    });
  } catch (error) {
    console.error('OAuth login error:', error);
    redirectEndUserOAuthSpaFailure(req, res, { error: 'oauth_init_failed' });
  }
});

/**
 * Handle OAuth callback for end users
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
        console.warn('[oauth/user/callback] Unexpected referer:', referer, '— expected:', expectedOrigin);
        // Log but don't block — PingOne already validates; this is observability only
        // If you want to harden further, change the console.warn to a return res.redirect error
      }
    }

    // Check for OAuth errors (PingOne sends error + optional error_description)
    if (error) {
      console.error('[oauth/user/callback] IdP error:', error, req.query.error_description || '');
      return redirectEndUserOAuthSpaFailure(req, res, {
        error:           'oauth_provider',
        idp_error:       String(error).slice(0, 120),
        error_description: String(req.query.error_description || '').slice(0, 400),
      });
    }
    
    // Validate state — prefer session, fall back to PKCE cookie (Vercel serverless)
    const pkceCookie = readPkceCookie(req);
    const sessionState = req.session.oauthState;
    const resolvedState = sessionState || pkceCookie?.state;

    if (!state || state !== resolvedState) {
      console.error('[oauth/user/callback] Invalid state. session:', sessionState, 'cookie:', pkceCookie?.state, 'received:', state);
      clearPkceCookie(res, _isProd());
      return redirectEndUserOAuthSpaFailure(req, res, { error: 'invalid_state' });
    }

    // Validate code parameter
    if (!code) {
      console.error('[oauth/user/callback] No authorization code (pi.flow may use a different callback shape than code flow)');
      clearPkceCookie(res, _isProd());
      return redirectEndUserOAuthSpaFailure(req, res, { error: 'no_code' });
    }

    // Retrieve and clear the PKCE code verifier and redirect URI from session / cookie
    const codeVerifier = req.session.oauthCodeVerifier || pkceCookie?.codeVerifier;
    const redirectUri   = req.session.oauthRedirectUri  || pkceCookie?.redirectUri;
    const expectedNonce = req.session.oauthNonce         || pkceCookie?.nonce;
    delete req.session.oauthCodeVerifier;
    delete req.session.oauthRedirectUri;
    delete req.session.oauthState;
    delete req.session.oauthNonce;
    clearPkceCookie(res, _isProd());

    // Exchange code for token (with PKCE verifier)
    const tokenData = await oauthService.exchangeCodeForToken(code, codeVerifier, redirectUri);
    console.debug('Token received for end user');

    // Decode ID token claims — used for nonce verification and as a fallback for userinfo gaps.
    let idTokenClaims = {};
    if (tokenData.id_token) {
      try {
        idTokenClaims = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64url').toString());
      } catch (e) {
        console.warn('[oauth/user/callback] Could not decode ID token:', e.message);
      }
    }

    // Verify nonce in ID token to prevent ID token replay attacks (OIDC Core §3.1.2.7)
    if (expectedNonce && idTokenClaims.nonce) {
      if (idTokenClaims.nonce !== expectedNonce) {
        console.error('[oauth/user/callback] Nonce mismatch — possible ID token replay attack');
        return redirectEndUserOAuthSpaFailure(req, res, { error: 'nonce_mismatch' });
      }
    } else if (expectedNonce && tokenData.id_token && !idTokenClaims.nonce) {
      console.warn('[oauth/user/callback] ID token has no nonce claim');
    }

    // Get user information from PingOne Core
    const userInfo = await oauthService.getUserInfo(tokenData.access_token);

    // Merge ID token claims as fallback for any userinfo gaps (e.g. email not in userinfo response).
    // userinfo takes priority; idTokenClaims fills only missing fields.
    const mergedUserInfo = { ...idTokenClaims, ...userInfo };

    // Create user object from OAuth data
    const oauthUser = oauthService.createUserFromOAuth(mergedUserInfo);
    
    // Check if user already exists in our system
    let user = dataStore.getUserByUsername(oauthUser.username);
    
    // Resolve admin role using four signals (any one is sufficient):
    //  1. admin_username allowlist  — permanent override (bankadmin, service accounts)
    //  2. PingOne population ID     — admin users live in a dedicated PingOne population
    //  3. PingOne custom claim      — attribute named by admin_role_claim matches admin_role value
    //  4. Existing dataStore record — preserve admin granted in a previous session
    const configuredAdminRole       = configStore.getEffective('admin_role') || 'admin';
    const configuredAdminUsernames  = (configStore.getEffective('admin_username') || '')
      .split(',').map(u => u.trim()).filter(Boolean);
    const configuredAdminPopulation = (configStore.getEffective('admin_population_id') || '').trim();
    const configuredRoleClaim       = (configStore.getEffective('admin_role_claim') || '').trim();

    // Signal 1: username allowlist — always wins, no PingOne attribute needed
    const usernameIsAdmin = configuredAdminUsernames.includes(oauthUser.username);

    // Signal 2: population — PingOne includes population.id in userinfo when mapped;
    // also check top-level populationId as some app configs surface it there.
    let populationIsAdmin = false;
    if (configuredAdminPopulation && !usernameIsAdmin) {
      const popId = mergedUserInfo?.population?.id || mergedUserInfo?.populationId || null;
      populationIsAdmin = popId === configuredAdminPopulation;
    }

    // Signal 3: custom claim — supports string or array (e.g. group membership list)
    let claimIsAdmin = false;
    if (configuredRoleClaim && !usernameIsAdmin && !populationIsAdmin) {
      const claimValue = mergedUserInfo[configuredRoleClaim];
      claimIsAdmin = Array.isArray(claimValue)
        ? claimValue.includes(configuredAdminRole)
        : claimValue === configuredAdminRole;
    }

    // Signal 4: existing record — don't downgrade someone already marked admin
    const existingRoleAdmin = user?.role === 'admin';

    if (usernameIsAdmin || populationIsAdmin || claimIsAdmin || existingRoleAdmin) {
      oauthUser.role = 'admin';
      console.log(`[oauth/user/callback] Granting admin to ${oauthUser.username} (allowlist=${usernameIsAdmin}, population=${populationIsAdmin}, claim[${configuredRoleClaim}]=${claimIsAdmin}, existing=${existingRoleAdmin})`);
    } else {
      oauthUser.role = 'customer';
      console.log(`[oauth/user/callback] Granting customer role to ${oauthUser.username}`);
    }
    
    if (!user) {
      // Create new user from OAuth data
      user = await dataStore.createUser({
        ...oauthUser,
        password: null // OAuth users don't have passwords
      });
      
      // Create sample data for new customers (only if they have no accounts yet)
      if (user.role === 'customer') {
        try {
          const existingAccounts = dataStore.getAccountsByUserId(user.id);
          if (existingAccounts.length === 0) {
            await createSampleDataForCustomer(user.id, user.firstName, user.lastName);
          } else {
          }
        } catch (error) {
          console.error('Failed to create sample data for new customer:', error);
          // Don't fail the login if sample data creation fails
        }
      }
    } else {
      // Update existing user with OAuth data
      
      // Check if user exists in data store
      const existingUser = dataStore.getUserById(user.id);
      console.log('User found in data store:', existingUser);
      
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
    
    if (!tokenData.refresh_token) {
      console.warn(
        '[oauthUser/callback] No refresh_token in token response — enable offline_access on the PingOne '
        + 'user app and include offline_access in authorized scopes. Session renewal will fail until users sign in again.'
      );
    }
    // Pre-capture data before regenerating session to prevent session fixation
    const oauthTokens = {
      accessToken: tokenData.access_token,
      idToken: tokenData.id_token || null,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      tokenType: tokenData.token_type || 'Bearer'
    };

    // Determine client type from the original OAuth token
    const clientType = determineClientType(tokenData.access_token);
    const authedUser = user;
    const origin = getFrontendOrigin(req);
    // Preserve step-up return destination across session regeneration
    const stepUpReturnTo = req.session.stepUpReturnTo || null;
    const postLoginReturnToPath = sanitizePostLoginReturnPath(req.session.postLoginReturnToPath) || null;

    // Detect silent SSO: if PingOne returned in < 2 s the user had an active session
    // and was not prompted for credentials. Pass sso_silent=1 to the SPA so it can
    // inform the user. Threshold is 2000 ms — normal credential entry takes 5–30 s.
    const loginStartedAt = req.session.oauthLoginStartedAt || null;
    const loginElapsedMs = loginStartedAt ? Date.now() - loginStartedAt : null;
    const silentSso = loginElapsedMs !== null && loginElapsedMs < 2000;

    // Decode access token to extract consent ACR and may_act for session storage.
    // These are used by the consent gate in agentMcpTokenService and the agent UI.
    let accessTokenAcr = null;
    let accessTokenMayAct = null;
    try {
      const parts = (tokenData.access_token || '').split('.');
      if (parts.length === 3) {
        const atClaims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        accessTokenAcr    = atClaims.acr    || idTokenClaims.acr    || null;
        accessTokenMayAct = atClaims.may_act || null;
      }
    } catch (_) { /* non-fatal — acr / may_act stay null */ }

    console.log('End user OAuth login successful for:', authedUser.username);

    // Regenerate session before storing credentials to prevent session fixation.
    // P3 — failure is now fatal (abort login) to eliminate the session fixation risk.
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('[oauth/user/callback] Session regenerate FAILED — aborting login:', regenErr.message);
        clearAuthCookie(res, _isProd());
        return redirectEndUserOAuthSpaFailure(
          req,
          res,
          { error: 'session_regenerate_failed' },
          postLoginReturnToPath || '/marketing'
        );
      }

      req.session.oauthTokens = oauthTokens;
      req.session.user = authedUser;
      req.session.clientType = clientType;
      req.session.oauthType = 'user';
      // Consent gate: store ACR and may_act from the user access token so the
      // MCP token-exchange guard can check them without re-decoding the JWT.
      req.session.consentAcr = accessTokenAcr;
      req.session.mayAct     = accessTokenMayAct;
      if (stepUpReturnTo) {
        req.session.stepUpReturnTo = stepUpReturnTo;
      }

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[oauth/user/callback] Session save FAILED — aborting login (no _auth cookie):', saveErr.message);
          return req.session.destroy((destroyErr) => {
            if (destroyErr) {
              console.error('[oauth/user/callback] session.destroy after failed save:', destroyErr.message);
            }
            clearAuthCookie(res, _isProd());
            return redirectEndUserOAuthSpaFailure(
              req,
              res,
              { error: 'session_persist_failed' },
              postLoginReturnToPath || '/marketing'
            );
          });
        }
        console.log('[oauth/user/callback] Session saved OK sid=' + (req.session?.id || '').slice(0, 8) + '…');

        // Set a signed auth-state cookie so the session-restore middleware can
        // answer /status and /nl requests even when the session hits a different
        // serverless instance on Vercel.
        setAuthCookie(res, {
          ...authedUser,
          oauthType: 'user',
          expiresAt: oauthTokens.expiresAt,
        }, _isProd());

        // Clear role-switch cookie if this login was triggered by POST /api/auth/switch
        res.clearCookie('_switch_target', { path: '/', sameSite: _isProd() ? 'none' : 'lax', secure: _isProd() });

        if (stepUpReturnTo) {
          return res.redirect(stepUpReturnTo);
        }

        const ssoParam = silentSso ? '&sso_silent=1' : '';
        if (authedUser.role === 'admin') {
          res.redirect(`${origin}/admin?oauth=success${ssoParam}`);
        } else if (postLoginReturnToPath) {
          res.redirect(`${origin}${postLoginReturnToPath}?oauth=success${ssoParam}`);
        } else {
          res.redirect(`${origin}/dashboard?oauth=success${ssoParam}`);
        }
      });
    });
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    const detail = error.pingoneError || 'unknown';
    const desc   = error.pingoneDesc   || '';
    redirectEndUserOAuthSpaFailure(req, res, {
      error:  'callback_failed',
      detail: String(detail).slice(0, 120),
      ...(desc ? { info: String(desc).slice(0, 400) } : {}),
    });
  }
});

/**
 * Step-up MFA: re-authenticate the current user with acr_values to satisfy
 * PingOne's MFA policy.  Called when the transaction server returns 428.
 *
 *   GET /api/auth/oauth/user/stepup?return_to=<url>
 *
 * After PingOne issues a fresh token with the MFA ACR, the normal /callback
 * flow redirects the browser back to `return_to` (defaults to /dashboard).
 */
router.get('/stepup', (req, res) => {
  try {
    // Honor empty STEP_UP_ACR_VALUE (blank = omit acr_values, rely on app's default sign-on policy).
    // `|| 'Multi_Factor'` would swallow '' (falsy) so we use an explicit undefined check instead.
    const acrValue = process.env.STEP_UP_ACR_VALUE !== undefined
      ? process.env.STEP_UP_ACR_VALUE.trim()
      : 'Multi_Factor';
    const returnTo = req.query.return_to || `${getFrontendOrigin(req)}/dashboard`;

    const state = oauthService.generateState();
    const codeVerifier = oauthService.generateCodeVerifier();
    const redirectUri = getUserRedirectUri(req);
    const nonce = crypto.randomBytes(16).toString('hex');
    const url = oauthService.generateAuthorizationUrl(state, codeVerifier, { acr_values: acrValue, nonce, max_age: 0 }, redirectUri);

    // Persist PKCE + state + redirect URI + where to go after MFA
    req.session.oauthState = state;
    req.session.oauthCodeVerifier = codeVerifier;
    req.session.oauthRedirectUri = redirectUri;
    req.session.oauthNonce = nonce;
    req.session.oauthType = 'user';
    req.session.stepUpReturnTo = `${returnTo}?stepup=done`;

    // Vercel / serverless: PKCE cookie fallback
    setPkceCookie(res, { state, codeVerifier, redirectUri, nonce }, _isProd());

    console.log(`[StepUp] Initiating MFA step-up with acr_values=${acrValue}`);
    req.session.save((err) => {
      if (err) {
        console.error('[StepUp] Session save error:', err);
        return res.redirect(`${getFrontendOrigin(req)}/dashboard?error=stepup_init_failed`);
      }
      res.redirect(url);
    });
  } catch (error) {
    console.error('[StepUp] Error initiating step-up:', error);
    res.redirect(`${getFrontendOrigin(req)}/dashboard?error=stepup_init_failed`);
  }
});

/**
 * Get current OAuth session status for end users
 */
router.get('/status', (req, res) => {
  const token = req.session.oauthTokens?.accessToken;
  const hasOAuthToken = !!(token && token !== '_cookie_session');
  // Check expiry so that an expired session token does not report authenticated:true
  // and then cause every downstream API call to return 401 (producing a redirect loop).
  // refreshIfExpiring middleware runs first; if refresh succeeded the token is already
  // updated in req.session before we get here, so this check is transparent for valid sessions.
  const expiresAt = req.session.oauthTokens?.expiresAt;
  const tokenNotExpired = !expiresAt || Date.now() < expiresAt;
  const isAuthenticated = !!(req.session.user && hasOAuthToken && tokenNotExpired && req.session.oauthType === 'user');

  // In-app consent flag — set by POST /api/auth/oauth/user/consent (no PingOne dependency)
  const consentGiven = isAuthenticated && req.session.agentConsentGiven === true;

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
    // accessToken intentionally omitted — token stays on the backend (Backend-for-Frontend (BFF) pattern)
    tokenType: isAuthenticated ? req.session.oauthTokens.tokenType : null,
    expiresAt: isAuthenticated ? req.session.oauthTokens.expiresAt : null,
    clientType: isAuthenticated ? req.session.clientType : null,
    // In-app consent gate field — consumed by BankingAgent.js and agentMcpTokenService
    consentGiven,
    consentedAt: isAuthenticated ? (req.session.agentConsentedAt || null) : null,
    mayAct: isAuthenticated ? (req.session.mayAct || null) : null,
  });
});

/**
 * POST /api/auth/oauth/user/consent
 * Record that the authenticated end-user has accepted the in-app agent consent agreement.
 * Sets req.session.agentConsentGiven = true (no PingOne round-trip needed).
 */
router.post('/consent', (req, res) => {
  const token = req.session.oauthTokens?.accessToken;
  const hasOAuthToken = !!(token && token !== '_cookie_session');
  const isAuthenticated = !!(req.session.user && hasOAuthToken && req.session.oauthType === 'user');

  if (!isAuthenticated) {
    return res.status(401).json({ error: 'not_authenticated', message: 'Must be logged in as a customer to grant agent consent.' });
  }

  req.session.agentConsentGiven  = true;
  req.session.agentConsentedAt   = new Date().toISOString();

  req.session.save((err) => {
    if (err) {
      console.error('[consent] Session save failed:', err.message);
      return res.status(500).json({ error: 'session_save_failed' });
    }
    console.log('[consent] Agent consent granted for user:', req.session.user?.username);
    res.json({ consentGiven: true, consentedAt: req.session.agentConsentedAt });
  });
});

/**
 * DELETE /api/auth/oauth/user/consent
 * Revoke the in-app agent consent for the current session (for testing / demo reset).
 */
router.delete('/consent', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'not_authenticated' });
  }
  req.session.agentConsentGiven = false;
  delete req.session.agentConsentedAt;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'session_save_failed' });
    res.json({ consentGiven: false });
  });
});

/**
 * GET /api/auth/oauth/user/token-claims
 * Returns decoded JWT claims from the end-user session access token (demo display only).
 */
router.get('/token-claims', (req, res) => {
  const tokens = req.session?.oauthTokens;
  const user   = req.session?.user;
  if (!user || !tokens?.accessToken || tokens.accessToken === '_cookie_session') {
    return res.json({ authenticated: false });
  }
  try {
    const parts = tokens.accessToken.split('.');
    if (parts.length !== 3) return res.json({ authenticated: true, decoded: null });
    const header  = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return res.json({
      authenticated: true,
      sessionType: req.session.oauthType || 'unknown',
      clientType:  req.session.clientType || null,
      tokenType:   tokens.tokenType || 'Bearer',
      expiresAt:   tokens.expiresAt || null,
      hasRefreshToken: !!tokens.refreshToken,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
      decoded: { header, payload },
    });
  } catch {
    return res.json({ authenticated: true, decoded: null });
  }
});

/**
 * Logout end user OAuth session and end PingOne SSO session
 */
router.get('/logout', (req, res) => {
  const idToken      = req.session.oauthTokens?.idToken      || null;
  const accessToken  = req.session.oauthTokens?.accessToken  || null;
  const refreshToken = req.session.oauthTokens?.refreshToken || null;
  const postLogoutUri = `${getFrontendOrigin(req)}/logout`;

  // RFC 7009 — revoke tokens before destroying the session (best-effort, non-fatal)
  if (accessToken  && accessToken  !== '_cookie_session') oauthService.revokeToken(accessToken,  'access_token');
  if (refreshToken && refreshToken !== '_cookie_session') oauthService.revokeToken(refreshToken, 'refresh_token');

  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }

    // Redirect to PingOne RP-Initiated Logout so the SSO session is cleared.
    const envId = process.env.PINGONE_ENVIRONMENT_ID;
    const region = process.env.PINGONE_REGION || 'com';
    const pingoneSignoff = `https://auth.pingone.${region}/${envId}/as/signoff`;

    const params = new URLSearchParams({
      post_logout_redirect_uri: postLogoutUri
    });
    if (idToken) {
      params.set('id_token_hint', idToken);
    }

    res.redirect(`${pingoneSignoff}?${params.toString()}`);
  });
});

/**
 * RFC 6749 §6 — Refresh the end-user access token using the stored refresh token.
 * Called by the frontend or auto-refresh middleware when the access token is near expiry.
 */
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.session.oauthTokens?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'no_refresh_token', message: 'No refresh token in session' });
    }
    const tokenData = await oauthService.refreshAccessToken(refreshToken);
    // Update session with new tokens
    req.session.oauthTokens = {
      ...req.session.oauthTokens,
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token || req.session.oauthTokens.refreshToken,
      idToken:      tokenData.id_token      || req.session.oauthTokens.idToken,
      expiresAt:    Date.now() + ((tokenData.expires_in || 3600) * 1000),
      tokenType:    tokenData.token_type    || 'Bearer',
    };
    req.session.save((err) => {
      if (err) console.error('[refresh] Session save error:', err);
    });
    return res.json({ success: true, expiresAt: req.session.oauthTokens.expiresAt });
  } catch (err) {
    console.error('[refresh] Token refresh failed:', err.message);
    return res.status(401).json({ error: 'refresh_failed', message: err.message });
  }
});

/**
 * GET /api/auth/oauth/user/consent-url
 * @deprecated — In-app consent is now handled via POST /consent.
 * Kept for backwards-compat; signals caller to use the in-app modal.
 */
router.get('/consent-url', (req, res) => {
  return res.json({ deprecated: true, useInAppConsent: true });
});

/**
 * POST /api/auth/oauth/user/initiate-otp
 *
 * Email OTP step-up: generate a 6-digit code, store it in the session with a
 * 5-minute TTL, and send it to the user via the PingOne Notifications API.
 * Returns { otpSent, expiresIn, maskedEmail } — no PingOne redirect required.
 */
router.post('/initiate-otp', async (req, res) => {
  const token = req.session.oauthTokens?.accessToken;
  const hasOAuthToken = !!(token && token !== '_cookie_session');
  const isAuthenticated = !!(req.session.user && hasOAuthToken && req.session.oauthType === 'user');
  if (!isAuthenticated) {
    return res.status(401).json({ error: 'not_authenticated', message: 'Must be logged in to initiate step-up.' });
  }

  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  req.session.pendingStepUpOtp = { code, expiresAt };

  req.session.save(async (err) => {
    if (err) {
      console.error('[OTP] Session save error:', err);
      return res.status(500).json({ error: 'session_error' });
    }

    const user = req.session.user;
    console.log(`[OTP] Generated step-up OTP for user ${user?.id} — code=${code}`);

    // Send email (non-fatal if PingOne Notifications not configured)
    try {
      const { sendOtpEmail } = require('../services/emailService');
      await sendOtpEmail(user.id, {
        otpCode: code,
        amount: 0,
        transactionType: 'transaction',
        userName: user.firstName || user.username || 'Customer',
        expiresInMin: 5,
      });
    } catch (emailErr) {
      console.error('[OTP] Email send failed (non-fatal):', emailErr.message);
    }

    res.json({ otpSent: true, expiresIn: 300, email: user.email || '' });
  });
});

/**
 * POST /api/auth/oauth/user/verify-otp
 *
 * Verify the 6-digit code submitted by the user. On success, marks the session
 * as step-up verified so the next tool-call attempt can proceed without
 * re-challenging (single-use — consumed by checkLocalStepUp on the next call).
 */
router.post('/verify-otp', (req, res) => {
  const token = req.session.oauthTokens?.accessToken;
  const hasOAuthToken = !!(token && token !== '_cookie_session');
  const isAuthenticated = !!(req.session.user && hasOAuthToken && req.session.oauthType === 'user');
  if (!isAuthenticated) {
    return res.status(401).json({ error: 'not_authenticated', message: 'Must be logged in to verify OTP.' });
  }

  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'invalid_request', message: 'OTP code is required.' });
  }

  const pending = req.session.pendingStepUpOtp;
  if (!pending || Date.now() > pending.expiresAt) {
    delete req.session.pendingStepUpOtp;
    return res.status(400).json({ error: 'otp_expired', message: 'OTP has expired. Please request a new one.' });
  }

  if (code.trim() !== pending.code) {
    return res.status(400).json({ error: 'invalid_code', message: 'Incorrect code. Please try again.' });
  }

  // Mark session as step-up verified with TTL (consumed by checkLocalStepUp)
  req.session.stepUpVerified = Date.now() + STEP_UP_TTL_MS;
  delete req.session.pendingStepUpOtp;

  req.session.save((err) => {
    if (err) {
      console.error('[OTP] Session save error after verify:', err);
      return res.status(500).json({ error: 'session_error' });
    }
    console.log(`[OTP] Step-up verified for user ${req.session.user?.id}`);
    res.json({ verified: true });
  });
});

module.exports = router;