/**
 * @file pingoneTestRoutes.js
 * @description Routes for PingOne test page - comprehensive testing of PingOne integration
 */

const express = require('express');
const router = express.Router();
const oauthService = require('../services/oauthService');
const configStore = require('../services/configStore');
const { managementService } = require('../services/pingoneManagementService');
const pingOneUserService = require('../services/pingOneUserService');
const apiCallTrackerService = require('../services/apiCallTrackerService');

/**
 * Decode a JWT for display in the UI — server-side only, never exposes raw token to browser.
 * Returns { header: object, payload: object } matching DecodedTokenPanel's expected shape.
 * Returns null on any error (invalid token, bad base64, etc.).
 *
 * @param {string} token - Raw JWT string
 * @returns {{ header: object, payload: object } | null}
 */
function decodeJwtForDisplay(token) {
  if (!token || typeof token !== 'string') { return null; }
  try {
    const parts = token.split('.');
    if (parts.length !== 3) { return null; }
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return { header, payload };
  } catch (_e) {
    return null;
  }
}

/**
 * Helper function to track API calls
 * @param {string} sessionId - Session ID for tracking
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {number} startTime - Start time for duration calculation
 * @param {object} responseData - Response data to track
 * @param {string} category - Category for the API call
 * @param {string} description - Description of the API call
 */
function trackApiCall(sessionId, req, res, startTime, responseData, category, description) {
  const duration = Date.now() - startTime;
  apiCallTrackerService.trackApiCall({
    sessionId,
    method: req.method,
    url: req.originalUrl,
    requestHeaders: req.headers,
    requestBody: req.body,
    responseStatus: res.statusCode || (responseData.success ? 200 : 500),
    responseHeaders: res.getHeaders(),
    responseBody: responseData,
    duration,
    category,
    description
  });
}

/**
 * POST /api/pingone-test/worker-config
 * Save worker token configuration to .env and Vercel variables
 */
