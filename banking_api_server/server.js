// Load environment variables from .env file (no-op on Vercel where env vars are injected)
require('dotenv').config();

// ConfigStore must be required early so oauth config module getters are ready
const configStore = require('./services/configStore');
const { resolveRedisWireUrl } = require('./services/redisWireUrl');
const { mcpNoBearerResponse } = require('./services/bffSessionGating');

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

// Log OAuth config so mismatches are visible in Vercel logs
if (isVercel) {
  const _mask = (v, n = 4) => v ? v.slice(0, n) + '...' : 'MISSING';
  const _envId    = process.env.PINGONE_ENVIRONMENT_ID || process.env.PINGONE_ENV_ID || '';
  const _adminId  = process.env.PINGONE_ADMIN_CLIENT_ID  || process.env.PINGONE_AI_CORE_CLIENT_ID  || process.env.PINGONE_CORE_CLIENT_ID  || '';
  const _adminSec = process.env.PINGONE_ADMIN_CLIENT_SECRET || process.env.PINGONE_AI_CORE_CLIENT_SECRET || process.env.PINGONE_CORE_CLIENT_SECRET || '';
  const _userId   = process.env.PINGONE_USER_CLIENT_ID   || process.env.PINGONE_AI_CORE_USER_CLIENT_ID   || process.env.PINGONE_CORE_USER_CLIENT_ID   || '';
  const _userSec  = process.env.PINGONE_USER_CLIENT_SECRET  || process.env.PINGONE_AI_CORE_USER_CLIENT_SECRET  || process.env.PINGONE_CORE_USER_CLIENT_SECRET  || '';
  console.log('[oauth-config] env_id=%s  admin_client_id=%s  admin_secret=%s  user_client_id=%s  user_secret=%s',
    _mask(_envId, 8), _mask(_adminId, 8), _mask(_adminSec, 4), _mask(_userId, 8), _mask(_userSec, 4));
}

// Security guard: SKIP_TOKEN_SIGNATURE_VALIDATION must never be enabled in production.
// Validates at startup (before any request is served) so misconfigurations are caught early.
if (process.env.SKIP_TOKEN_SIGNATURE_VALIDATION === 'true' && isProduction) {
  console.error('[FATAL] SKIP_TOKEN_SIGNATURE_VALIDATION=true is not allowed in production. Remove this env var before deploying.');
  process.exit(1);
}

// ── Optional persistent session store (required for Vercel / multi-instance deployments) ──
// Resolve Redis URL: explicit REDIS_URL takes priority; fall back to deriving it from
// Upstash REST variables (UPSTASH_REDIS_REST_* or Vercel KV KV_REST_API_*), which use
// the same https://…upstash.io host and token as the Redis protocol password.
/** @type {string | null} Which env keys supplied the Redis URL (for logs /api/auth/debug). */
let sessionRedisEnvHint = null;

const _redisResolved = resolveRedisWireUrl(process.env);
const _redisUrl = _redisResolved.url;
sessionRedisEnvHint = _redisResolved.envHint;
if (_redisResolved.invalidRedisUrlIgnored) {
  console.warn(
    '[session-store] REDIS_URL is set but is not redis:// or rediss:// (wrong value or REST URL pasted). ' +
      'Ignoring it; using KV_URL or REST-derived URL if available.',
  );
}

