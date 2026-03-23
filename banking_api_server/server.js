// Load environment variables from .env file (no-op on Vercel where env vars are injected)
require('dotenv').config();

// ConfigStore must be required early so oauth config module getters are ready
const configStore = require('./services/configStore');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const session = require('express-session');

const isVercel  = !!process.env.VERCEL;
const isReplit  = !!process.env.REPL_ID || !!process.env.REPLIT_DEPLOYMENT;
const isProduction = process.env.NODE_ENV === 'production' || isVercel || isReplit;

// Log deployment context on startup
if (isVercel)  console.log('[platform] Vercel deployment detected');
if (isReplit)  console.log('[platform] Replit deployment detected');
if (!isVercel && !isReplit && isProduction) console.log('[platform] Generic production deployment');

// ── Optional persistent session store (required for Vercel / multi-instance deployments) ──
let sessionStore;
if (process.env.REDIS_URL) {
  try {
    const RedisStore = require('connect-redis').default || require('connect-redis');
    const { createClient } = require('redis');
    const redisClient = createClient({ url: process.env.REDIS_URL, socket: { tls: process.env.REDIS_URL.startsWith('rediss://') } });
    redisClient.connect().catch((err) => console.error('[session-store] Redis connect error:', err.message));
    redisClient.on('error', (err) => console.error('[session-store] Redis error:', err.message));
    sessionStore = new RedisStore({ client: redisClient, prefix: 'banking:sess:' });
    console.log('[session-store] Using Redis store (REDIS_URL)');
  } catch (err) {
    console.warn('[session-store] connect-redis/redis not available, falling back to memory store:', err.message);
  }
}

if (!sessionStore && (process.env.VERCEL || process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT)) {
  const platform = process.env.VERCEL ? 'Vercel' : 'Replit';
  console.warn(
    `[session-store] WARNING: Running on ${platform} without REDIS_URL. ` +
    'Sessions use in-memory store — they will be lost on process restart. ' +
    'Set REDIS_URL (Upstash Redis: https://upstash.com) for persistent sessions.',
  );
}

// Import routes
const authRoutes        = require('./routes/auth');
const oauthRoutes       = require('./routes/oauth');
const oauthUserRoutes   = require('./routes/oauthUser');
const userRoutes        = require('./routes/users');
const accountRoutes     = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const adminRoutes       = require('./routes/admin');
const adminConfigRoutes = require('./routes/adminConfig');
const cibaRoutes        = require('./routes/ciba');
const mcpInspectorRoutes = require('./routes/mcpInspector');
const agentIdentityRoutes = require('./routes/agentIdentity');
const bankingAgentNlRoutes = require('./routes/bankingAgentNl');
const { getOAuthRedirectDebugInfo } = require('./services/oauthRedirectUris');

// Import middleware
const { authenticateToken } = require('./middleware/auth');
const { logActivity } = require('./middleware/activityLogger');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  // Content-Security-Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'"],   // CRA requires unsafe-inline in prod build
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'https:'],
      connectSrc:     ["'self'", 'https://*.pingone.com', 'https://*.pingidentity.com', 'wss:'],
      fontSrc:        ["'self'", 'data:'],
      frameAncestors: ["'none'"],
    },
  },
  // HSTS — 2 years, include subdomains
  strictTransportSecurity: {
    maxAge:            63072000,
    includeSubDomains: true,
    preload:           true,
  },
  // X-Frame-Options: DENY
  frameguard: { action: 'deny' },
  // Referrer-Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // X-Content-Type-Options: nosniff (helmet default)
  noSniff: true,
  // Permissions-Policy (helmet calls this permittedCrossDomainPolicies, but we set it manually below)
  permittedCrossDomainPolicies: false,
  // Disable X-Powered-By
  hidePoweredBy: true,
  // X-XSS-Protection (legacy browsers)
  xssFilter: true,
}));