router.post('/worker-config', async (req, res) => {
  try {
    const { clientId, clientSecret, authMethod } = req.body;

    if (!clientId || !clientSecret) {
      return res.json({
        success: false,
        error: 'Client ID and Client Secret are required'
      });
    }

    const isVercel = process.env.VERCEL === '1';
    const storageMethod = isVercel ? 'Vercel Environment Variables' : 'Local .env file';

    // Update configStore with the new values (persisted to SQLite/KV)
    await configStore.setConfig({
      pingone_worker_token_client_id: clientId,
      pingone_worker_token_client_secret: clientSecret,
      pingone_worker_token_auth_method: authMethod || 'basic'
    });

    let updateDetails = {};

    if (isVercel) {
      // On Vercel, we can't update environment variables at runtime
      // The user must set them via Vercel dashboard or CLI
      updateDetails = {
        method: 'Vercel Environment Variables',
        message: 'Configuration saved to configStore (SQLite/KV). To persist on Vercel, set PINGONE_WORKER_TOKEN_CLIENT_ID, PINGONE_WORKER_TOKEN_CLIENT_SECRET, and PINGONE_WORKER_TOKEN_AUTH_METHOD in Vercel dashboard or CLI.',
        requiresManualSetup: true
      };
    } else {
      // Local development: update .env file
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '.env');

      try {
        let envContent = '';
        if (fs.existsSync(envPath)) {
          envContent = fs.readFileSync(envPath, 'utf8');
        }

        // Update or add the environment variables
        const lines = envContent.split('\n');
        let updatedLines = [];
        let foundClientId = false;
        let foundClientSecret = false;
        let foundAuthMethod = false;

        for (let line of lines) {
          if (line.startsWith('PINGONE_WORKER_TOKEN_CLIENT_ID=')) {
            updatedLines.push(`PINGONE_WORKER_TOKEN_CLIENT_ID=${clientId}`);
            foundClientId = true;
          } else if (line.startsWith('PINGONE_WORKER_TOKEN_CLIENT_SECRET=')) {
            updatedLines.push(`PINGONE_WORKER_TOKEN_CLIENT_SECRET=${clientSecret}`);
            foundClientSecret = true;
          } else if (line.startsWith('PINGONE_WORKER_TOKEN_AUTH_METHOD=')) {
            updatedLines.push(`PINGONE_WORKER_TOKEN_AUTH_METHOD=${authMethod || 'basic'}`);
            foundAuthMethod = true;
          } else if (line.startsWith('PINGONE_MGMT_CLIENT_ID=') || line.startsWith('PINGONE_MGMT_CLIENT_SECRET=') || line.startsWith('PINGONE_MGMT_TOKEN_AUTH_METHOD=')) {
            // Skip old MGMT variables - we're migrating to WORKER_TOKEN
          } else {
            updatedLines.push(line);
          }
        }

        // Add missing variables
        if (!foundClientId) {
          updatedLines.push(`PINGONE_WORKER_TOKEN_CLIENT_ID=${clientId}`);
        }
        if (!foundClientSecret) {
          updatedLines.push(`PINGONE_WORKER_TOKEN_CLIENT_SECRET=${clientSecret}`);
        }
        if (!foundAuthMethod) {
          updatedLines.push(`PINGONE_WORKER_TOKEN_AUTH_METHOD=${authMethod || 'basic'}`);
        }

        fs.writeFileSync(envPath, updatedLines.join('\n'));
        updateDetails = {
          method: 'Local .env file + SQLite',
          message: 'Configuration saved to .env file and persisted to SQLite. Changes take effect immediately.',
          requiresRestart: false
        };
      } catch (fsError) {
        console.error('[PingOneTest] Failed to update .env file:', fsError.message);
        updateDetails = {
          method: 'SQLite only',
        message: 'Configuration saved to SQLite/KV only. Failed to update .env file: ' + fsError.message,
          requiresRestart: false
        };
      }
    }

    console.log('[PingOneTest] Worker configuration updated:', {
      storageMethod,
      clientId: clientId ? clientId.substring(0, 8) + '...' : 'undefined',
      authMethod
    });

    res.json({
      success: true,
      message: 'Worker configuration saved successfully',
      details: updateDetails
    });
  } catch (error) {
    console.error('[PingOneTest] Worker config save error:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/pingone-test/verify-assets
 * Verify PingOne assets (Apps, Resources, Scopes, Users) using worker token
 */
router.get('/verify-assets', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';
  const requestHeaders = req.headers;

  try {
    await configStore.ensureInitialized();

    console.log('[verify-assets] Starting asset verification');

    // Get worker token using existing oauthService infrastructure
    let workerToken;
    try {
      console.log('[verify-assets] Fetching worker token...');
      workerToken = await oauthService.getAgentClientCredentialsToken();
      console.log('[verify-assets] Worker token obtained successfully');
    } catch (tokenError) {
      console.error('[verify-assets] Failed to obtain worker token:', tokenError.message);
      console.error('[verify-assets] Token error details:', tokenError);
      return res.json({
        success: false,
        error: 'Failed to obtain worker token: ' + tokenError.message,
        assets: null
      });
    }

    // Initialize management service with the worker token
    try {
      console.log('[verify-assets] Initializing management service...');
      managementService.initialize(workerToken);
      console.log('[verify-assets] Management service initialized');
    } catch (initError) {
      console.error('[verify-assets] Management API not configured:', initError.message);
      return res.json({
        success: false,
        error: 'Management API not configured: ' + initError.message,
        assets: null
      });
    }

    // Initialize pingOneUserService with worker credentials
    try {
      console.log('[verify-assets] Initializing pingOneUserService...');
      pingOneUserService.initialize();
      console.log('[verify-assets] pingOneUserService initialized');
    } catch (initError) {
      console.error('[verify-assets] pingOneUserService initialization failed:', initError.message);
      return res.json({
        success: false,
        error: 'pingOneUserService initialization failed: ' + initError.message,
        assets: null
      });
    }

    // Expected assets for missing-item analysis
    const EXPECTED_APP_NAMES = [
      'Super Banking User App',
      'Super Banking Admin App',
      'Super Banking MCP Token Exchanger',
      'Super Banking AI Agent App'
    ];
    const EXPECTED_BANKING_SCOPES = [
      'banking:accounts:read',
      'banking:accounts:write',
      'banking:transactions:read',
      'banking:transactions:write'
    ];

    // Get all assets in parallel
    const [appsResult, resourcesResult, usersResult] = await Promise.all([
      managementService.getApplications(),
      managementService.getResourceServers(),
      pingOneUserService.listUsers({ limit: 50 })
    ]);

    // Enrich each app with its granted resources (parallel)
    const apps = appsResult.success ? (appsResult.applications || []) : [];
    const appResourceResults = await Promise.all(
      apps.map(app => managementService.getApplicationResources(app.id)
        .then(r => ({ appId: app.id, resources: r.success ? r.resources : [] }))
        .catch(() => ({ appId: app.id, resources: [] }))
      )
    );
    const appResourcesMap = {};
    appResourceResults.forEach(r => { appResourcesMap[r.appId] = r.resources; });

    // Get scopes for the first resource server (for summary tile)
    let scopesAsset = { status: 'failed', count: 0, error: 'No resource servers available', data: [] };
    if (resourcesResult.success && resourcesResult.resourceServers && resourcesResult.resourceServers.length > 0) {
      const resourceServerId = resourcesResult.resourceServers[0].id;
      const scopesResult = await managementService.getScopes(resourceServerId);
      scopesAsset = {
        status: scopesResult.success ? 'passed' : 'failed',
        count: scopesResult.scopes ? scopesResult.scopes.length : 0,
        error: scopesResult.error,
        data: scopesResult.scopes || [],
        resourceServerId
      };
    }

    // Compute missing analysis
    const missingApps = EXPECTED_APP_NAMES.filter(
      name => !apps.some(a => a.name === name)
    );
    const missingResourcesByApp = {};
    const missingScopesByApp = {};
    apps.forEach(app => {
      const grantedResources = appResourcesMap[app.id] || [];
      const allGrantedScopes = grantedResources.flatMap(r => r.scopes || []);
      const missingScopes = EXPECTED_BANKING_SCOPES.filter(s => !allGrantedScopes.includes(s));
      if (missingScopes.length > 0) {
        missingScopesByApp[app.id] = missingScopes;
      }
    });

    const assets = {
      applications: {
        status: appsResult.success ? 'passed' : 'failed',
        count: apps.length,
        error: appsResult.error,
        data: apps.map(app => ({
          id: app.id,
          name: app.name,
          type: app.type,
          grantedResources: appResourcesMap[app.id] || []
        }))
      },
      resources: {
        status: resourcesResult.success ? 'passed' : 'failed',
        count: resourcesResult.resourceServers ? resourcesResult.resourceServers.length : 0,
        error: resourcesResult.error,
        data: resourcesResult.resourceServers || []
      },
      scopes: scopesAsset,
      users: {
        status: usersResult._embedded && usersResult._embedded.users ? 'passed' : 'failed',
        count: usersResult._embedded && usersResult._embedded.users ? usersResult._embedded.users.length : 0,
        error: usersResult.error,
        data: usersResult._embedded ? usersResult._embedded.users || [] : []
      },
      missing: {
        apps: missingApps,
        resourcesByApp: missingResourcesByApp,
        scopesByApp: missingScopesByApp
      },
      expectedApps: EXPECTED_APP_NAMES,
      expectedScopes: EXPECTED_BANKING_SCOPES
    };
    const responseData = {
      success: true,
      assets
    };

    trackApiCall(sessionId, req, res, startTime, responseData, 'pingone-test', 'Verify PingOne assets (Apps, Resources, Scopes, Users)');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Asset verification error:', error.message);
    const responseData = {
      success: false,
      error: error.message,
      assets: null
    };

    trackApiCall(sessionId, req, res, startTime, responseData, 'pingone-test', 'Verify PingOne assets (Apps, Resources, Scopes, Users)');
    res.json(responseData);
  }
});

/**
 * GET /api/pingone-test/authz-token
 * Test getting Authorization Code token from user session
 */
router.get('/authz-token', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';

  try {
    const oauthTokens = req.session.oauthTokens;
    if (!oauthTokens || !oauthTokens.accessToken) {
      const responseData = {
        success: false,
        error: 'No authorization token found in session. User must log in first.'
      };
      trackApiCall(sessionId, req, res, startTime, responseData, 'token-acquisition', 'Get Authorization Code token from user session');
      return res.json(responseData);
    }

    // Verify the token is still valid
    const now = Date.now();
    if (oauthTokens.expiresAt && now > oauthTokens.expiresAt) {
      const responseData = {
        success: false,
        error: 'Authorization token has expired.'
      };
      trackApiCall(sessionId, req, res, startTime, responseData, 'token-acquisition', 'Get Authorization Code token from user session');
      return res.json(responseData);
    }

    const responseData = {
      success: true,
      token: oauthTokens.accessToken ? oauthTokens.accessToken.substring(0, 20) + '...' : 'undefined',
      decoded: oauthTokens.accessToken ? decodeJwtForDisplay(oauthTokens.accessToken) : null,
      expiresAt: oauthTokens.expiresAt
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-acquisition', 'Get Authorization Code token from user session');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Authz token test error:', error.message);
    const responseData = {
      success: false,
      error: error.message
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-acquisition', 'Get Authorization Code token from user session');
    res.json(responseData);
  }
});

/**
 * GET /api/pingone-test/agent-token
 * Test getting Agent token (client credentials)
 */
router.get('/agent-token', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';

  try {
    await configStore.ensureInitialized();

    const tokenData = await oauthService.getAgentClientCredentialsTokenWithExpiry();

    const responseData = {
      success: true,
      token: tokenData.token ? tokenData.token.substring(0, 20) + '...' : 'undefined',
      decoded: tokenData.token ? decodeJwtForDisplay(tokenData.token) : null,
      expires_in: tokenData.expiresIn
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-acquisition', 'Get Agent token (client credentials)');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Agent token test error:', error.message);
    const responseData = {
      success: false,
      error: error.message
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-acquisition', 'Get Agent token (client credentials)');
    res.json(responseData);
  }
});

/**
 * GET /api/pingone-test/exchange-user-to-mcp
 * Test exchange user token (authz) for MCP token
 */
router.get('/exchange-user-to-mcp', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';

  try {
    const oauthTokens = req.session.oauthTokens;
    if (!oauthTokens || !oauthTokens.accessToken) {
      const responseData = {
        success: false,
        error: 'No authorization token found in session. User must log in first.'
      };
      trackApiCall(sessionId, req, res, startTime, responseData, 'token-exchange', 'Exchange user token (authz) for MCP token');
      return res.json(responseData);
    }

    await configStore.ensureInitialized();

    // Get agent token for exchange
    const agentToken = await oauthService.getAgentClientCredentialsToken();

    // Perform token exchange with actor token
    const mcpScopes1 = (process.env.MCP_TOKEN_EXCHANGE_SCOPES || 'banking:accounts:read banking:accounts:write banking:transactions:read banking:transactions:write').trim().split(/\s+/);
    const exchangedToken = await oauthService.performTokenExchangeWithActor(
      oauthTokens.accessToken,
      agentToken,
      configStore.getEffective('pingone_resource_mcp_server_uri'),
      mcpScopes1
    );

    const responseData = {
      success: true,
      token: exchangedToken ? exchangedToken.substring(0, 20) + '...' : 'undefined',
      decoded: exchangedToken ? decodeJwtForDisplay(exchangedToken) : null
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-exchange', 'Exchange user token (authz) for MCP token');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Exchange user to MCP error:', error.message);
    const responseData = {
      success: false,
      error: error.message
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-exchange', 'Exchange user token (authz) for MCP token');
    res.json(responseData);
  }
});

/**
 * GET /api/pingone-test/exchange-user-agent-to-mcp
 * Test exchange user token (authz) and Agent Token (client creds) for MCP token
 */
router.get('/exchange-user-agent-to-mcp', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';

  try {
    const oauthTokens = req.session.oauthTokens;
    if (!oauthTokens || !oauthTokens.accessToken) {
      const responseData = {
        success: false,
        error: 'No authorization token found in session. User must log in first.'
      };
      trackApiCall(sessionId, req, res, startTime, responseData, 'token-exchange', 'Exchange user token (authz) and Agent Token (client creds) for MCP token');
      return res.json(responseData);
    }

    await configStore.ensureInitialized();

    // Get agent token
    const agentToken = await oauthService.getAgentClientCredentialsToken();

    // Perform token exchange with both user and agent tokens
    const mcpScopes2 = (process.env.MCP_TOKEN_EXCHANGE_SCOPES || 'banking:accounts:read banking:accounts:write banking:transactions:read banking:transactions:write').trim().split(/\s+/);
    const exchangedToken = await oauthService.performTokenExchangeWithActor(
      oauthTokens.accessToken,
      agentToken,
      configStore.getEffective('pingone_resource_mcp_gateway_uri'),
      mcpScopes2
    );

    const responseData = {
      success: true,
      token: exchangedToken ? exchangedToken.substring(0, 20) + '...' : 'undefined',
      decoded: exchangedToken ? decodeJwtForDisplay(exchangedToken) : null
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-exchange', 'Exchange user token (authz) and Agent Token (client creds) for MCP token');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Exchange user+agent to MCP error:', error.message);
    const responseData = {
      success: false,
      error: error.message
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-exchange', 'Exchange user token (authz) and Agent Token (client creds) for MCP token');
    res.json(responseData);
  }
});

/**
 * GET /api/pingone-test/exchange-user-to-agent-to-mcp
 * Test exchange user token for Agent Token, then use those 2 for MCP token
 */
router.get('/exchange-user-to-agent-to-mcp', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';

  try {
    const oauthTokens = req.session.oauthTokens;
    if (!oauthTokens || !oauthTokens.accessToken) {
      const responseData = {
        success: false,
        error: 'No authorization token found in session. User must log in first.'
      };
      trackApiCall(sessionId, req, res, startTime, responseData, 'token-exchange', 'Exchange user token for Agent Token, then use those 2 for MCP token');
      return res.json(responseData);
    }

    await configStore.ensureInitialized();

    // Step 1: Exchange user token for agent token (simple token exchange)
    const agentToken = await oauthService.performTokenExchange(
      oauthTokens.accessToken,
      configStore.getEffective('pingone_resource_agent_gateway_uri'),
      ['banking:ai:agent:read']
    );

    // Step 2: Use both user token and agent token to exchange for MCP token
    const mcpScopes3 = (process.env.MCP_TOKEN_EXCHANGE_SCOPES || 'banking:accounts:read banking:accounts:write banking:transactions:read banking:transactions:write').trim().split(/\s+/);
    const mcpToken = await oauthService.performTokenExchangeWithActor(
      oauthTokens.accessToken,
      agentToken,
      configStore.getEffective('pingone_resource_mcp_server_uri'),
      mcpScopes3
    );

    const responseData = {
      success: true,
      agentToken: agentToken ? agentToken.substring(0, 20) + '...' : 'undefined',
      mcpToken: mcpToken ? mcpToken.substring(0, 20) + '...' : 'undefined',
      agentTokenDecoded: agentToken ? decodeJwtForDisplay(agentToken) : null,
      mcpTokenDecoded: mcpToken ? decodeJwtForDisplay(mcpToken) : null
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-exchange', 'Exchange user token for Agent Token, then use those 2 for MCP token');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Exchange user→agent→MCP error:', error.message);
    const responseData = {
      success: false,
      error: error.message
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-exchange', 'Exchange user token for Agent Token, then use those 2 for MCP token');
    res.json(responseData);
  }
});

/**
 * GET /api/pingone-test/worker-token
 * Get worker token for PingOne Management API calls
 * Uses client credentials from MCP token exchanger app
 */
router.get('/worker-token', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';

  try {
    await configStore.ensureInitialized();

    const workerTokenData = await oauthService.getAgentClientCredentialsTokenWithExpiry();
    
    const responseData = {
      success: true,
      token: workerTokenData.token ? workerTokenData.token.substring(0, 20) + '...' : 'undefined',
      decoded: workerTokenData.token ? decodeJwtForDisplay(workerTokenData.token) : null,
      expiresAt: workerTokenData.expiresAt
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-acquisition', 'Get worker token for PingOne Management API calls');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Worker token error:', error.message);
    const responseData = {
      success: false,
      error: error.message
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'token-acquisition', 'Get worker token for PingOne Management API calls');
    res.json(responseData);
  }
});

/**
 * GET /api/pingone-test/config
 * Get PingOne configuration from environment
 */
router.get('/config', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';

  try {
    await configStore.ensureInitialized();

    const config = {
      environmentId: configStore.getEffective('pingone_environment_id'),
      region: configStore.getEffective('pingone_region'),
      adminClientId: configStore.getEffective('admin_client_id'),
      userClientId: configStore.getEffective('user_client_id'),
      mcpTokenExchangerClientId: configStore.getEffective('pingone_mcp_token_exchanger_client_id'),
      aiAgentClientId: configStore.getEffective('pingone_ai_agent_client_id'),
      resourceMcpServerUri: configStore.getEffective('pingone_resource_mcp_server_uri'),
      resourceMcpGatewayUri: configStore.getEffective('pingone_resource_mcp_gateway_uri'),
      resourceAgentGatewayUri: configStore.getEffective('pingone_resource_agent_gateway_uri'),
      // Worker token credentials (for pre-populating the form)
      mgmtClientId: process.env.PINGONE_WORKER_TOKEN_CLIENT_ID || configStore.getEffective('pingone_worker_token_client_id') || configStore.getEffective('pingone_mgmt_client_id'),
      mgmtClientSecret: process.env.PINGONE_WORKER_TOKEN_CLIENT_SECRET || configStore.getEffective('pingone_worker_token_client_secret') || configStore.getEffective('pingone_mgmt_client_secret'),
      mgmtTokenAuthMethod: process.env.PINGONE_WORKER_TOKEN_AUTH_METHOD || configStore.getEffective('pingone_worker_token_auth_method') || configStore.getEffective('pingone_mgmt_token_auth_method') || 'basic',
      // Two-exchange delegation (RFC 8693 double-hop)
      twoExchangeResourceUri: process.env.PINGONE_RESOURCE_TWO_EXCHANGE_URI || configStore.getEffective('pingone_resource_two_exchange_uri') || null,
      ffTwoExchangeDelegation: (process.env.FF_TWO_EXCHANGE_DELEGATION === 'true') || (configStore.getEffective('ff_two_exchange_delegation') === 'true') || false
    };

    // Partially mask secrets for display (show first 8 chars)
    const maskedConfig = Object.entries(config).reduce((acc, [key, value]) => {
      if (key.includes('Secret') || key.includes('secret')) {
        if (value && typeof value === 'string' && value.length > 8) {
          acc[key] = value.substring(0, 8) + '...';
        } else if (value) {
          acc[key] = '***';
        } else {
          acc[key] = '';
        }
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});

    const responseData = {
      success: true,
      config: maskedConfig
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'config', 'Get PingOne configuration from environment');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Config error:', error.message);
    const responseData = {
      success: false,
      error: error.message
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'config', 'Get PingOne configuration from environment');
    res.status(500).json(responseData);
  }
});

/**
 * POST /api/pingone-test/token-exchange
 * Test token exchange (1-exchange and 2-exchange)
 */
router.post('/token-exchange', async (req, res) => {
  try {
    await configStore.ensureInitialized();
    
    const { mode = 'single', subjectToken, actorToken } = req.body;
    const mcpUri = configStore.getEffective('pingone_resource_mcp_server_uri');
    const scopes = (process.env.MCP_TOKEN_EXCHANGE_SCOPES || 'banking:accounts:read banking:accounts:write banking:transactions:read banking:transactions:write').trim().split(/\s+/);
    
    let result;
    if (mode === 'single') {
      result = await oauthService.performTokenExchange(subjectToken, mcpUri, scopes);
    } else if (mode === 'double') {
      result = await oauthService.performTokenExchangeWithActor(subjectToken, actorToken, mcpUri, scopes);
    } else {
      throw new Error('Invalid mode. Use "single" or "double"');
    }
    
    // Decode token to show claims
    const parts = result.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    
    res.json({
      success: true,
      mode,
      token: result,
      claims: payload
    });
  } catch (error) {
    console.error('[PingOneTest] Token exchange error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/pingone-test/apps
 * Test PingOne Applications via Management API
 */
router.get('/apps', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';

  try {
    await configStore.ensureInitialized();

    // Initialize management service
    try {
      managementService.initialize();
    } catch (initError) {
      const responseData = {
        success: false,
        error: 'Management API not configured: ' + initError.message,
        apps: []
      };
      trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Applications via Management API');
      return res.json(responseData);
    }

    const result = await managementService.getApplications();

    const responseData = {
      success: result.success,
      apps: result.applications || [],
      count: result.applications?.length || 0,
      error: result.error
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Applications via Management API');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Apps test error:', error.message);
    const responseData = {
      success: false,
      error: error.message,
      apps: []
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Applications via Management API');
    res.json(responseData);
  }
});

/**
 * GET /api/pingone-test/resources
 * Test PingOne Resource Servers via Management API
 */
router.get('/resources', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';

  try {
    await configStore.ensureInitialized();

    // Initialize management service
    try {
      managementService.initialize();
    } catch (initError) {
      const responseData = {
        success: false,
        error: 'Management API not configured: ' + initError.message,
        resources: []
      };
      trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Resource Servers via Management API');
      return res.json(responseData);
    }

    const result = await managementService.getResourceServers();

    const responseData = {
      success: result.success,
      resources: result.resourceServers || [],
      count: result.resourceServers?.length || 0,
      error: result.error
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Resource Servers via Management API');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Resources test error:', error.message);
    const responseData = {
      success: false,
      error: error.message,
      resources: []
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Resource Servers via Management API');
    res.json(responseData);
  }
});

/**
 * GET /api/pingone-test/scopes
 * Test PingOne Scopes via Management API
 */
router.get('/scopes', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';

  try {
    await configStore.ensureInitialized();

    // Initialize management service
    try {
      managementService.initialize();
    } catch (initError) {
      const responseData = {
        success: false,
        error: 'Management API not configured: ' + initError.message,
        scopes: []
      };
      trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Scopes via Management API');
      return res.json(responseData);
    }

    const { resourceServerId } = req.query;

    if (!resourceServerId) {
      const responseData = {
        success: false,
        error: 'resourceServerId query parameter is required',
        scopes: []
      };
      trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Scopes via Management API');
      return res.json(responseData);
    }

    const result = await managementService.getScopes(resourceServerId);

    const responseData = {
      success: result.success,
      scopes: result.scopes || [],
      count: result.scopes?.length || 0,
      resourceServerId,
      error: result.error
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Scopes via Management API');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Scopes test error:', error.message);
    const responseData = {
      success: false,
      error: error.message,
      scopes: []
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Scopes via Management API');
    res.json(responseData);
  }
});

/**
 * GET /api/pingone-test/users
 * Test PingOne Users via Management API using worker token
 */
router.get('/users', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.query.sessionId || 'pingone-test';

  try {
    await configStore.ensureInitialized();

    // Initialize user service
    try {
      pingOneUserService.initialize();
      console.log('[PingOneTest] pingOneUserService initialized successfully');
    } catch (initError) {
      console.error('[PingOneTest] pingOneUserService initialization failed:', initError.message);
      const responseData = {
        success: false,
        error: 'User service not configured: ' + initError.message,
        users: []
      };
      trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Users via Management API using worker token');
      return res.json(responseData);
    }

    const result = await pingOneUserService.listUsers({ limit: 50 });
    console.log('[PingOneTest] listUsers result:', JSON.stringify(result, null, 2));

    const users = result._embedded?.users || [];

    const responseData = {
      success: true,
      users,
      count: users.length,
      error: null
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Users via Management API using worker token');
    res.json(responseData);
  } catch (error) {
    console.error('[PingOneTest] Users test error:', error.message);
    console.error('[PingOneTest] PingOne API error status:', error.response?.status);
    console.error('[PingOneTest] PingOne API error data:', error.response?.data);
    const responseData = {
      success: false,
      error: error.message,
      users: []
    };
    trackApiCall(sessionId, req, res, startTime, responseData, 'management-api', 'Test PingOne Users via Management API using worker token');
    res.json(responseData);
  }
});

/**
 * POST /api/pingone-test/token-exchange
 * Test token exchange (1-exchange and 2-exchange)
 */
router.post('/token-exchange', async (req, res) => {
  try {
    await configStore.ensureInitialized();
    
    const { mode = 'single', subjectToken, actorToken } = req.body;
    const mcpUri = configStore.getEffective('pingone_resource_mcp_server_uri');
    const scopes = (process.env.MCP_TOKEN_EXCHANGE_SCOPES || 'banking:accounts:read banking:accounts:write banking:transactions:read banking:transactions:write').trim().split(/\s+/);
    
    let result;
    if (mode === 'single') {
      result = await oauthService.performTokenExchange(subjectToken, mcpUri, scopes);
    } else if (mode === 'double') {
      result = await oauthService.performTokenExchangeWithActor(subjectToken, actorToken, mcpUri, scopes);
    } else {
      throw new Error('Invalid mode. Use "single" or "double"');
    }
    
    // Decode token to show claims
    const parts = result.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    
    res.json({
      success: true,
      mode,
      token: result,
      claims: payload
    });
  } catch (error) {
    console.error('[PingOneTest] Token exchange error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
