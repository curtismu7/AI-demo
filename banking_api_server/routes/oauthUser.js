const express = require('express');
const router = express.Router();
const oauthService = require('../services/oauthUserService');
const configStore = require('../services/configStore');
const dataStore = require('../data/store');
const { determineClientType } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const { getFrontendOrigin, getUserRedirectUri } = require('../services/oauthRedirectUris');
const oauthUserConfig = require('../config/oauthUser');

/**
 * Create sample accounts and transactions for new customers
 */
async function createSampleDataForCustomer(userId, firstName, lastName) {
  try {
    // Create sample accounts
    const checkingAccount = await dataStore.createAccount({
      id: uuidv4(),
      userId: userId,
      accountNumber: `100${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`,
      accountType: 'checking',
      balance: Math.floor(Math.random() * 5000) + 1000, // Random balance between 1000-6000
      currency: 'USD',
      createdAt: new Date(),
      isActive: true
    });

    const savingsAccount = await dataStore.createAccount({
      id: uuidv4(),
      userId: userId,
      accountNumber: `100${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`,
      accountType: 'savings',
      balance: Math.floor(Math.random() * 15000) + 5000, // Random balance between 5000-20000
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

    console.log(`Created sample data for customer ${firstName} ${lastName}: 2 accounts, ${transactions.length} transactions`);
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
    // Guard: end-user flow needs user client + env (not admin_client_id)
    if (!configStore.isUserOAuthConfigured()) {
      return res.redirect(`${getFrontendOrigin(req)}/config?error=not_configured`);
    }

    // Drop a prior *admin* OAuth session so Customer sign-in does not reuse admin tokens/role.
    // Do not clear oauthType === 'user' (already signed in as customer, or re-initiating flow).
    const isEndUserSession = req.session?.oauthType === 'user';
    const looksLikeAdminSession =
      req.session?.oauthTokens?.accessToken &&
      !isEndUserSession &&
      (req.session.oauthType === 'admin' || req.session?.user?.role === 'admin');
    if (looksLikeAdminSession) {
      delete req.session.oauthTokens;
      delete req.session.user;
      delete req.session.clientType;
      delete req.session.oauthType;
    }

    const state = oauthService.generateState();
    const codeVerifier = oauthService.generateCodeVerifier();
    const redirectUri = getUserRedirectUri(req);
    const url = oauthService.generateAuthorizationUrl(state, codeVerifier, {}, redirectUri);

    // Store state, verifier and redirect URI in session for CSRF protection and PKCE
    req.session.oauthState = state;
    req.session.oauthCodeVerifier = codeVerifier;
    req.session.oauthRedirectUri = redirectUri;
    req.session.oauthType = 'user'; // Distinguish from admin OAuth
    
    console.log('Redirecting end user to PingOne Core:', url);
    res.redirect(url);
  } catch (error) {
    console.error('OAuth login error:', error);
    res.redirect(`${getFrontendOrigin(req)}/login?error=oauth_init_failed`);
  }
});

/**
 * Handle OAuth callback for end users
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    // Check for OAuth errors
    if (error) {
      console.error('OAuth error:', error);
      return res.redirect(`${getFrontendOrigin(req)}/login?error=oauth_error`);
    }
    
    // Validate state parameter
    if (!state || state !== req.session.oauthState) {
      console.error('Invalid state parameter');
      return res.redirect(`${getFrontendOrigin(req)}/login?error=invalid_state`);
    }
    
    // Validate code parameter
    if (!code) {
      console.error('No authorization code received');
      return res.redirect(`${getFrontendOrigin(req)}/login?error=no_code`);
    }
    
    // Retrieve and clear the PKCE code verifier and redirect URI from session
    const codeVerifier = req.session.oauthCodeVerifier;
    const redirectUri = req.session.oauthRedirectUri;
    delete req.session.oauthCodeVerifier;
    delete req.session.oauthRedirectUri;
    delete req.session.oauthState;

    // Exchange code for token (with PKCE verifier)
    const tokenData = await oauthService.exchangeCodeForToken(code, codeVerifier, redirectUri);
    console.log('Token received for end user');
    
    // Get user information from PingOne Core
    const userInfo = await oauthService.getUserInfo(tokenData.access_token);
    console.log('User info from PingOne Core:', JSON.stringify(userInfo, null, 2));
    
    // Create user object from OAuth data
    const oauthUser = oauthService.createUserFromOAuth(userInfo);
    
    // Check if user already exists in our system
    let user = dataStore.getUserByUsername(oauthUser.username);
    console.log('Looking for existing user:', oauthUser.username);
    console.log('Found user:', user);
    
    if (!user) {
      // Create new end user (customer role)
      console.log('Creating new end user as customer:', oauthUser.username);
      oauthUser.role = 'customer'; // Ensure customer role
    } else {
      console.log('Found existing user:', user.username, 'with role:', user.role);
      // DB may still list this identity as admin (admin-app sign-in). End-user OAuth
      // must not promote that into the customer session — session role is set below.
      oauthUser.role = user.role;
    }
    
    if (!user) {
      // Create new user from OAuth data
      console.log('Creating new user with data:', oauthUser);
      user = await dataStore.createUser({
        ...oauthUser,
        password: null // OAuth users don't have passwords
      });
      console.log('Created user:', user);
      
      // Create sample data for new customers (only if they have no accounts yet)
      if (user.role === 'customer') {
        try {
          const existingAccounts = dataStore.getAccountsByUserId(user.id);
          if (existingAccounts.length === 0) {
            await createSampleDataForCustomer(user.id, user.firstName, user.lastName);
          } else {
            console.log(`User ${user.username} already has ${existingAccounts.length} account(s), skipping sample data creation`);
          }
        } catch (error) {
          console.error('Failed to create sample data for new customer:', error);
          // Don't fail the login if sample data creation fails
        }
      }
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
      console.log('Attempting to update user with ID:', user.id);
      console.log('Current user object:', user);
      
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
    // Customer app session always uses the configured end-user role (never admin UI).
    const authedUser = { ...user, role: oauthUserConfig.userRole };
    const origin = getFrontendOrigin(req);
    // Preserve step-up return destination across session regeneration
    const stepUpReturnTo = req.session.stepUpReturnTo || null;

    console.log('End user OAuth login successful for:', authedUser.username);

    // Regenerate session before storing credentials to prevent session fixation
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('Session regenerate error:', regenErr);
        return res.redirect(`${origin}/login?error=session_error`);
      }

      req.session.oauthTokens = oauthTokens;
      req.session.user = authedUser;
      req.session.clientType = clientType;
      req.session.oauthType = 'user';
      if (stepUpReturnTo) {
        req.session.stepUpReturnTo = stepUpReturnTo;
      }

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.redirect(`${origin}/login?error=session_error`);
        }

        if (stepUpReturnTo) {
          return res.redirect(stepUpReturnTo);
        }

        if (authedUser.role === 'admin') {
          const adminUrl = process.env.FRONTEND_ADMIN_URL || `${origin}/admin`;
          res.redirect(`${adminUrl}?oauth=success`);
        } else {
          const dashboardUrl = process.env.FRONTEND_DASHBOARD_URL || `${origin}/dashboard`;
          res.redirect(`${dashboardUrl}?oauth=success&stepup=done`);
        }
      });
    });
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${getFrontendOrigin(req)}/login?error=callback_failed`);
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
    const acrValue = process.env.STEP_UP_ACR_VALUE || 'Multi_factor';
    const returnTo = req.query.return_to ||
      process.env.FRONTEND_DASHBOARD_URL ||
      'http://localhost:4000/dashboard';

    const state = oauthService.generateState();
    const codeVerifier = oauthService.generateCodeVerifier();
    const redirectUri = getUserRedirectUri(req);
    const url = oauthService.generateAuthorizationUrl(state, codeVerifier, { acr_values: acrValue }, redirectUri);

    // Persist PKCE + state + redirect URI + where to go after MFA
    req.session.oauthState = state;
    req.session.oauthCodeVerifier = codeVerifier;
    req.session.oauthRedirectUri = redirectUri;
    req.session.oauthType = 'user';
    req.session.stepUpReturnTo = `${returnTo}?stepup=done`;

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
  const isAuthenticated = !!(req.session.user && req.session.oauthTokens?.accessToken && req.session.oauthType === 'user');
  
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
 * Logout end user OAuth session and end PingOne SSO session
 */
router.get('/logout', (req, res) => {
  const idToken = req.session.oauthTokens?.idToken || null;
  const postLogoutUri = `${getFrontendOrigin(req)}/login`;

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
 * Refresh token (placeholder for future implementation)
 */
router.get('/refresh', (req, res) => {
  res.status(501).json({ error: 'Token refresh not implemented yet' });
});

module.exports = router;