let sessionStore;
/** node-redis client when Redis session store is configured (exposed for /api/auth/debug only). */
let sessionRedisClient = null;
let sessionRedisInitError = null;
let sessionRedisConnectError = null;
if (_redisUrl) {
  try {
    // connect-redis v8+ exports { RedisStore } — .default is often undefined in CJS.
    const connectRedisPkg = require('connect-redis');
    const RedisStore =
      connectRedisPkg.RedisStore ||
      connectRedisPkg.default ||
      connectRedisPkg;
    const { createClient } = require('redis');
    const redisClient = createClient({
      url: _redisUrl,
      // rediss:// URL already enables TLS — do NOT pass socket.tls:true or it double-wraps.
      // In a Vercel serverless environment each request is a fresh invocation;
      // disable reconnect strategy so a stale socket doesn't log noisy errors.
      socket: {
        // Upstash from cold serverless can exceed 5s; avoid false timeouts after RedisStore fix.
        connectTimeout: 15000,
        reconnectStrategy: (retries) => {
          if (retries < 2) return Math.min(retries * 200, 500);
          // Give up after 2 attempts — serverless instances are short-lived.
          return new Error('[session-store] Redis connection failed after retries');
        },
      },
    });
    sessionRedisClient = redisClient;
    // connect() is awaited by awaitSessionRedisReady before express-session runs (cold Vercel starts).
    redisClient.on('error', (err) => {
      // Only log the first error per instance; subsequent socket-closed events are redundant
      if (!redisClient._loggedError) {
        sessionRedisConnectError = err.message || String(err);
        console.error('[session-store] Redis error:', err.message);
        redisClient._loggedError = true;
      }
    });
    const rawStore = new RedisStore({ client: redisClient, prefix: 'banking:sess:' });
    // Fault-tolerant wrapper: Redis get/destroy errors return empty session rather than
    // propagating to next(err) → 500.  A disconnected store yields 401 (no token), not a crash.
    const _origGet = rawStore.get.bind(rawStore);
    rawStore.get = (sid, cb) => {
      _origGet(sid, (err, session) => {
        if (err) {
          sessionRedisConnectError = err.message || String(err);
          console.error('[session-store] Redis get error (returning empty session):', err.message);
          cb(null, null);
        } else {
          cb(null, session);
        }
      });
    };
    // Wrap set() — session.save() will call cb(null) even on Redis write failure.
    // This prevents session_error redirects; the _auth cookie provides the fallback.
    const _origSet = rawStore.set.bind(rawStore);
    rawStore.set = (sid, session, cb) => {
      _origSet(sid, session, (err) => {
        if (err) {
          sessionRedisConnectError = err.message || String(err);
          console.error('[session-store] Redis set error (session not persisted to Redis):', err.message);
        }
        if (cb) cb(null);
      });
    };
    if (typeof rawStore.destroy === 'function') {
      const _origDestroy = rawStore.destroy.bind(rawStore);
      rawStore.destroy = (sid, cb) => {
        _origDestroy(sid, (err) => {
          if (err) console.error('[session-store] Redis destroy error (ignored):', err.message);
          if (cb) cb(null);
        });
      };
    }
    sessionStore = rawStore;
    console.log(`[session-store] Using Redis store (from ${sessionRedisEnvHint})`);
  } catch (err) {
    sessionRedisInitError = err.message || String(err);
    sessionRedisClient = null;
    console.warn('[session-store] connect-redis/redis not available, falling back to memory store:', err.message);
  }
}

if (!sessionStore && (process.env.VERCEL || process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT)) {
  const platform = process.env.VERCEL ? 'Vercel' : 'Replit';
  console.warn(
    `[session-store] WARNING: Running on ${platform} without Redis. ` +
    'Sessions use in-memory store — they will be lost on process restart. ' +
    'Set REDIS_URL or KV_URL (rediss://…), or UPSTASH_REDIS_REST_* / KV_REST_API_* for persistent sessions.',
  );
}

