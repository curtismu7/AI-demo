// Load environment variables from .env file (no-op on Vercel where env vars are injected)
require('dotenv').config();

// ConfigStore must be required early so oauth config module getters are ready
const configStore = require('./services/configStore');
const { resolveRedisWireUrl } = require('./services/redisWireUrl');
const { mcpNoBearerResponse } = require('./services/bffSessionGating');
const { createFaultTolerantStore } = require('./services/faultTolerantStore');

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
//
// Priority order:
//   1. Upstash REST (@upstash/redis, HTTP) — preferred for Vercel serverless.
//      Uses UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_*).
//      HTTP is stateless — no TCP connection to manage, no cold-start race.
//
//   2. node-redis wire protocol (TCP/TLS) — for self-hosted Redis or explicit REDIS_URL / KV_URL.
//      Requires an active connection; less reliable on Vercel due to cold starts.
//
//   3. Memory store — development fallback; sessions lost on restart.

/** @type {import('./services/upstashSessionStore') | null} */
let upstashSessionStoreInstance = null;
/** @type {string | null} Which env keys supplied the Redis URL (for logs /api/auth/debug). */
let sessionRedisEnvHint = null;
/** node-redis client when wire-protocol store is used (exposed for /api/auth/debug only). */
let sessionRedisClient = null;
let sessionRedisInitError = null;
let sessionRedisConnectError = null;
let _redisConnectPromise = null;
/** 'upstash-rest' | 'redis-wire' | 'memory' */
let sessionStoreType = 'memory';
let sessionStore;

// ── Priority 1: Upstash REST (HTTP — recommended for Vercel) ──────────────
const _restUrl   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const _restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (_restUrl && _restToken) {
  try {
    const UpstashSessionStore = require('./services/upstashSessionStore');
    upstashSessionStoreInstance = new UpstashSessionStore({ prefix: 'banking:sess:' });
    sessionStore = upstashSessionStoreInstance;
    sessionStoreType = 'upstash-rest';
    sessionRedisEnvHint = process.env.UPSTASH_REDIS_REST_URL ? 'UPSTASH_REDIS_REST_*' : 'KV_REST_API_*';
    console.log(`[session-store] Using Upstash REST store (${sessionRedisEnvHint}) — HTTP, no TCP connection`);
  } catch (err) {
    sessionRedisInitError = err.message || String(err);
    console.warn('[session-store] Upstash REST store init failed, trying wire protocol:', err.message);
  }
}

// ── Priority 2: node-redis wire protocol (self-hosted Redis / explicit REDIS_URL) ──
if (!sessionStore) {
  const _redisResolved = resolveRedisWireUrl(process.env);
  const _redisUrl = _redisResolved.url;
  if (_redisResolved.invalidRedisUrlIgnored) {
    console.warn(
      '[session-store] REDIS_URL is set but is not redis:// or rediss:// (wrong value or REST URL pasted). ' +
        'Ignoring it; using KV_URL or REST-derived URL if available.',
    );
  }

  if (_redisUrl) {
    try {
      const connectRedisPkg = require('connect-redis');
      const RedisStore =
        connectRedisPkg.RedisStore ||
        connectRedisPkg.default ||
        connectRedisPkg;
      const { createClient } = require('redis');
      const redisClient = createClient({
        url: _redisUrl,
        socket: {
          connectTimeout: 8000,
          reconnectStrategy: (retries) => {
            if (retries < 3) return Math.min(retries * 200, 1000);
            return new Error('[session-store] Redis reconnect exhausted');
          },
        },
      });
      sessionRedisClient = redisClient;
      sessionRedisEnvHint = _redisResolved.envHint;

      redisClient.on('error', (err) => {
        if (!redisClient._loggedError) {
          sessionRedisConnectError = err.message || String(err);
          console.error('[session-store] Redis wire error:', err.message);
          redisClient._loggedError = true;
        }
      });
      redisClient.on('ready', () => {
        console.log('[session-store] Redis wire connected and ready');
        redisClient._loggedError = false;
      });

      _redisConnectPromise = redisClient.connect().catch((err) => {
        sessionRedisConnectError = err.message || String(err);
        console.error('[session-store] Redis wire initial connect failed:', err.message);
      });

      const rawStore = new RedisStore({ client: redisClient, prefix: 'banking:sess:' });
      sessionStore = createFaultTolerantStore(rawStore, {
        onError: (method, err) => { sessionRedisConnectError = err.message || String(err); },
      });
      sessionStoreType = 'redis-wire';
      console.log(`[session-store] Using Redis wire store (from ${sessionRedisEnvHint}), eager connect initiated`);
    } catch (err) {
      sessionRedisInitError = err.message || String(err);
      sessionRedisClient = null;
      console.warn('[session-store] connect-redis/redis not available, falling back to memory store:', err.message);
    }
  }
}

