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

/**
 * GET /api/pingone-test/worker-token
 * Get worker token for PingOne Management API calls
 * Uses client credentials from MCP token exchanger app
 */
router.get('/worker-token', async (_req, res) => {
  try {
    await configStore.ensureInitialized();
    
    const workerToken = await oauthService.getAgentClientCredentialsToken();
    
    res.json({
      success: true,
      token: workerToken,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[PingOneTest] Worker token error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/pingone-test/config
 * Get PingOne configuration from environment
 */
router.get('/config', async (_req, res) => {
  try {
    await configStore.ensureInitialized();
    
    const config = {
      environmentId: configStore.getEffective('pingone_environment_id'),
      region: configStore.getEffective('pingone_region'),
      adminClientId: configStore.getEffective('pingone_admin_client_id'),
      userClientId: configStore.getEffective('pingone_user_client_id'),
      mcpTokenExchangerClientId: configStore.getEffective('pingone_mcp_token_exchanger_client_id'),
      aiAgentClientId: configStore.getEffective('pingone_ai_agent_client_id'),
      resourceMcpServerUri: configStore.getEffective('PINGONE_RESOURCE_MCP_SERVER_URI'),
      resourceMcpGatewayUri: configStore.getEffective('PINGONE_RESOURCE_MCP_GATEWAY_URI'),
      resourceAgentGatewayUri: configStore.getEffective('PINGONE_RESOURCE_AGENT_GATEWAY_URI')
    };
    
    // Mask sensitive values
    const maskedConfig = Object.entries(config).reduce((acc, [key, value]) => {
      if (key.includes('Secret') || key.includes('secret')) {
        acc[key] = '***MASKED***';
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
    
    res.json({
      success: true,
      config: maskedConfig
    });
  } catch (error) {
    console.error('[PingOneTest] Config error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
    const mcpUri = configStore.getEffective('PINGONE_RESOURCE_MCP_SERVER_URI');
    const scopes = (process.env.MCP_TOKEN_EXCHANGE_SCOPES || 'banking:read banking:write').trim().split(/\s+/);
    
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
router.get('/apps', async (_req, res) => {
  try {
    await configStore.ensureInitialized();
    
    // Initialize management service
    try {
      managementService.initialize();
    } catch (initError) {
      return res.json({
        success: false,
        error: 'Management API not configured: ' + initError.message,
        apps: []
      });
    }
    
    const result = await managementService.getApplications();
    
    res.json({
      success: result.success,
      apps: result.applications || [],
      count: result.applications?.length || 0,
      error: result.error
    });
  } catch (error) {
    console.error('[PingOneTest] Apps test error:', error.message);
    res.json({
      success: false,
      error: error.message,
      apps: []
    });
  }
});

/**
 * GET /api/pingone-test/resources
 * Test PingOne Resource Servers via Management API
 */
router.get('/resources', async (_req, res) => {
  try {
    await configStore.ensureInitialized();
    
    // Initialize management service
    try {
      managementService.initialize();
    } catch (initError) {
      return res.json({
        success: false,
        error: 'Management API not configured: ' + initError.message,
        resources: []
      });
    }
    
    const result = await managementService.getResourceServers();
    
    res.json({
      success: result.success,
      resources: result.resourceServers || [],
      count: result.resourceServers?.length || 0,
      error: result.error
    });
  } catch (error) {
    console.error('[PingOneTest] Resources test error:', error.message);
    res.json({
      success: false,
      error: error.message,
      resources: []
    });
  }
});

/**
 * GET /api/pingone-test/scopes
 * Test PingOne Scopes via Management API
 */
router.get('/scopes', async (req, res) => {
  try {
    await configStore.ensureInitialized();
    
    // Initialize management service
    try {
      managementService.initialize();
    } catch (initError) {
      return res.json({
        success: false,
        error: 'Management API not configured: ' + initError.message,
        scopes: []
      });
    }
    
    const { resourceServerId } = req.query;
    
    if (!resourceServerId) {
      return res.json({
        success: false,
        error: 'resourceServerId query parameter is required',
        scopes: []
      });
    }
    
    const result = await managementService.getScopes(resourceServerId);
    
    res.json({
      success: result.success,
      scopes: result.scopes || [],
      count: result.scopes?.length || 0,
      resourceServerId,
      error: result.error
    });
  } catch (error) {
    console.error('[PingOneTest] Scopes test error:', error.message);
    res.json({
      success: false,
      error: error.message,
      scopes: []
    });
  }
});

/**
 * GET /api/pingone-test/users
 * Test PingOne Users via Management API
 */
router.get('/users', async (_req, res) => {
  try {
    await configStore.ensureInitialized();
    
    // Initialize user service
    try {
      pingOneUserService.initialize();
    } catch (initError) {
      return res.json({
        success: false,
        error: 'User service not configured: ' + initError.message,
        users: []
      });
    }
    
    const result = await pingOneUserService.listUsers({ limit: 50 });
    
    const users = result._embedded?.users || [];
    
    res.json({
      success: true,
      users,
      count: users.length,
      error: null
    });
  } catch (error) {
    console.error('[PingOneTest] Users test error:', error.message);
    res.json({
      success: false,
      error: error.message,
      users: []
    });
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
    const mcpUri = configStore.getEffective('PINGONE_RESOURCE_MCP_SERVER_URI');
    const scopes = (process.env.MCP_TOKEN_EXCHANGE_SCOPES || 'banking:read banking:write').trim().split(/\s+/);
    
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
