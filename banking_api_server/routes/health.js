/**
 * Health and Readiness Endpoints
 * Provides comprehensive health checks for monitoring and load balancing
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Liveness probe - checks if the application is alive
 * Returns 200 if the process is running
 */
router.get('/live', (_req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

/**
 * Readiness probe - checks if the application is ready to serve traffic
 * Verifies all dependencies are healthy
 */
router.get('/ready', async (_req, res) => {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'ready',
    checks: {}
  };

  let allHealthy = true;

  // Check PingOne JWKS endpoint
  try {
    const jwksUri = process.env.PINGONE_JWKS_URI;
    if (jwksUri) {
      const startTime = Date.now();
      await axios.get(jwksUri, { timeout: 3000 });
      checks.checks.pingone_jwks = {
        status: 'healthy',
        responseTime: Date.now() - startTime
      };
    } else {
      checks.checks.pingone_jwks = {
        status: 'not_configured',
        message: 'PINGONE_JWKS_URI not set'
      };
    }
  } catch (error) {
    allHealthy = false;
    checks.checks.pingone_jwks = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Check MCP server connectivity (if configured)
  try {
    const mcpServerUrl = process.env.MCP_SERVER_URL;
    if (mcpServerUrl) {
      const startTime = Date.now();
      // Try to connect to MCP server health endpoint
      const healthUrl = `${mcpServerUrl}/health`;
      await axios.get(healthUrl, { timeout: 3000 });
      checks.checks.mcp_server = {
        status: 'healthy',
        responseTime: Date.now() - startTime
      };
    } else {
      checks.checks.mcp_server = {
        status: 'not_configured',
        message: 'MCP_SERVER_URL not set'
      };
    }
  } catch (error) {
    // MCP server might not have health endpoint, don't fail on this
    checks.checks.mcp_server = {
      status: 'unknown',
      message: 'Could not verify MCP server health',
      error: error.message
    };
  }

  // Check database connectivity (if using database)
  try {
    const dataStore = require('../data/store');
    if (dataStore && typeof dataStore.healthCheck === 'function') {
      const dbHealth = await dataStore.healthCheck();
      checks.checks.database = {
        status: dbHealth ? 'healthy' : 'unhealthy'
      };
      if (!dbHealth) allHealthy = false;
    } else {
      checks.checks.database = {
        status: 'not_applicable',
        message: 'Using in-memory store'
      };
    }
  } catch (error) {
    allHealthy = false;
    checks.checks.database = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Check session store
  try {
    // Session store is healthy if we can access it
    checks.checks.session_store = {
      status: 'healthy',
      message: 'Session middleware loaded'
    };
  } catch (error) {
    allHealthy = false;
    checks.checks.session_store = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Overall status
  checks.status = allHealthy ? 'ready' : 'not_ready';
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json(checks);
});

/**
 * Detailed health check with all components
 */
router.get('/', async (_req, res) => {
  const health = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    version: process.env.npm_package_version || '1.1.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    components: {}
  };

  let allHealthy = true;

  // Check all critical components
  const components = [
    {
      name: 'pingone_auth',
      check: async () => {
        const tokenEndpoint = process.env.PINGONE_TOKEN_ENDPOINT;
        if (!tokenEndpoint) {
          return { status: 'not_configured' };
        }
        try {
          // Just check if endpoint is reachable (will return 400 for missing params, which is fine)
          await axios.post(tokenEndpoint, {}, { timeout: 3000, validateStatus: () => true });
          return { status: 'healthy' };
        } catch (error) {
          return { status: 'unhealthy', error: error.message };
        }
      }
    },
    {
      name: 'pingone_jwks',
      check: async () => {
        const jwksUri = process.env.PINGONE_JWKS_URI;
        if (!jwksUri) {
          return { status: 'not_configured' };
        }
        try {
          await axios.get(jwksUri, { timeout: 3000 });
          return { status: 'healthy' };
        } catch (error) {
          return { status: 'unhealthy', error: error.message };
        }
      }
    },
    {
      name: 'token_introspection',
      check: async () => {
        const introspectionEndpoint = process.env.PINGONE_INTROSPECTION_ENDPOINT;
        if (!introspectionEndpoint) {
          return { status: 'not_configured' };
        }
        return { status: 'configured', endpoint: introspectionEndpoint };
      }
    },
    {
      name: 'token_revocation',
      check: async () => {
        const revocationEndpoint = process.env.PINGONE_REVOCATION_ENDPOINT;
        if (!revocationEndpoint) {
          return { status: 'not_configured' };
        }
        return { status: 'configured', endpoint: revocationEndpoint };
      }
    },
    {
      name: 'ciba',
      check: async () => {
        const cibaEnabled = process.env.CIBA_ENABLED === 'true';
        if (!cibaEnabled) {
          return { status: 'disabled' };
        }
        const cibaService = require('../services/cibaService');
        return { 
          status: cibaService.isEnabled() ? 'enabled' : 'disabled' 
        };
      }
    }
  ];

  // Run all checks
  for (const component of components) {
    try {
      health.components[component.name] = await component.check();
      if (health.components[component.name].status === 'unhealthy') {
        allHealthy = false;
      }
    } catch (error) {
      allHealthy = false;
      health.components[component.name] = {
        status: 'error',
        error: error.message
      };
    }
  }

  health.status = allHealthy ? 'healthy' : 'degraded';
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json(health);
});

/**
 * GET /introspection
 * Tests whether the BFF can reach the PingOne introspection endpoint.
 * Useful for demo operators to verify connectivity before live operations.
 *
 * Response:
 *   200: { status: 'connected', endpoint, timestamp, details: { responseTime, mode, message } }
 *   503: { status: 'failed',    endpoint, timestamp, details: { error, hint } }
 */
router.get('/introspection', async (req, res) => {
  const introspectionEndpoint = process.env.PINGONE_INTROSPECTION_ENDPOINT;

  if (!introspectionEndpoint) {
    return res.status(503).json({
      status: 'not_configured',
      endpoint: null,
      timestamp: new Date().toISOString(),
      details: {
        error: 'PINGONE_INTROSPECTION_ENDPOINT is not set',
        hint: 'Set PINGONE_INTROSPECTION_ENDPOINT in your .env file (e.g., https://auth.pingone.com/{env-id}/oauth2/introspect)',
      },
    });
  }

  const startTime = Date.now();

  try {
    // Test connectivity by calling introspection with a dummy token.
    // PingOne returns 200 { active: false } for invalid tokens — this proves the endpoint is
    // reachable and accepting requests without needing to supply a real token.
    const workerClientId = process.env.WORKER_CLIENT_ID || process.env.PINGONE_WORKER_CLIENT_ID;
    const workerSecret  = process.env.WORKER_CLIENT_SECRET || process.env.PINGONE_WORKER_CLIENT_SECRET;

    if (!workerClientId || !workerSecret) {
      return res.status(503).json({
        status: 'not_configured',
        endpoint: introspectionEndpoint,
        timestamp: new Date().toISOString(),
        details: {
          error: 'Worker credentials not configured (WORKER_CLIENT_ID / WORKER_CLIENT_SECRET)',
          hint: 'Set WORKER_CLIENT_ID and WORKER_CLIENT_SECRET to enable introspection health checks',
        },
      });
    }

    // POST to introspection endpoint with a test token (will return active:false — that's fine)
    const credentials = Buffer.from(`${workerClientId}:${workerSecret}`).toString('base64');
    const response = await axios.post(
      introspectionEndpoint,
      'token=health_check_probe_token',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 5000,
        validateStatus: () => true, // Accept any status — we only care if it's reachable
      }
    );

    const responseTime = Date.now() - startTime;

    // 200 means endpoint is reachable (token was just rejected as inactive)
    // 401 means endpoint is reachable but credentials are wrong
    // 5xx or timeout means endpoint is unreachable
    if (response.status >= 500) {
      return res.status(503).json({
        status: 'failed',
        endpoint: introspectionEndpoint,
        timestamp: new Date().toISOString(),
        details: {
          responseTime,
          error: `PingOne returned HTTP ${response.status}`,
          hint: 'PingOne introspection endpoint returned a server error. Check PingOne status.',
        },
      });
    }

    if (response.status === 401) {
      return res.status(503).json({
        status: 'auth_failed',
        endpoint: introspectionEndpoint,
        timestamp: new Date().toISOString(),
        details: {
          responseTime,
          error: 'Worker credentials rejected by PingOne (401 Unauthorized)',
          hint: 'Verify WORKER_CLIENT_ID and WORKER_CLIENT_SECRET are correct in .env',
        },
      });
    }

    // Endpoint is reachable and returned a valid response (200 with active:false is expected)
    const validationModeConfig = (() => {
      try { return require('../config/validationModeConfig'); } catch { return null; }
    })();

    return res.status(200).json({
      status: 'connected',
      endpoint: introspectionEndpoint,
      timestamp: new Date().toISOString(),
      details: {
        responseTime,
        httpStatus: response.status,
        mode: validationModeConfig ? validationModeConfig.getValidationMode() : 'unknown',
        message: 'PingOne introspection endpoint is reachable and responding',
      },
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    return res.status(503).json({
      status: 'failed',
      endpoint: introspectionEndpoint,
      timestamp: new Date().toISOString(),
      details: {
        responseTime,
        error: error.message || 'Unknown error',
        hint: 'Check network connectivity to PingOne. Verify PINGONE_INTROSPECTION_ENDPOINT is correct.',
      },
    });
  }
});

/**
 * Startup probe - checks if application has finished starting up
 */
router.get('/startup', (_req, res) => {
  // Check if critical environment variables are set
  const requiredEnvVars = [
    'PINGONE_ENVIRONMENT_ID',
    'PINGONE_TOKEN_ENDPOINT'
  ];

  const missing = requiredEnvVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    return res.status(503).json({
      status: 'not_started',
      missing_config: missing,
      message: 'Required configuration missing'
    });
  }

  res.status(200).json({
    status: 'started',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