if (!sessionStore && (process.env.VERCEL || process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT)) {
  const platform = process.env.VERCEL ? 'Vercel' : 'Replit';
  console.warn(
    `[session-store] WARNING: Running on ${platform} without Redis. ` +
    'Sessions use in-memory store — they will be lost on process restart. ' +
    'Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for persistent sessions (HTTP — no TCP required).',
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
const authorizeRoutes   = require('./routes/authorize');
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
 * demo-scenario + tokens/* load with the dashboard (same burst as accounts/my); counting them toward the
 * global bucket caused 429 before auth-heavy routes could succeed.
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
    p.startsWith('/api/demo-scenario') ||
    p.startsWith('/api/tokens') ||
    p === '/api/auth/session' ||
    p === '/api/auth/oauth/status' ||
    p === '/api/auth/oauth/user/status' ||
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

/**
 * Ensure the Redis wire-protocol client is ready before express-session runs.
 * Only relevant when sessionStoreType === 'redis-wire'.  The Upstash REST
 * store is HTTP — no connection to wait for.
 */
function awaitSessionRedisReady(req, res, next) {
  if (sessionStoreType !== 'redis-wire') return next(); // REST/memory need no warm-up
  if (!sessionRedisClient) return next();
  if (sessionRedisClient.isReady) return next();
  if (_redisConnectPromise) {
    _redisConnectPromise.then(() => next());
    return;
  }
  next();
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

// P1 — Upstash re-fetch: when a _auth-cookie restore left us with no tokens
// (Lambda B cold-start race), attempt one Upstash read with the session ID to
// pull the tokens that Lambda A wrote. Non-fatal; no-op outside Upstash-REST deployments.
app.use(async (req, _res, next) => {
  if (!req.session?._restoredFromCookie) return next();
  if (req.session.oauthTokens && req.session.oauthTokens.accessToken !== '_cookie_session') return next();
  if (!sessionStore || typeof sessionStore.get !== 'function') return next();
  const sid = req.sessionID;
  if (!sid) return next();
  try {
    sessionStore.get(sid, (err, stored) => {
      if (!err && stored?.oauthTokens && stored.oauthTokens.accessToken !== '_cookie_session') {
        Object.assign(req.session, stored);
        req.session._restoredFromCookie = false;
        req.session.save((saveErr) => {
          if (saveErr) console.warn('[session-refetch] save after Upstash re-fetch failed:', saveErr.message);
        });
        console.log('[session-refetch] Tokens recovered from Upstash for cookie-only session sid=' + sid.slice(0, 8) + '…');
      }
      next();
    });
  } catch (refetchErr) {
    console.warn('[session-refetch] Non-fatal re-fetch error:', refetchErr.message);
    next();
  }
});

// RFC 6749 §6 — silently refresh near-expired end-user access tokens on
// authenticated API routes so UIs never serve stale tokens to downstream services.
// Include /api/auth/oauth so GET /api/auth/oauth/user/status (and admin /status) run
// refresh before the handler — otherwise the SPA sees authenticated:true while
// /api/accounts/my still gets 401 from validatePingOneCoreToken on an expired JWT.
app.use(
  [
    '/api/users',
    '/api/accounts',
    '/api/transactions',
    '/api/mcp',
    '/api/banking-agent',
    '/api/tokens',
    '/api/demo-scenario',
    '/api/auth/oauth',
  ],
  refreshIfExpiring,
);

// Health check endpoint
app.get('/api/healthz', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    port: PORT 
  });
});