// Import routes
const authRoutes        = require('./routes/auth');
const oauthRoutes       = require('./routes/oauth');
const oauthUserRoutes   = require('./routes/oauthUser');
const oauthService      = require('./services/oauthService');
const userRoutes        = require('./routes/users');
const accountRoutes     = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const demoScenarioRoutes = require('./routes/demoScenario');
const adminRoutes       = require('./routes/admin');
const adminConfigRoutes = require('./routes/adminConfig');
const cibaRoutes        = require('./routes/ciba');
const mcpInspectorRoutes = require('./routes/mcpInspector');
const agentIdentityRoutes = require('./routes/agentIdentity');
const bankingAgentNlRoutes = require('./routes/bankingAgentNl');
const tokenRoutes = require('./routes/tokens');
const logsRoutes = require('./routes/logs');
const { router: clientRegistrationRoutes, wellKnownHandler } = require('./routes/clientRegistration');
const { getOAuthRedirectDebugInfo, getFrontendOrigin } = require('./services/oauthRedirectUris');
const { restoreSessionFromCookie, clearAuthCookie } = require('./services/authStateCookie');

// Import middleware
const { authenticateToken } = require('./middleware/auth');
const { logActivity } = require('./middleware/activityLogger');
const { correlationIdMiddleware } = require('./middleware/correlationId');
const { delegationAuditMiddleware } = require('./middleware/delegationAuditLogger');
const { refreshIfExpiring } = require('./middleware/tokenRefresh');

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

// Enforce HTTPS on Vercel and Replit — redirect any plain HTTP request.
// Both platforms terminate TLS before Express and set x-forwarded-proto.
if (isVercel || isReplit) {
  app.use((req, res, next) => {
    if (req.secure) return next();
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// Rate limiting — set DISABLE_RATE_LIMIT=true (or 1/yes) to turn off global + auth limits while testing locally or on a preview.
const rateLimitDisabled = ['1', 'true', 'yes'].includes(
  String(process.env.DISABLE_RATE_LIMIT || '').toLowerCase()
);
const _rateLimitHandler = (req, res) => {
  // Auth routes are browser-driven redirects — send to login page with friendly error.
  // Use an absolute URL so Vercel edge / serverless does not choke on relative redirects.
  if (req.path.startsWith('/api/auth')) {
    const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    const host  = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    const origin = host ? `${proto}://${host}` : (process.env.REACT_APP_CLIENT_URL || 'http://localhost:3000');
    return res.redirect(`${origin}/login?error=too_many_requests`);
  }
  res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
};
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Generous defaults for demos/testing; override with RATE_LIMIT_MAX. Production can tighten via env.
  max: (() => {
    const n = parseInt(process.env.RATE_LIMIT_MAX || '', 10);
    if (Number.isFinite(n) && n > 0) return n;
    return process.env.NODE_ENV === 'development' ? 20000 : 8000;
  })(),
  handler: _rateLimitHandler,
  skip: () => rateLimitDisabled,
});
/**
 * Paths excluded from the global IP limiter — they have their own limits or are safe, hot paths.
 * Dashboard + config GETs were tripping 429 on shared IPs (NAT) and breaking transfers after hydration failures.
 */
function shouldSkipGlobalRateLimit(req) {
  const p = req.path || '';
  return (
    p.startsWith('/api/logs') ||
    p.startsWith('/api/banking-agent') ||
    p.startsWith('/api/agent') ||
    p.startsWith('/api/mcp') ||
    p === '/api/accounts/my' ||
    p === '/api/transactions/my' ||
    p.startsWith('/api/admin/config')
  );
}
app.use((req, res, next) => (shouldSkipGlobalRateLimit(req) ? next() : limiter(req, res, next)));

// Tighter rate limit for login/callback only — not status polling endpoints.
// max=100 in production: enough headroom for demo testing while still preventing abuse.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (() => {
    const n = parseInt(process.env.RATE_LIMIT_AUTH_MAX || '', 10);
    if (Number.isFinite(n) && n > 0) return n;
    return process.env.NODE_ENV === 'development' ? 500 : 300;
  })(),
  handler: _rateLimitHandler,
  skip: () => rateLimitDisabled,
});
app.use('/api/auth/oauth/login',         authLimiter);
app.use('/api/auth/oauth/callback',      authLimiter);
app.use('/api/auth/oauth/user/login',    authLimiter);
app.use('/api/auth/oauth/user/callback', authLimiter);