// Permissions-Policy header (not in helmet's built-in options)
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Cache-Control: no-store for all API routes
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
// Allow credentials (session cookies) from the configured origin.
// In development the React CRA proxy makes requests same-origin, so CORS is
// essentially unused. On Vercel, React and API share the same domain.
app.use(cors({
  // In production, CORS_ORIGIN should be set to the frontend URL.
  // Fallback to false (block all cross-origin) rather than reflecting any Origin.
  // The React CRA dev proxy makes requests same-origin in development, so this
  // fallback only affects calls from a different origin without the env var set.
  origin: process.env.CORS_ORIGIN || (isProduction ? false : 'http://localhost:3000'),
  credentials: true
}));

// Trust proxy headers from Vercel / any load balancer in front of Express.
// Required so that req.secure is true on Vercel HTTPS connections and
// session cookies with sameSite:'none'/secure:true are set correctly.
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Higher limit for development
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  }
});
app.use(limiter);

// Logging middleware
app.use(morgan('combined'));

// Session middleware
app.use(session({
  secret: (() => {
    const s = process.env.SESSION_SECRET;
    if (!s || s === 'dev-session-secret-change-in-production') {
      if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT) {
        console.error('[FATAL] SESSION_SECRET env var is not set or is using the insecure default. Set a random 32+ character string in your deployment environment.');
        process.exit(1);
      }
      console.warn('[security] SESSION_SECRET not set — using insecure default (dev only).');
    }
    return s || 'dev-session-secret-change-in-production';
  })(),
  resave: false,
  saveUninitialized: false,
  ...(sessionStore ? { store: sessionStore } : {}),
  cookie: {
    // On Vercel / production HTTPS, secure:true is required.
    // SameSite:none is required on Vercel because the OAuth signoff redirect
    // comes from an external domain (PingOne) → needs to send cookie.
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Activity logging middleware
app.use(logActivity);

// Ensure configStore is loaded before any request touches OAuth config.
// The promise is memoised — this is a no-op after the first request.
app.use((req, res, next) => {
  configStore.ensureInitialized().then(() => next()).catch(next);
});



// Health check endpoint
app.get('/api/healthz', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    port: PORT 
  });
});

// Unified logout — destroys whichever session is active and redirects
// browser → PingOne RP-Initiated Logout → post_logout_redirect_uri (/login).
// Called as a full page navigation (window.location.href), NOT via axios.
app.get('/api/auth/logout', (req, res) => {
  const idToken = req.session.oauthTokens?.idToken || null;
  const frontendUrl = process.env.REACT_APP_CLIENT_URL || 'http://localhost:3000';
  const postLogoutUri = `${frontendUrl}/login`;

  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error during unified logout:', err);
    }

    const envId  = configStore.getEffective('pingone_environment_id');
    const region = configStore.getEffective('pingone_region') || 'com';
    const pingoneSignoff = `https://auth.pingone.${region}/${envId}/as/signoff`;

    const params = new URLSearchParams({ post_logout_redirect_uri: postLogoutUri });
    if (idToken) {
      params.set('id_token_hint', idToken);
    }

    res.redirect(`${pingoneSignoff}?${params.toString()}`);
  });
});

// API Routes
// IMPORTANT: /api/admin/config MUST be registered before /api/admin so that
// unauthenticated requests to the config endpoint are not blocked by the
// authenticateToken middleware that guards the broader /api/admin/* prefix.
app.use('/api/admin/config', adminConfigRoutes);