// P2 — Role switch: initiates an OAuth re-login to a different role without a
// full sign-out cycle.  Stashes the current tokens in Upstash under a keyed
// prev-session entry (60s TTL) and redirects to PingOne for the target role.
app.post('/api/auth/switch', (req, res) => {
  const { targetRole } = req.body || {};
  if (!['admin', 'customer'].includes(targetRole)) {
    return res.status(400).json({ error: 'invalid_target', message: 'targetRole must be "admin" or "customer".' });
  }

  // Stash current tokens (non-fatal; best-effort)
  const prevTokens = req.session?.oauthTokens;
  const prevUser   = req.session?.user;
  if (prevTokens && upstashSessionStoreInstance && prevUser?.id) {
    const key = `sessions:prev:${prevUser.id}`;
    upstashSessionStoreInstance.kv.set(key, JSON.stringify({ oauthTokens: prevTokens, user: prevUser }), { ex: 60 })
      .catch(e => console.warn('[auth/switch] Failed to stash previous session:', e.message));
  }

  // Clear current auth
  delete req.session.oauthTokens;
  delete req.session.user;
  delete req.session.clientType;
  delete req.session.oauthType;
  clearAuthCookie(res, isProduction);

  // Set switch_target cookie so the OAuth callback knows where to redirect
  const cookieOpts = {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 5 * 60 * 1000, // 5 minutes
    path: '/',
  };
  res.cookie('_switch_target', targetRole, cookieOpts);

  // Return the appropriate login URL for the client to navigate to
  const origin = req.headers.origin || '';
  const loginUrl = targetRole === 'admin'
    ? `${origin}/api/auth/oauth/login`
    : `${origin}/api/auth/oauth/user/login`;

  req.session.save(() => res.json({ redirectUrl: loginUrl }));
});