// Logging middleware
app.use(morgan('combined'));

/** Wait for Redis before session load/save so serverless cold starts do not race connect-redis. */
function awaitSessionRedisReady(req, res, next) {
  if (!sessionRedisClient) return next();
  if (sessionRedisClient.isReady) return next();
  // If the socket is already opening (connect in progress), wait for 'ready' or 'error'.
  // Calling connect() again when isOpen would throw "Socket already opened".
  if (sessionRedisClient.isOpen) {
    const onReady = () => { cleanup(); next(); };
    const onError = (err) => { cleanup(); sessionRedisConnectError = err.message || String(err); next(); };
    const cleanup = () => { sessionRedisClient.removeListener('ready', onReady); sessionRedisClient.removeListener('error', onError); };
    sessionRedisClient.once('ready', onReady);
    sessionRedisClient.once('error', onError);
    return;
  }
  sessionRedisClient
    .connect()
    .then(() => next())
    .catch((err) => {
      sessionRedisConnectError = err.message || String(err);
      if (!sessionRedisClient._awaitLoggedFail) {
        sessionRedisClient._awaitLoggedFail = true;
        console.error('[session-store] Redis connect failed before session:', err.message);
      }
      next();
    });
}

app.use(awaitSessionRedisReady);

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

// Correlation ID — attach X-Request-ID to every request/response for distributed tracing.
app.use(correlationIdMiddleware);

// Activity logging middleware
app.use(logActivity);

// Delegation audit logging — extract act/may_act claims for audit trail
app.use(delegationAuditMiddleware);

// Ensure configStore is loaded before any request touches OAuth config.
// The promise is memoised — this is a no-op after the first request.
app.use((req, res, next) => {
  configStore.ensureInitialized().then(() => next()).catch(next);
});

// Restore session user from signed _auth cookie when in-memory session is empty.
// This keeps auth working on Vercel serverless (no Redis) where each request may
// land on a fresh instance with no in-memory session data.
app.use(restoreSessionFromCookie);

// RFC 6749 §6 — silently refresh near-expired end-user access tokens on
// authenticated API routes so UIs never serve stale tokens to downstream services.
app.use(['/api/users', '/api/accounts', '/api/transactions', '/api/mcp', '/api/banking-agent', '/api/tokens', '/api/demo-scenario'], refreshIfExpiring);

// Health check endpoint
app.get('/api/healthz', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    port: PORT 
  });
});