// PingOne redirect URI allowlist (JSON). Registered here BEFORE /api/auth so the path is not
// handled only by routes/auth.js (avoids "Cannot GET" on some deployments).
app.get('/api/auth/oauth/redirect-info', (req, res) => {
  try {
    res.json(getOAuthRedirectDebugInfo(req));
  } catch (err) {
    res.status(500).json({ error: 'redirect_info_failed', message: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/auth/oauth', oauthRoutes);
app.use('/api/auth/oauth/user', oauthUserRoutes);
app.use('/api/auth/ciba', cibaRoutes);
app.use('/api/agent', agentIdentityRoutes);
app.use('/api/banking-agent', authenticateToken, bankingAgentNlRoutes);
app.use('/api/mcp/inspector', authenticateToken, mcpInspectorRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/accounts', authenticateToken, accountRoutes);
app.use('/api/transactions', authenticateToken, transactionRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);

// Import OAuth health check and monitoring
const { checkOAuthProviderHealth } = require('./middleware/oauthErrorHandler');
const { oauthMonitor } = require('./utils/oauthMonitor');
const { logger, LOG_CATEGORIES } = require('./utils/logger');
const oauthConfig = require('./config/oauth');

// Enhanced health check endpoint with comprehensive OAuth monitoring
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  
  const healthStatus = {
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    service: 'banking-api-server',
    components: {
      api: 'healthy'
    }
  };

  // Check OAuth provider health with monitoring
  try {
    const oauthHealth = await checkOAuthProviderHealth(oauthConfig);
    const oauthMetrics = oauthMonitor.getMetrics();
    
    healthStatus.components.oauth_provider = oauthHealth.healthy ? 'healthy' : 'unhealthy';
    healthStatus.components.oauth_details = {
      ...oauthHealth,
      metrics: {
        total_requests: oauthMetrics.totalRequests,
        success_rate: oauthMetrics.successRate,
        average_response_time: Math.round(oauthMetrics.averageResponseTime),
        circuit_breaker_open: oauthMetrics.circuitBreaker.isOpen,
        health_status: oauthMetrics.healthStatus,
        recent_errors: oauthMetrics.recentErrors.slice(0, 3) // Last 3 errors
      }
    };
    
    // Determine overall health based on OAuth metrics
    if (!oauthHealth.healthy || oauthMetrics.healthStatus === 'critical') {
      healthStatus.status = 'unhealthy';
    } else if (oauthMetrics.healthStatus === 'degraded' || oauthMetrics.healthStatus === 'unhealthy') {
      healthStatus.status = 'degraded';
    }
    
  } catch (error) {
    healthStatus.components.oauth_provider = 'unhealthy';
    healthStatus.components.oauth_error = error.message;
    healthStatus.status = 'unhealthy';
    
    logger.error(LOG_CATEGORIES.PROVIDER_HEALTH, 'Health check failed for OAuth provider', {
      error_message: error.message,
      error_code: error.code
    });
  }

  const responseTime = Date.now() - startTime;
  healthStatus.response_time_ms = responseTime;

  // Log health check results
  logger.debug(LOG_CATEGORIES.PROVIDER_HEALTH, 'Health check completed', {
    overall_status: healthStatus.status,
    oauth_status: healthStatus.components.oauth_provider,
    response_time_ms: responseTime
  });

  const statusCode = healthStatus.status === 'healthy' ? 200 : 
                    healthStatus.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

// Start periodic OAuth monitoring (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  oauthMonitor.startPeriodicHealthCheck();
}

// Root endpoint for API-only mode (Docker deployment)
app.get('/', (req, res) => {
  res.json({ 
    message: 'Banking API Server', 
    version: '1.0.0',
    endpoints: ['/api/auth', '/api/users', '/api/accounts', '/api/transactions', '/api/admin'],
    mode: 'api-only'
  });
});

// Redirect /login requests to frontend
app.get('/login', (req, res) => {
  const frontendUrl = process.env.REACT_APP_CLIENT_URL || 'http://localhost:3000';
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const redirectUrl = queryString ? `${frontendUrl}/login?${queryString}` : `${frontendUrl}/login`;
  res.redirect(redirectUrl);
});

// Import OAuth error handler
const { oauthErrorHandler } = require('./middleware/oauthErrorHandler');

// ─── Banking MCP Proxy ────────────────────────────────────────────────────────
// Proxies tool calls from the React UI to the banking_mcp_server WebSocket.
// Shared client: services/mcpWebSocketClient.js. Inspector: routes/mcpInspector.js.
//
// When MCP_SERVER_RESOURCE_URI is configured, the BFF performs an RFC 8693
// token exchange before calling the MCP server. This produces a delegated token
// with `act: { client_id: <bff> }` and a scope narrowed to what the tool needs,
// scoped to the MCP server audience — the user's raw token never leaves the BFF.

const { resolveMcpAccessToken } = require('./services/agentMcpTokenService');
const { mcpCallTool } = require('./services/mcpWebSocketClient');

// POST /api/mcp/tool — call a banking MCP tool
app.post('/api/mcp/tool', express.json(), async (req, res) => {
  const { tool, params } = req.body || {};

  if (!tool || typeof tool !== 'string') {
    return res.status(400).json({ error: 'tool name is required' });
  }

  let agentToken;
  try {
    agentToken = await resolveMcpAccessToken(req, tool);
  } catch (err) {
    console.error(`[MCP Proxy] Token resolution failed for tool ${tool}:`, err.message);
    return res.status(502).json({ error: 'token_exchange_failed', message: err.message });
  }

  if (!agentToken) {
    return res.status(401).json({ error: 'authentication_required', message: 'Sign in to use the banking agent.' });
  }

  try {
    const result = await mcpCallTool(tool, params || {}, agentToken);
    return res.json({ result });
  } catch (err) {
    console.error(`[MCP Proxy] Error calling ${tool}:`, err.message);
    return res.status(502).json({ error: 'mcp_error', message: err.message });
  }
});

// ── Static file serving (Replit, localhost, and any non-Vercel host) ──────────
// On Vercel, static files are served by the CDN (vercel.json outputDirectory).
// On Replit and localhost, Express serves the React build directly.
if (!process.env.VERCEL) {
  const buildPath = path.join(__dirname, '..', 'banking_api_ui', 'build');
  const fs = require('fs');
  if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    // SPA fallback — serve index.html for all non-API routes
    app.get('*', (req, res) => {
      res.sendFile(path.join(buildPath, 'index.html'));
    });
    console.log('[static] Serving React build from', buildPath);
  } else {
    console.warn('[static] React build not found at', buildPath, '— run: cd banking_api_ui && npm run build');
    // Friendly message for unbuilt frontend
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not_found' });
      res.status(503).send(`
        <html><body style="font-family:sans-serif;padding:2rem">
          <h2>Frontend not built</h2>
          <p>Run <code>cd banking_api_ui && npm run build</code> then restart the server.</p>
          <p>Or run the dev server: <code>cd banking_api_ui && npm start</code> (port 3000)</p>
        </body></html>
      `);
    });
  }
}

// OAuth error handling middleware (should be before general error handler)
app.use(oauthErrorHandler);

// General error handling middleware
app.use((err, req, res, next) => {
  console.error('Error occurred for path:', req.path);
  console.error('Error details:', err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error('Full stack:', err.stack);
  }
  res.status(500).json({
    error: 'internal_server_error',
    error_description: 'An internal server error occurred',
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });
});

// Only start the server if this file is run directly (not imported for testing)
if (require.main === module) {
  const fs = require('fs');
  const certDir = path.join(__dirname, '../certs');
  const certFile = path.join(certDir, 'api.pingdemo.com+2.pem');
  const keyFile  = path.join(certDir, 'api.pingdemo.com+2-key.pem');

  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    const https = require('https');
    https.createServer({
      key:  fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
    }, app).listen(PORT, () => {
      console.log(`Banking API server (HTTPS) running on https://api.pingdemo.com:${PORT}`);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`Banking API server running on http://localhost:${PORT}`);
      console.log('Tip: run mkcert in Banking/certs/ to enable HTTPS (see run-bank.sh)');
    });
  }
}

// Export app as the default (for supertest / existing requires) and attach
// named flags so other modules can do: require('./server').isReplit etc.
module.exports = app;
module.exports.app         = app;
module.exports.isProduction = isProduction;
module.exports.isVercel    = isVercel;
module.exports.isReplit    = isReplit;