// Belt-and-suspenders cookie/session clear — called by the SPA after it detects
// that the user just returned from the logout redirect chain.  Ensures the _auth
// cookie is cleared even if the 302-redirect Set-Cookie header was not honoured
// by an intermediate redirect (e.g. PingOne signoff without id_token_hint).
app.post('/api/auth/clear-session', (req, res) => {
  clearAuthCookie(res, isProduction);
  if (req.session) {
    req.session.destroy(() => {});
  }
  res.json({ ok: true });
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

/**
 * Safe OAuth token summary for /api/auth/debug — no secrets or raw JWTs.
 */
function summarizeOAuthTokensForDebug(tokens) {
  if (!tokens || typeof tokens !== 'object') {
    return { present: false };
  }
  const at = typeof tokens.accessToken === 'string' ? tokens.accessToken : '';
  return {
    present: true,
    accessTokenLength: at.length,
    accessTokenStub: at === '_cookie_session',
    accessTokenLooksLikeJwt: at.startsWith('eyJ'),
    hasRefreshToken:
      typeof tokens.refreshToken === 'string' &&
      tokens.refreshToken.length > 0 &&
      tokens.refreshToken !== '_cookie_session',
    hasIdToken: typeof tokens.idToken === 'string' && tokens.idToken.length > 0,
    expiresAt: tokens.expiresAt ?? null,
    expiresInSec:
      typeof tokens.expiresAt === 'number'
        ? Math.round((tokens.expiresAt - Date.now()) / 1000)
        : null,
  };
}

/**
 * High-signal hints for Vercel/session issues (compare with ?deep=1 Redis probe).
 */
function buildSessionDiagnosisHints(req, { sessionStoreHealthy, accessTokenStub, redisPersist }) {
  const hints = [];
  const stub = accessTokenStub === true;

  if (req.session?._restoredFromCookie) {
    hints.push(
      'sessionRestored: express had no user before _auth cookie middleware — identity rebuilt from signed cookie.',
    );
  }
  if (stub) {
    hints.push(
      'accessToken is _cookie_session stub — no real OAuth token in req.session (cookie restore, or session save failed after OAuth).',
    );
  }
  if (sessionStoreHealthy === false) {
    hints.push('Session store ping failed or circuit open — see sessionStoreError and sessionCircuitState.');
  }
  if (redisPersist && typeof redisPersist === 'object') {
    if (redisPersist.redisReadSkipped === 'circuit_open_reads_bypass_redis') {
      hints.push(
        'Circuit OPEN: store.get() does not read Redis — you can get an empty session + cookie stub even if Redis has rows for other sids.',
      );
    }
    if (redisPersist.redisKeyPresent === false) {
      hints.push(
        'Redis has no session row for this connect.sid — never saved, expired, or sid changed after OAuth. Sign in again.',
      );
    }
    if (
      redisPersist.redisKeyPresent === true &&
      redisPersist.redisAccessTokenStub === false &&
      stub
    ) {
      hints.push(
        'ANOMALY: Redis row has non-stub token for this sid but req.session has stub — investigate cache/session ordering.',
      );
    }
    if (
      redisPersist.redisKeyPresent === true &&
      redisPersist.redisAccessTokenStub === true &&
      stub
    ) {
      hints.push('Redis row for this sid also has stub token — persisted cookie-only state.');
    }
    if (
      redisPersist.redisKeyPresent === true &&
      redisPersist.redisAccessTokenStub === false &&
      !stub
    ) {
      hints.push('Redis row and req.session both have real tokens — OK.');
    }
  }
  if (!stub && req.session?.oauthTokens?.accessToken && String(req.session.oauthTokens.accessToken).startsWith('eyJ')) {
    hints.push('req.session has JWT-shaped access token — OK for BFF-backed routes.');
  }
  return hints;
}

// Debug endpoint — shows auth state for the current request (Vercel debugging).
// Returns cookie presence, session state, and platform flags.
// No secrets are exposed.
app.get('/api/auth/debug', async (req, res) => {
  const cookieNames = Object.keys(
    Object.fromEntries(
      (req.headers.cookie || '').split(';').map(p => [p.split('=')[0].trim(), 1])
    )
  ).filter(Boolean);

  const deepProbe =
    req.query.deep === '1' ||
    req.query.deep === 'true' ||
    req.query.deep === '';

  // Quick store health check — cached for 60 s to avoid burning Upstash request quota.
  // Wire-protocol ping is skipped to avoid adding latency to the debug response.
  let sessionStoreHealthy = null;
  let sessionStoreError   = null;
  if (upstashSessionStoreInstance) {
    const now = Date.now();
    if (!upstashSessionStoreInstance._pingCache ||
        now - upstashSessionStoreInstance._pingCache.ts > 300_000) { // 5-minute cache
      const pingResult = await upstashSessionStoreInstance.ping();
      upstashSessionStoreInstance._pingCache = { ts: now, result: pingResult };
      if (!pingResult.healthy) {
        console.error('[session-store] Health check failed:', pingResult.error);
      }
    }
    const { result } = upstashSessionStoreInstance._pingCache;
    sessionStoreHealthy = result.healthy;
    sessionStoreError   = result.error;
    // If circuit is currently open, override healthy to false without calling ping again
    if (upstashSessionStoreInstance._circuit?.isOpen) {
      sessionStoreHealthy = false;
      sessionStoreError   = upstashSessionStoreInstance._circuit.lastError || 'circuit open — Upstash bypassed';
    }
  }

  const accessTokenStub = req.session?.oauthTokens?.accessToken === '_cookie_session';
  const cookieOnlyBffSession =
    req.session?._restoredFromCookie === true || accessTokenStub;
  const token = req.session?.oauthTokens?.accessToken;
  const hasOAuthToken = !!(token && token !== '_cookie_session');
  const oauthUserWouldAuthenticate = !!(
    req.session?.user &&
    hasOAuthToken &&
    req.session.oauthType === 'user'
  );

  let redisPersist = null;
  if (deepProbe && upstashSessionStoreInstance && typeof upstashSessionStoreInstance.getPersistenceDebug === 'function') {
    redisPersist = await upstashSessionStoreInstance.getPersistenceDebug(req.session?.id);
  }

  const sessionInMemoryCache =
    upstashSessionStoreInstance &&
    typeof upstashSessionStoreInstance.hasInMemorySessionCache === 'function'
      ? upstashSessionStoreInstance.hasInMemorySessionCache(req.session?.id)
      : null;

  const oauthTokenSummary = summarizeOAuthTokensForDebug(req.session?.oauthTokens);
  const diagnosisHints = buildSessionDiagnosisHints(req, {
    sessionStoreHealthy,
    accessTokenStub,
    redisPersist,
  });
  if (sessionInMemoryCache === true && accessTokenStub) {
    diagnosisHints.push(
      'sessionInMemoryCache: true — this instance cached the session blob; it still has stub tokens (not a simple cold-cache miss).',
    );
  }

  res.json({
    platform: { vercel: !!process.env.VERCEL, replit: !!process.env.REPL_ID, production: isProduction },
    request: {
      vercelId: req.get('x-vercel-id') || null,
      vercelDeploymentId: req.get('x-vercel-deployment-id') || null,
      forwardedFor: (req.get('x-forwarded-for') || '').split(',')[0]?.trim() || null,
    },
    sessionPresent:    !!req.session,
    sessionId:         req.session?.id ? req.session.id.slice(0, 8) + '...' : null,
    sessionIdLength:   req.session?.id ? String(req.session.id).length : null,
    sessionHasUser:    !!req.session?.user,
    sessionOauthType:  req.session?.oauthType || null,
    sessionClientType: req.session?.clientType || null,
    sessionRestored:   !!req.session?._restoredFromCookie,
    sessionHasTokens:  !!req.session?.oauthTokens?.accessToken,
    accessTokenStub,
    oauthTokenSummary,
    cookieOnlyBffSession,
    oauthUserWouldAuthenticate,
    cookiesPresent:    cookieNames,
    hasAuthCookie:     cookieNames.includes('_auth'),
    hasPkceCookie:     cookieNames.includes('_pkce'),
    sessionCookieName: cookieNames.includes('connect.sid') ? 'connect.sid present' : 'connect.sid MISSING',
    /** 'upstash-rest' (HTTP, recommended) | 'redis-wire' (TCP) | 'memory' (no persistence) */
    sessionStoreType,
    /** Live health check result for the Upstash REST store (null if wire/memory store). */
    sessionStoreHealthy,
    /** Non-null when sessionStoreHealthy is false — the actual error message for debugging. */
    sessionStoreError,
    /** Circuit breaker state: CLOSED (normal) | OPEN (bypassing Redis) | HALF_OPEN (probing) */
    sessionCircuitState: upstashSessionStoreInstance?._circuit?.state ?? null,
    sessionCircuitLastError: upstashSessionStoreInstance?._circuit?.lastError ?? null,
    /** Age of cached ping result (ms); null if not yet pinged. */
    sessionPingCacheAgeMs: upstashSessionStoreInstance?._pingCache
      ? Date.now() - upstashSessionStoreInstance._pingCache.ts
      : null,
    /** Warm Lambda: session blob served from 45s in-process cache (Upstash only). */
    sessionInMemoryCache,
    /** Backward-compat: 'redis' when any persistent store is active, 'memory' otherwise. */
    bffSessionStore: sessionStore ? 'redis' : 'memory',
    /** Which env supplied the store credentials. */
    sessionRedisEnv: sessionRedisEnvHint,
    /** For wire-protocol store only — null when using Upstash REST. */
    sessionRedisClientReady: sessionRedisClient ? !!sessionRedisClient.isReady : null,
    sessionRedisInitError:   sessionRedisInitError   || null,
    sessionRedisConnectError: sessionRedisConnectError || null,
    storageType:       configStore.getStorageType(),
    isConfigured:      configStore.isConfigured(),
    userEmail:         req.session?.user?.email || null,
    userRole:          req.session?.user?.role || null,
    diagnosisHints,
    /** One Redis GET for current sid — pass ?deep=1. Omitted unless deep probe ran. */
    redisPersist,
    debugHelp: {
      deepQuery:
        'Add ?deep=1 to run one Upstash GET for this session id and compare redis row vs req.session (extra read quota).',
      deepProbeUsed: !!(deepProbe && upstashSessionStoreInstance),
    },
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

// Attach cached session-store health to req so /api/auth/session can include it.
app.use('/api/auth', (req, _res, next) => {
  const ping = upstashSessionStoreInstance?._pingCache?.result;
  req._sessionStoreError = ping?.error ?? null;
  req._sessionStoreHealthy = typeof ping?.healthy === 'boolean' ? ping.healthy : null;
  next();
});
app.use('/api/auth', authRoutes);
app.use('/api/auth/oauth', oauthRoutes);
app.use('/api/auth/oauth/user', oauthUserRoutes);
app.use('/api/auth/ciba', cibaRoutes);
app.use('/api/agent', agentIdentityRoutes);
// NL route uses its own req.session?.user check — full JWT validation is not
// needed here and causes invalid_token errors when JWKS fetch times out.
app.use('/api/banking-agent', bankingAgentNlRoutes);
app.use('/api/authorize', authorizeRoutes);
app.use('/api/mcp/inspector', authenticateToken, mcpInspectorRoutes);
app.use('/api/tokens', authenticateToken, tokenRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/accounts', authenticateToken, accountRoutes);
app.use('/api/transactions', authenticateToken, transactionRoutes);
app.use('/api/demo-scenario', authenticateToken, demoScenarioRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/clients', authenticateToken, clientRegistrationRoutes);
app.use('/api/logs', logsRoutes);

// PATCH /api/demo/may-act — set/clear mayAct attribute on the signed-in PingOne user
app.patch('/api/demo/may-act', express.json(), authenticateToken, demoScenarioRoutes.patchMayAct);

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
    const status = err.httpStatus || 502;
    const events = err.tokenEvents && err.tokenEvents.length ? err.tokenEvents : [];
    // AGENT_CONSENT_REQUIRED — surface the consent URL so the UI can prompt the user
    if (err.code === 'AGENT_CONSENT_REQUIRED') {
      const origin = getFrontendOrigin(req);
      return res.status(403).json({
        error: 'agent_consent_required',
        message: err.message,
        consentUrl: `${origin}/api/auth/oauth/user/consent-url`,
        tokenEvents: events,
      });
    }
    return res.status(status).json({
      error: err.code || 'token_exchange_failed',
      message: err.message,
      tokenEvents: events,
    });
  }

  if (!agentToken) {
    // No bearer token (cookie-only or degraded session) — use local handler if session user present.
    // This lets the banking agent work for basic operations even without a fully-hydrated Redis session.
    const sessionUser = req.session?.user;
    if (sessionUser?.id) {
      console.log(`[MCP Local] ${tool} — no bearer token (cookie-only session), using local handler`);
      try {
        const result = await callToolLocal(tool, params || {}, sessionUser.id);
        return res.json({ result, tokenEvents, _localFallback: true });
      } catch (localErr) {
        console.error(`[MCP Local] Error calling ${tool}:`, localErr.message);
        return res.status(502).json({ error: 'mcp_error', message: localErr.message, tokenEvents });
      }
    }
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
    // SPA fallback — serve index.html for all non-API routes.
    // Must not be cached so browsers always fetch the latest asset hashes.
    app.get('*', (req, res) => {
      res.set('Cache-Control', 'no-store');
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
app.use((err, req, res, _next) => {
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