// Unified logout — destroys whichever session is active and redirects
// browser → PingOne RP-Initiated Logout → post_logout_redirect_uri (/logout).
// Called as a full page navigation (window.location.href), NOT via axios.
app.get('/api/auth/logout', async (req, res) => {
  const idToken      = req.session.oauthTokens?.idToken       || null;
  const accessToken  = req.session.oauthTokens?.accessToken   || null;
  const refreshToken = req.session.oauthTokens?.refreshToken  || null;
  const postLogoutUri = `${getFrontendOrigin(req)}/logout`;

  // RFC 7009 — revoke tokens before destroying the session so they can no
  // longer be used even if intercepted.  Runs in parallel; non-fatal on error.
  if (accessToken  && accessToken  !== '_cookie_session') {
    oauthService.revokeToken(accessToken,  'access_token');
  }
  if (refreshToken && refreshToken !== '_cookie_session') {
    oauthService.revokeToken(refreshToken, 'refresh_token');
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error during unified logout:', err);
    }

    // Clear the auth-state cookie so the session-restore middleware does not
    // keep the user signed in on the next request.
    clearAuthCookie(res, isProduction);

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

// Debug endpoint — shows auth state for the current request (Vercel debugging).
// Returns cookie presence, session state, and platform flags.
// No secrets are exposed.
app.get('/api/auth/debug', (req, res) => {
  const cookieNames = Object.keys(
    Object.fromEntries(
      (req.headers.cookie || '').split(';').map(p => [p.split('=')[0].trim(), 1])
    )
  ).filter(Boolean);
  res.json({
    platform: { vercel: !!process.env.VERCEL, replit: !!process.env.REPL_ID, production: isProduction },
    sessionPresent:    !!req.session,
    sessionId:         req.session?.id ? req.session.id.slice(0, 8) + '...' : null,
    sessionHasUser:    !!req.session?.user,
    sessionOauthType:  req.session?.oauthType || null,
    sessionRestored:   !!req.session?._restoredFromCookie,
    sessionHasTokens:  !!req.session?.oauthTokens?.accessToken,
    accessTokenStub:   req.session?.oauthTokens?.accessToken === '_cookie_session',
    cookiesPresent:    cookieNames,
    hasAuthCookie:     cookieNames.includes('_auth'),
    hasPkceCookie:     cookieNames.includes('_pkce'),
    sessionCookieName: cookieNames.includes('connect.sid') ? 'connect.sid present' : 'connect.sid MISSING',
    /** redis = connect-redis configured; memory = serverless will cookie-restore without tokens */
    bffSessionStore: sessionStore ? 'redis' : 'memory',
    /** True if REDIS_URL or REST-derived URL was present at startup (even if Redis store init failed). */
    sessionRedisUrlConfigured: Boolean(_redisUrl),
    /** node-redis client socket open (null = no client created). */
    sessionRedisClientOpen: sessionRedisClient ? !!sessionRedisClient.isOpen : null,
    /** Client accepted commands (null = no client). */
    sessionRedisClientReady: sessionRedisClient ? !!sessionRedisClient.isReady : null,
    /** Sync failure creating Redis client / RedisStore (null if none). */
    sessionRedisInitError: sessionRedisInitError || null,
    /** Last async connect/socket error observed (null if none). */
    sessionRedisConnectError: sessionRedisConnectError || null,
    /** Which env supplied the resolved Redis URL (null if none). */
    sessionRedisEnv: sessionRedisEnvHint,
    storageType:       configStore.getStorageType(),
    isConfigured:      configStore.isConfigured(),
    userEmail:         req.session?.user?.email || null,
    userRole:          req.session?.user?.role || null,
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
// NL route uses its own req.session?.user check — full JWT validation is not
// needed here and causes invalid_token errors when JWKS fetch times out.
app.use('/api/banking-agent', bankingAgentNlRoutes);
app.use('/api/mcp/inspector', authenticateToken, mcpInspectorRoutes);
app.use('/api/tokens', authenticateToken, tokenRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/accounts', authenticateToken, accountRoutes);
app.use('/api/transactions', authenticateToken, transactionRoutes);
app.use('/api/demo-scenario', authenticateToken, demoScenarioRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/clients', authenticateToken, clientRegistrationRoutes);
app.use('/api/logs', logsRoutes);

// Public CIMD well-known endpoint — no authentication required.
// Mounted after session/auth middleware but before static files.
app.get('/.well-known/oauth-client/:clientId', wellKnownHandler);

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
// When MCP_SERVER_RESOURCE_URI is configured, the Backend-for-Frontend (BFF) performs an RFC 8693
// token exchange before calling the MCP server. This produces a delegated token
// with `act: { client_id: <bff> }` and a scope narrowed to what the tool needs,
// scoped to the MCP server audience — the user's raw token never leaves the Backend-for-Frontend (BFF).

const { resolveMcpAccessTokenWithEvents } = require('./services/agentMcpTokenService');
const { mcpCallTool, getSessionAccessToken, getMcpServerUrl } = require('./services/mcpWebSocketClient');
const { callToolLocal } = require('./services/mcpLocalTools');
const { introspectToken } = require('./middleware/tokenIntrospection');

// POST /api/mcp/tool — call a banking MCP tool
app.post('/api/mcp/tool', express.json(), async (req, res) => {
  const { tool, params } = req.body || {};

  if (!tool || typeof tool !== 'string') {
    return res.status(400).json({ error: 'tool name is required' });
  }

  let agentToken;
  let userSub = null;
  let tokenEvents = [];
  try {
    const resolved = await resolveMcpAccessTokenWithEvents(req, tool);
    agentToken = resolved.token;
    tokenEvents = resolved.tokenEvents;
    userSub = resolved.userSub || null;
  } catch (err) {
    console.error(`[MCP Proxy] Token resolution failed for tool ${tool}:`, err.message);
    return res.status(502).json({ error: 'token_exchange_failed', message: err.message, tokenEvents });
  }

  if (!agentToken) {
    const r = mcpNoBearerResponse(req, tokenEvents);
    return res.status(r.status).json(r.body);
  }

  // Introspect session token for zero-trust validation (RFC 7662)
  const sessionAccessToken = getSessionAccessToken(req);
  const introspectionConfigured = !!process.env.PINGONE_INTROSPECTION_ENDPOINT;
  if (introspectionConfigured) {
    if (!sessionAccessToken || sessionAccessToken === '_cookie_session') {
      const r = mcpNoBearerResponse(req, tokenEvents);
      return res.status(r.status).json(r.body);
    }
    try {
      const introspectionResult = await introspectToken(sessionAccessToken);
      if (!introspectionResult.active) {
        console.warn(`[MCP Proxy] Session token introspection failed: token inactive for tool ${tool}`);
        return res.status(401).json({
          error: 'token_inactive',
          message: 'Session token is no longer active. Please sign in again.',
          tokenEvents,
        });
      }
    } catch (err) {
      console.error(`[MCP Proxy] Session token introspection error for tool ${tool}:`, err.message);
      // Continue on introspection failure (graceful degradation) but log the error
    }
  }

  // ── Try remote MCP server first; fall back to local handler if unreachable ──
  const mcpUrl = getMcpServerUrl();
  const isLocalDefault = mcpUrl === 'ws://localhost:8080' && !process.env.MCP_SERVER_URL;

  try {
    // Skip the WebSocket attempt entirely when running on Vercel with no MCP_SERVER_URL
    // configured — localhost:8080 is guaranteed to be unreachable serverless.
    if (isLocalDefault && process.env.VERCEL) {
      throw Object.assign(new Error('MCP_SERVER_URL not configured; using local tool handler'), { useLocal: true });
    }
    const result = await mcpCallTool(tool, params || {}, agentToken, userSub, req.correlationId);
    return res.json({ result, tokenEvents });
  } catch (err) {
    const isConnErr =
      err.useLocal ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('ENETUNREACH') ||
      err.message.includes('timed out') ||
      err.message.includes('connect ETIMEDOUT') ||
      (err.code && ['ECONNREFUSED', 'ENETUNREACH', 'ETIMEDOUT'].includes(err.code));

    if (!isConnErr) {
      console.error(`[MCP Proxy] Error calling ${tool}:`, err.message);
      return res.status(502).json({ error: 'mcp_error', message: err.message, tokenEvents });
    }

    // ── Local fallback ──────────────────────────────────────────────────────
    const sessionUser = req.session?.user;
    if (!sessionUser?.id) {
      const r = mcpNoBearerResponse(req, tokenEvents);
      return res.status(r.status).json(r.body);
    }

    console.log(`[MCP Local] ${tool} — MCP server unreachable (${mcpUrl}), using local handler`);
    try {
      const result = await callToolLocal(tool, params || {}, sessionUser.id);
      return res.json({ result, tokenEvents, _localFallback: true });
    } catch (localErr) {
      console.error(`[MCP Local] Error calling ${tool}:`, localErr.message);
      return res.status(502).json({ error: 'mcp_error', message: localErr.message, tokenEvents });
    }
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
