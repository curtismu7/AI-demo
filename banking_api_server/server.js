// Load environment variables — local dev: root .env takes precedence over banking_api_server/.env
const path = require('path');
require('dotenv').config({
    path: path.resolve(__dirname, '../.env'),
    override: false
});
require('dotenv').config({
    override: false
});

// Validate required env vars at startup — exits in production if any are missing
require('./scripts/check-env');

// ConfigStore must be required early so oauth config module getters are ready
const configStore = require('./services/configStore');
const appEventService = require('./services/appEventService');
const {
    mcpNoBearerResponse
} = require('./services/bffSessionGating');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const session = require('express-session');

const isReplit = !!process.env.REPL_ID || !!process.env.REPLIT_DEPLOYMENT;
const isProduction = process.env.NODE_ENV === 'production' || isReplit;

// Log deployment context on startup
if (isReplit) console.log('[platform] Replit deployment detected');
if (!isReplit && isProduction) console.log('[platform] Production deployment');

// Security guard: SKIP_TOKEN_SIGNATURE_VALIDATION must never be enabled in production.
// Validates at startup (before any request is served) so misconfigurations are caught early.
if (process.env.SKIP_TOKEN_SIGNATURE_VALIDATION === 'true' && isProduction) {
    console.error('[FATAL] SKIP_TOKEN_SIGNATURE_VALIDATION=true is not allowed in production. Remove this env var before deploying.');
    process.exit(1);
}

// ── Session store ──
// Priority: SQLite (persistent, local) → Memory (last resort).
/** 'sqlite' | 'memory' */
let sessionStoreType = 'memory';
let sessionStore;

// ── Priority 3: SQLite store (local development fallback) ───────────────────
if (!sessionStore) {
    try {
        const SqliteSessionStore = require('./services/sqliteSessionStore');
        sessionStore = new SqliteSessionStore({
            dbPath: path.join(__dirname, 'data/sessions.db'),
            ttl: 24 * 60 * 60 * 1000, // 24 hours
        });
        sessionStoreType = 'sqlite';
        console.log('[session-store] Using SQLite store for local development — sessions persist across restarts');
    } catch (err) {
        console.warn('[session-store] SQLite store init failed, falling back to memory store:', err.message);
    }
}

// Import routes
const authRoutes = require('./routes/auth');
const oauthRoutes = require('./routes/oauth');
const oauthUserRoutes = require('./routes/oauthUser');
const oauthService = require('./services/oauthService');
const userRoutes = require('./routes/users');
const accountRoutes = require('./routes/accounts');
const sensitiveBankingRoutes = require('./routes/sensitiveBanking');
const transactionRoutes = require('./routes/transactions');
const demoScenarioRoutes = require('./routes/demoScenario');
const adminRoutes = require('./routes/admin');
const adminConfigRoutes = require('./routes/adminConfig');
const adminManagementRoutes = require('./routes/adminManagement');
const cibaRoutes = require('./routes/ciba');
const mfaRoutes = require('./routes/mfa');
const mfaTestRoutes = require('./routes/mfaTest');
const authorizeRoutes = require('./routes/authorize');
const setupRoutes = require('./routes/setup');
const setupWizardRoutes = require('./routes/setupWizard');
const selfServiceUsersRoutes = require('./routes/selfServiceUsers');
const {
    router: featureFlagsRoutes
} = require('./routes/featureFlags');
const mcpInspectorRoutes = require('./routes/mcpInspector');
const mcpTrafficRoutes = require('./routes/mcpTraffic');
const mcpToolScopesRouter = require('./routes/mcpToolScopes');
const mcpGatewayConfigRouter = require('./routes/mcpGatewayConfig');
const mcpAuditRouter = require('./routes/mcpAudit');
const agentIdentityRoutes = require('./routes/agentIdentity');
const agentDelegationRoutes = require('./routes/agentDelegation');
const mcpDecisionPollingRoutes = require('./routes/mcpDecisionPolling');
const bankingAgentRoutes = require('./routes/bankingAgentRoutes');
const bankingAgentNlRoutes = require('./routes/bankingAgentNl');
const langchainConfigRoutes = require('./routes/langchainConfig');
const tokenRoutes = require('./routes/tokens');
const logsRoutes = require('./routes/logs');
const delegationRoutes = require('./routes/delegation');
const tokenChainRoutes = require('./routes/tokenChain');
const {
    router: clientRegistrationRoutes,
    wellKnownHandler
} = require('./routes/clientRegistration');
const protectedResourceMetadataRoutes = require('./routes/protectedResourceMetadata');
const introspectRoutes = require('./routes/introspect');
const migrationRoutes = require('./routes/migration');
const securityMonitoringRoutes = require('./routes/securityMonitoring');
const oauthClientsRoutes = require('./routes/oauthClients');
const oauthTokenRoutes = require('./routes/oauthToken');
const {
    getOAuthRedirectDebugInfo,
    getFrontendOrigin
} = require('./services/oauthRedirectUris');
const {
    restoreSessionFromCookie,
    clearAuthCookie
} = require('./services/authStateCookie');
const {
    migrateAccounts
} = require('./services/demoDataService');
const appConfigRoutes = require('./routes/appConfig');
const configCredentialsRoutes = require('./routes/configCredentials');
const verticalConfigRoutes = require('./routes/verticalConfig');
const pingoneAuditRoutes = require('./routes/pingoneAudit');
const pingoneTestRoutes = require('./routes/pingoneTestRoutes');
const tokenDisplayRoutes = require('./routes/tokenDisplay');
const apiCallTrackerRoutes = require('./routes/apiCallTracker');
const { trackApiCall } = require('./services/apiCallTrackerService');
const resourceServerRoutes = require('./routes/resourceServer');
const resourceServerCCRoutes = require('./routes/resourceServerCC');
const { initializeDiscovery } = require('./services/oauthEndpointResolver');
const { registerCallbacks } = require('./services/callbackDispatcher');

// Import middleware
const {
    authenticateToken,
    requireSession
} = require('./middleware/auth');
const {
    logActivity
} = require('./middleware/activityLogger');
const {
    correlationIdMiddleware
} = require('./middleware/correlationId');
const {
    delegationAuditMiddleware
} = require('./middleware/delegationAuditLogger');
const {
    refreshIfExpiring
} = require('./middleware/tokenRefresh');
const audValidationMiddleware = require('./middleware/audValidationMiddleware');

const app = express();

// Response timing instrumentation
app.use(require('./middleware/timing'));
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
    // Content-Security-Policy
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // CRA requires unsafe-inline in prod build
            styleSrc: ["'self'", "'unsafe-inline'", "https://assets.pingone.com"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://*.pingone.com', 'https://*.pingidentity.com', 'wss:'],
            fontSrc: ["'self'", 'data:'],
            frameAncestors: ["'none'"],
        },
    },
    // HSTS — 2 years, include subdomains
    strictTransportSecurity: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true,
    },
    // X-Frame-Options: DENY
    frameguard: {
        action: 'deny'
    },
    // Referrer-Policy
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
    },
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
app.use(cors({
    // In production, CORS_ORIGIN should be set to the frontend URL.
    // Fallback to false (block all cross-origin) rather than reflecting any Origin.
    // The React CRA dev proxy makes requests same-origin in development, so this
    // fallback only affects calls from a different origin without the env var set.
    origin: process.env.CORS_ORIGIN || 'https://api.pingdemo.com',
    credentials: true
}));

// Trust proxy headers from any load balancer in front of Express.
app.set('trust proxy', 1);

// Enforce HTTPS on Replit — redirect any plain HTTP request.
// Replit terminates TLS before Express and sets x-forwarded-proto.
if (isReplit) {
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
    // Use an absolute URL so the redirect works behind a reverse proxy.
    if (req.path.startsWith('/api/auth')) {
        const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
        const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
        const origin = host ? `${proto}://${host}` : (process.env.REACT_APP_CLIENT_URL || process.env.PUBLIC_APP_URL || 'https://api.pingdemo.com:4000');
        return res.redirect(`${origin}/login?error=too_many_requests`);
    }
    res.status(429).json({
        error: 'Too many requests. Please wait a few minutes and try again.'
    });
};
const DEV_GLOBAL_LIMIT  = 20000;
const PROD_GLOBAL_LIMIT = 8000;
const DEV_AUTH_LIMIT    = 500;
const PROD_AUTH_LIMIT   = 300;
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    // Generous defaults for demos/testing; override with RATE_LIMIT_MAX. Production can tighten via env.
    max: (() => {
        const n = parseInt(process.env.RATE_LIMIT_MAX || '', 10);
        if (Number.isFinite(n) && n > 0) return n;
        return process.env.NODE_ENV === 'development' ? DEV_GLOBAL_LIMIT : PROD_GLOBAL_LIMIT;
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
        return process.env.NODE_ENV === 'development' ? DEV_AUTH_LIMIT : PROD_AUTH_LIMIT;
    })(),
    handler: _rateLimitHandler,
    skip: () => rateLimitDisabled,
});
app.use('/api/auth/oauth/login', authLimiter);
app.use('/api/auth/oauth/callback', authLimiter);
app.use('/api/auth/oauth/user/login', authLimiter);
app.use('/api/auth/oauth/user/callback', authLimiter);

// Logging middleware
// Skip access-log noise from high-frequency polling endpoints
const POLL_ROUTES = new Set([
  '/api/auth/oauth/user/status',
  '/api/auth/oauth/status',
  '/api/tokens/session-preview',
  '/api/auth/session',
  '/api/auth/ciba/status',
  '/api/config/vertical',
  '/api/admin/config',
]);
app.use(morgan('combined', {
  skip: (req) => POLL_ROUTES.has(req.path),
}));

app.use(session({
    secret: (() => {
        const s = process.env.SESSION_SECRET;
        if (!s || s === 'dev-session-secret-change-in-production') {
            if (process.env.NODE_ENV === 'production' || process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT) {
                console.error('[FATAL] SESSION_SECRET env var is not set or is using the insecure default. Set a random 32+ character string in your deployment environment.');
                process.exit(1);
            }
            console.warn('[security] SESSION_SECRET not set — using insecure default (dev only).');
        }
        return s || 'dev-session-secret-change-in-production';
    })(),
    resave: false,
    saveUninitialized: false,
    ...(sessionStore ? {
        store: sessionStore
    } : {}),
    cookie: {
        secure: isProduction,
        httpOnly: true,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

// Correlation ID — attach X-Request-ID to every request/response for distributed tracing.
app.use(correlationIdMiddleware);

// Activity logging middleware
app.use(logActivity);

// Delegation audit logging — extract act/may_act claims for audit trail
app.use(delegationAuditMiddleware);

// Ensure configStore is loaded before any request touches OAuth config.
// The promise is memoised — this is a no-op after the first request.
app.use(async (_req, _res, next) => {
    try {
        await configStore.ensureInitialized();
        next();
    } catch (err) {
        next(err);
    }
});

// Migrate demo accounts to persistent storage on startup
migrateAccounts().catch(err => {
    console.error('[server] Demo accounts migration failed:', err.message);
});

// Non-blocking OIDC discovery — populates endpoint cache when oauth_discovery_enabled=true
initializeDiscovery().catch(err => {
    console.warn('[server] OIDC discovery initialization failed:', err.message);
});

// Restore session user from signed _auth cookie when in-memory session is empty.
app.use(restoreSessionFromCookie);

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

// RFC 6750 §3 — Validate audience (aud) claim on all incoming tokens
// Prevents token confusion attacks (token for API A cannot be used for API B).
// Fails closed: if aud doesn't match, return 401 Unauthorized.
// Applied to all /api/ routes after authentication.
app.use('/api', audValidationMiddleware);

// High-frequency polling paths excluded from API Explorer tracking to avoid noise
const TRACKING_SKIP_PREFIXES = [
    '/api-calls', '/tokens/session-preview', '/tokens/agent-cc-preview',
    '/healthz', '/health', '/mcp/traffic', '/oauth/monitor',
];

// Auto-track all /api/* calls into the API Explorer (skips polling endpoints to avoid noise)
app.use('/api', (req, res, next) => {
    if (TRACKING_SKIP_PREFIXES.some(p => req.path.startsWith(p))) return next();
    const start = Date.now();
    const origJson = res.json.bind(res);
    let captured = null;
    res.json = (body) => {
        captured = body;
        return origJson(body);
    };
    res.on('finish', () => {
        trackApiCall({
            sessionId: req.session?.id || 'default',
            method: req.method,
            url: req.originalUrl,
            requestBody: req.body && Object.keys(req.body).length ? req.body : null,
            responseStatus: res.statusCode,
            responseBody: captured,
            duration: Date.now() - start,
            category: 'api',
        }).catch(() => {});
    });
    next();
});

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
    const {
        targetRole
    } = req.body || {};
    if (!['admin', 'customer'].includes(targetRole)) {
        return res.status(400).json({
            error: 'invalid_target',
            message: 'targetRole must be "admin" or "customer".'
        });
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
    const loginUrl = targetRole === 'admin' ?
        `${origin}/api/auth/oauth/login` :
        `${origin}/api/auth/oauth/user/login`;

    req.session.save(() => res.json({
        redirectUrl: loginUrl
    }));
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
    res.json({
        ok: true
    });
});

// Unified logout — destroys whichever session is active and redirects
// browser → PingOne RP-Initiated Logout → post_logout_redirect_uri (/logout).
// Called as a full page navigation (window.location.href), NOT via axios.
app.get('/api/auth/logout', async (req, res) => {
    const idToken = req.session.oauthTokens ?.idToken || null;
    const accessToken = req.session.oauthTokens ?.accessToken || null;
    const refreshToken = req.session.oauthTokens ?.refreshToken || null;
    const postLogoutUri = `${getFrontendOrigin(req)}/logout`;

    // RFC 7009 — revoke tokens before destroying the session so they can no
    // longer be used even if intercepted.  Runs in parallel; non-fatal on error.
    if (accessToken && accessToken !== '_cookie_session') {
        oauthService.revokeToken(accessToken, 'access_token')
            .catch(err => console.warn('[logout] access token revoke error:', err.message));
    }
    if (refreshToken && refreshToken !== '_cookie_session') {
        oauthService.revokeToken(refreshToken, 'refresh_token')
            .catch(err => console.warn('[logout] refresh token revoke error:', err.message));
    }

    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error during unified logout:', err);
        }

        // Clear the auth-state cookie so the session-restore middleware does not
        // keep the user signed in on the next request.
        clearAuthCookie(res, isProduction);

        const envId = configStore.getEffective('pingone_environment_id');
        const region = configStore.getEffective('pingone_region') || 'com';
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
 * Safe OAuth token summary for /api/auth/debug — no secrets or raw JWTs.
 */
function summarizeOAuthTokensForDebug(tokens) {
    if (!tokens || typeof tokens !== 'object') {
        return {
            present: false
        };
    }
    const at = typeof tokens.accessToken === 'string' ? tokens.accessToken : '';
    return {
        present: true,
        accessTokenLength: at.length,
        accessTokenStub: at === '_cookie_session',
        accessTokenLooksLikeJwt: at.startsWith('eyJ'),
        hasRefreshToken: typeof tokens.refreshToken === 'string' &&
            tokens.refreshToken.length > 0 &&
            tokens.refreshToken !== '_cookie_session',
        hasIdToken: typeof tokens.idToken === 'string' && tokens.idToken.length > 0,
        expiresAt: tokens.expiresAt ?? null,
        expiresInSec: typeof tokens.expiresAt === 'number' ?
            Math.round((tokens.expiresAt - Date.now()) / 1000) : null,
    };
}

/**
 * High-signal hints for session issues.
 */
function buildSessionDiagnosisHints(req, { accessTokenStub }) {
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
    if (!stub && req.session ?.oauthTokens ?.accessToken && String(req.session.oauthTokens.accessToken).startsWith('eyJ')) {
        hints.push('req.session has JWT-shaped access token — OK for BFF-backed routes.');
    }
    return hints;
}

// Debug endpoint — shows auth state for the current request.
// Returns cookie presence, session state, and platform flags.
// No secrets are exposed.
app.get('/api/auth/debug', async (req, res) => {
    const cookieNames = Object.keys(
        Object.fromEntries(
            (req.headers.cookie || '').split(';').map(p => [p.split('=')[0].trim(), 1])
        )
    ).filter(Boolean);

    const accessTokenStub = req.session ?.oauthTokens ?.accessToken === '_cookie_session';
    const cookieOnlyBffSession =
        req.session?._restoredFromCookie === true || accessTokenStub;
    const token = req.session ?.oauthTokens ?.accessToken;
    const hasOAuthToken = !!(token && token !== '_cookie_session');
    const oauthUserWouldAuthenticate = !!(
        req.session ?.user &&
        hasOAuthToken &&
        req.session.oauthType === 'user'
    );

    const oauthTokenSummary = summarizeOAuthTokensForDebug(req.session ?.oauthTokens);
    const diagnosisHints = buildSessionDiagnosisHints(req, { accessTokenStub });

    res.json({
        platform: {
            replit: !!process.env.REPL_ID,
            production: isProduction
        },
        sessionPresent: !!req.session,
        sessionId: req.session ?.id ? req.session.id.slice(0, 8) + '...' : null,
        sessionHasUser: !!req.session ?.user,
        sessionOauthType: req.session ?.oauthType || null,
        sessionClientType: req.session ?.clientType || null,
        sessionRestored: !!req.session?._restoredFromCookie,
        sessionHasTokens: !!req.session ?.oauthTokens ?.accessToken,
        accessTokenStub,
        oauthTokenSummary,
        cookieOnlyBffSession,
        oauthUserWouldAuthenticate,
        cookiesPresent: cookieNames,
        hasAuthCookie: cookieNames.includes('_auth'),
        hasPkceCookie: cookieNames.includes('_pkce'),
        sessionCookieName: cookieNames.includes('connect.sid') ? 'connect.sid present' : 'connect.sid MISSING',
        sessionStoreType,
        storageType: configStore.getStorageType(),
        isConfigured: configStore.isConfigured(),
        userEmail: req.session ?.user ?.email || null,
        userRole: req.session ?.user ?.role || null,
        diagnosisHints,
    });
});

// API Routes
// IMPORTANT: /api/admin/config MUST be registered before /api/admin so that
// unauthenticated requests to the config endpoint are not blocked by the
// authenticateToken middleware that guards the broader /api/admin/* prefix.
app.use('/api/admin/config', adminConfigRoutes);

// Feature flags — admin-authenticated; registered before the broader /api/admin/* guard
// so the route path is unambiguous.
app.use('/api/admin/feature-flags', authenticateToken, featureFlagsRoutes);
app.use('/api/admin/scope-audit', authenticateToken, require('./routes/scopeAudit'));
app.use('/api/admin/token-compliance', authenticateToken, require('./routes/tokenCompliance'));

// PingOne redirect URI allowlist (JSON). Registered here BEFORE /api/auth so the path is not
// handled only by routes/auth.js (avoids "Cannot GET" on some deployments).
app.get('/api/auth/oauth/redirect-info', (req, res) => {
    try {
        res.json(getOAuthRedirectDebugInfo(req));
    } catch (err) {
        res.status(500).json({
            error: 'redirect_info_failed',
            message: err.message
        });
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/auth/oauth', oauthRoutes);
app.use('/api/auth/oauth/user', oauthUserRoutes);
registerCallbacks(app, oauthRoutes, oauthUserRoutes, authLimiter);
app.use('/api/auth/ciba', cibaRoutes);
app.use('/api/auth/mfa', mfaRoutes);
app.use('/api/mfa/test', mfaTestRoutes);
app.use('/api/agent', agentIdentityRoutes);
app.use('/api/agent', agentDelegationRoutes);
app.use('/api/mcp', mcpDecisionPollingRoutes);
// NL/search routes: public LLM config + NL parsing. Must be mounted BEFORE bankingAgentRoutes
// so /nl/status, /nl, and /search are handled without agentSessionMiddleware.
app.use('/api/banking-agent', bankingAgentNlRoutes);
// Authenticated agent routes: /init, /message, /consent — require OAuth session.
app.use('/api/banking-agent', bankingAgentRoutes);
app.use('/api/langchain', langchainConfigRoutes);
app.use('/api/authorize', authorizeRoutes);
app.use('/api/introspect', introspectRoutes);
app.use('/api/setup', setupRoutes);
// MCP Inspector: no auth gate at the router level — tools/list returns local catalog for
// unauthenticated visitors; tools/call and context check auth inside each handler.
app.use('/api/mcp', mcpToolScopesRouter);
app.use('/api/mcp/inspector', mcpInspectorRoutes);
// MCP Gateway Config — status + generated PingGateway mcp.json (admin-accessible)
app.use('/api/admin/mcp-gateway', authenticateToken, mcpGatewayConfigRouter);
app.use('/api/mcp/traffic', requireSession, mcpTrafficRoutes);
// MCP Audit: admin-only route — proxies to MCP server /audit internal endpoint (D-11)
app.use('/api/mcp/audit', (req, res, next) => {
    if (!req.session ?.user || req.session.user.role !== 'admin') {
        return res.status(401).json({
            error: 'admin_required',
            message: 'Admin session required to access audit log.'
        });
    }
    next();
}, mcpAuditRouter);
// Session preview uses session data only — no full JWT validation.
// Must be registered BEFORE the auth-gated /api/tokens block.
app.get('/api/tokens/session-preview', (req, res) => {
    try {
        const {
            tokenEvents
        } = buildSessionPreviewTokenEvents(req);
        res.json({
            tokenEvents
        });
    } catch (err) {
        console.error('Token session-preview error:', err);
        res.json({
            tokenEvents: []
        });
    }
});

// Public app-events endpoint — available to ALL pages (not just admin)
// so the spinner activity feed works for customer dashboards too.
app.get('/api/app-events', (req, res) => {
    try {
        const VALID_CATEGORIES = new Set(['oauth','token_exchange','session','jwks','mcp','auth_lifecycle','agent','authorize','agent_prompt','delegation','introspection']);
        const VALID_SEVERITIES = new Set(['info','warning','error','warn']);
        const { category, severity, limit = 100, since } = req.query;
        const safeCategory = VALID_CATEGORIES.has(category) ? category : undefined;
        const safeSeverity = VALID_SEVERITIES.has(severity) ? severity : undefined;
        const safeSince = since && (/^\d{4}-\d{2}-\d{2}(T[\d:.Z\-+]+)?$/).test(since) ? since : undefined;
        const events = appEventService.getEvents({
            category: safeCategory,
            severity: safeSeverity,
            limit: Math.min(parseInt(limit) || 100, 500),
            since: safeSince,
        });
        res.json({ events, total: events.length });
    } catch (error) {
        console.error('Get public app-events error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// agent-cc-preview fetches the agent's own CC token — no user OAuth token needed.
// Register before the authenticateToken block so customers with a valid session can access it.
app.get('/api/tokens/agent-cc-preview', requireSession, tokenRoutes.agentCcPreviewHandler);
app.use('/api/tokens', authenticateToken, tokenRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/self-service/users', authenticateToken, selfServiceUsersRoutes);
app.use('/api/accounts', authenticateToken, accountRoutes);
app.use('/api/accounts', authenticateToken, sensitiveBankingRoutes);
app.use('/api/resource-server', authenticateToken, resourceServerRoutes);
app.use('/api/resource-server-cc', authenticateToken, resourceServerCCRoutes);
app.use('/api/transactions', requireSession, authenticateToken, transactionRoutes);
// GET /api/demo-scenario — return empty defaults when unauthenticated so the public
// /demo-data page never triggers a 401 console error.  All mutating methods (PUT, PATCH)
// still hit authenticateToken via the router below.
app.get('/api/demo-scenario', (req, res, next) => {
    if (req.session ?.user) return next();
    return res.json({
        accounts: [],
        settings: {},
        defaults: null,
        userData: {},
        persistenceNote: null
    });
});
app.use('/api/demo-scenario', authenticateToken, demoScenarioRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/admin/management', adminManagementRoutes);
app.use('/api/admin/setup', setupWizardRoutes);
app.use('/api/clients', authenticateToken, clientRegistrationRoutes);
app.use('/api/oauth/clients', authenticateToken, oauthClientsRoutes);
app.use('/api/oauth/token', oauthTokenRoutes);
app.use('/api/delegation', authenticateToken, delegationRoutes);
app.use('/api/token-chain', authenticateToken, tokenChainRoutes);
app.use('/api/token-display', authenticateToken, tokenDisplayRoutes);
app.use('/api/api-calls', apiCallTrackerRoutes);
app.use('/api/admin/app-config', authenticateToken, appConfigRoutes);
app.use('/api/config/vertical', verticalConfigRoutes);
app.use('/api/config/verticals', verticalConfigRoutes);
app.use('/api/config/credentials', configCredentialsRoutes);

// Health check endpoints (unauthenticated — used by monitoring + demo config UI)
const healthRoutes = require('./routes/health');
app.use('/api/health', healthRoutes);

// Token validation mode config endpoints (admin + ui accessible for demo toggle)
const validationModeConfig = require('./config/validationModeConfig');

app.get('/api/config/validation-mode', (req, res) => {
    const mode = validationModeConfig.getValidationMode();
    res.json({
        mode,
        description: validationModeConfig.getModeDescription(mode),
        metadata: validationModeConfig.getModeMetadata(mode),
        supported: validationModeConfig.SUPPORTED_MODES,
    });
});

app.post('/api/config/validation-mode', (req, res) => {
    // Require admin session to change validation mode
    if (!req.session ?.user) {
        return res.status(401).json({
            error: 'authentication_required',
            message: 'Session required to change validation mode'
        });
    }
    const {
        mode
    } = req.body || {};
    if (!mode) {
        return res.status(400).json({
            error: 'missing_mode',
            message: 'Request body must include "mode" field'
        });
    }
    try {
        validationModeConfig.setValidationMode(mode);
        res.json({
            mode: validationModeConfig.getValidationMode(),
            description: validationModeConfig.getModeDescription(),
            message: `Validation mode set to: ${mode}`,
        });
    } catch (err) {
        res.status(400).json({
            error: 'invalid_mode',
            message: err.message,
            supported: validationModeConfig.SUPPORTED_MODES
        });
    }
});

app.use('/api/logs', logsRoutes);

// PingOne Configuration Audit — admin-accessible endpoint for validating resources and scopes
app.use('/api/pingone/audit', pingoneAuditRoutes);

// PingOne Test Page — /config is public (env settings only, no user data); all other endpoints require auth
app.use('/api/pingone-test', (req, res, next) => {
    if (req.path === '/config' && req.method === 'GET') return next();
    authenticateToken(req, res, next);
}, pingoneTestRoutes);

// Migration API routes - mixed authentication (some public, some admin-only)
app.use('/api/migration', migrationRoutes);

// Security monitoring API routes - admin-only
app.use('/api/security', securityMonitoringRoutes);

// PATCH /api/demo/may-act — set/clear mayAct attribute on the signed-in PingOne user
app.patch('/api/demo/may-act', express.json(), authenticateToken, demoScenarioRoutes.patchMayAct);
// GET /api/demo/may-act/diagnose — check user attribute + app mapping config
app.get('/api/demo/may-act/diagnose', authenticateToken, demoScenarioRoutes.diagnoseMayAct);

// Public CIMD well-known endpoint — no authentication required.
// Mounted after session/auth middleware but before static files.
app.get('/.well-known/oauth-client/:clientId', wellKnownHandler);

// RFC 9728 — Protected Resource Metadata (public, no authentication required)
app.use('/.well-known/oauth-protected-resource', protectedResourceMetadataRoutes);
app.use('/api/rfc9728', protectedResourceMetadataRoutes);

// Import OAuth health check and monitoring
const {
    checkOAuthProviderHealth
} = require('./middleware/oauthErrorHandler');
const {
    oauthMonitor
} = require('./utils/oauthMonitor');
const {
    logger,
    LOG_CATEGORIES
} = require('./utils/logger');
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
    const frontendUrl = process.env.REACT_APP_CLIENT_URL || process.env.PUBLIC_APP_URL || 'https://api.pingdemo.com:4000';
    const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
    const redirectUrl = queryString ? `${frontendUrl}/?${queryString}` : `${frontendUrl}/`;
    res.redirect(redirectUrl);
});

// Import OAuth error handler
const {
    oauthErrorHandler
} = require('./middleware/oauthErrorHandler');

// ─── Banking MCP Proxy ────────────────────────────────────────────────────────
// Proxies tool calls from the React UI to the banking_mcp_server WebSocket.
// Shared client: services/mcpWebSocketClient.js. Inspector: routes/mcpInspector.js.
//
// When MCP_SERVER_RESOURCE_URI is configured, the Backend-for-Frontend (BFF) performs an RFC 8693
// token exchange before calling the MCP server. This produces a delegated token
// with `act: { client_id: <bff> }` and a scope narrowed to what the tool needs,
// scoped to the MCP server audience — the user's raw token never leaves the Backend-for-Frontend (BFF).

const {
    resolveMcpAccessTokenWithEvents,
    buildSessionPreviewTokenEvents,
} = require('./services/agentMcpTokenService');

// Write tools that require a banking:write-scoped token obtained via scope upgrade.
// Used by the mcpWriteToken session-cache fast-path (Phase 211).
const WRITE_TOOLS_REQUIRING_CACHE = new Set(['create_transfer', 'create_deposit', 'create_withdrawal']);
// PingOne management tools — routed to pingone-mcp-server when mcp_use_pingone_server flag is ON.
// These tools bypass RFC 8693 token exchange (pingone-mcp-server handles its own auth via PKCE/keychain).
const PINGONE_ADMIN_TOOLS = new Set([
    'list_applications', 'get_application', 'create_oidc_application', 'update_oidc_application',
    'list_environments', 'get_environment', 'create_environment', 'update_environment',
    'get_environment_services', 'update_environment_services',
    'list_populations', 'get_population', 'create_population', 'update_population',
    'get_total_identities_by_environment',
]);
const mcpToolAuthorizationService = require('./services/mcpToolAuthorizationService');
const {
    mcpCallTool,
    getSessionAccessToken,
    getMcpServerUrl
} = require('./services/mcpWebSocketClient');
const {
    callToolLocal
} = require('./services/mcpLocalTools');
const {
    introspectToken
} = require('./middleware/tokenIntrospection');
const mcpFlowSseHub = require('./services/mcpFlowSseHub');
const http2McpBridge = require("./services/http2McpBridge");
const mcpGatewayClient = require('./services/mcpGatewayClient');
const mcpPingOneStdioAdapter = require('./services/mcpPingOneStdioAdapter');

// Session-scoped exchange mode toggle (GET/POST /api/mcp/exchange-mode)
const mcpExchangeMode = require('./routes/mcpExchangeMode');
app.use('/api/mcp', mcpExchangeMode);

// GET /api/mcp/tool/events?trace=<uuid> — Server-Sent Events for live MCP tool pipeline phases
app.get('/api/mcp/tool/events', (req, res) => {
    mcpFlowSseHub.handleSseGet(req, res);
});


// POST /api/mcp/scope-upgrade — RFC 8693 token exchange for banking:write scope.
// Called by the UI consent modal after the user approves a scope upgrade.
// Stores the resulting write-scoped token in session.mcpWriteToken for subsequent tool calls.
app.post('/api/mcp/scope-upgrade', express.json(), requireSession, async (req, res) => {
    try {
        const { token, tokenEvents } = await resolveMcpAccessTokenWithEvents(req, 'create_transfer');
        if (!token) {
            return res.status(403).json({
                error: 'scope_upgrade_failed',
                message: 'Token exchange did not return a write-scoped token.',
                tokenEvents,
            });
        }
        req.session.mcpWriteToken = token;
        await new Promise((resolve, reject) =>
            req.session.save(err => err ? reject(err) : resolve())
        );
        return res.json({ ok: true, tokenEvents });
    } catch (err) {
        console.error('[/api/mcp/scope-upgrade] Exchange failed:', err.message);
        return res.status(500).json({ error: 'scope_upgrade_failed', message: err.message });
    }
});
// POST /api/mcp/tool — call a banking MCP tool
app.post('/api/mcp/tool', express.json(), requireSession, async (req, res, next) => {
  try {
    // Log incoming request details for debugging 400 errors
    const startTime = Date.now();
    const userAgent = req.headers['user-agent'] || 'unknown';
    const contentType = req.headers['content-type'] || 'unknown';
    const contentLength = req.headers['content-length'] || 'unknown';

    console.log('[/api/mcp/tool] REQUEST: userAgent=%s contentType=%s contentLength=%s sessionID=%s',
        userAgent, contentType, contentLength, req.sessionID ? `${req.sessionID.substring(0, 8)}...` : 'none');

    // Log request body (safely) for debugging
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('[/api/mcp/tool] REQUEST BODY: %j', {
            keys: Object.keys(req.body),
            hasTool: 'tool' in req.body,
            toolType: typeof req.body.tool,
            toolValue: req.body.tool,
            hasParams: 'params' in req.body,
            paramsKeys: req.body.params ? Object.keys(req.body.params) : null,
            hasFlowTraceId: 'flowTraceId' in req.body
        });
    } else {
        console.log('[/api/mcp/tool] REQUEST BODY: empty or undefined');
    }
    // Defensive re-parse: the global express.json() may not have
    // buffered the body by the time this route handler runs.
    // DO NOT attempt to re-read the request stream — this causes memory leaks when the stream
    // doesn't end properly. The request stream has been fully consumed by middleware already.
    let parsedBody = req.body || {};
    // If req.body is unavailable, it's likely a middleware parsing error — proceed with empty body.
    // The 400 response below will catch this as missing tool and return an error to the client.
    if (!parsedBody.tool && req.readableLength > 0) {
        // Stream already consumed by middleware. Attempting to re-read causes hangs and memory leaks.
        // Log this rare condition and proceed with what middleware provided.
        console.warn('[/api/mcp/tool] Middleware did not parse body, but stream claims data. Using middleware result.');
    }
    const {
        tool,
        params,
        flowTraceId: bodyFlowTrace
    } = parsedBody;
    const flowTraceId = typeof bodyFlowTrace === 'string' ? bodyFlowTrace.trim() : '';

    if (!tool || typeof tool !== 'string') {
        const bodyKeys = Object.keys(parsedBody);
        const userAgent = req.headers['user-agent'] || 'unknown';
        const contentType = req.headers['content-type'] || 'unknown';
        console.error('[/api/mcp/tool] 400: tool_name_required - body keys=[%s] readableLength=%d contentType=%s userAgent=%s',
            bodyKeys.join(','), req.readableLength, contentType, userAgent);
        console.error('[/api/mcp/tool] 400: parsedBody=%j', parsedBody);
        return res.status(400).json({
            error: 'tool_name_required',
            message: `tool name is required. Received body keys: [${bodyKeys.join(', ') || 'none'}]`,
            debug: {
                receivedKeys: bodyKeys,
                readableLength: req.readableLength,
                contentType,
                hasTool: 'tool' in parsedBody,
                toolType: typeof parsedBody.tool,
                toolValue: parsedBody.tool
            }
        });
    }

    if (flowTraceId) {
        if (mcpFlowSseHub.ensurePostTrace(flowTraceId, req.sessionID) !== 'ok') {
            return res.status(403).json({
                error: 'invalid_flow_trace',
                message: 'flowTraceId is not valid for this session.',
            });
        }
    }

    const emit = (payload) => {
        if (flowTraceId) {
            mcpFlowSseHub.publish(flowTraceId, {
                ...payload,
                tool: payload.tool || tool
            });
        }
    };

    if (flowTraceId) {
        let traceEnded = false;
        const endFlowTraceOnce = () => {
            if (traceEnded) return;
            traceEnded = true;
            mcpFlowSseHub.endTrace(flowTraceId);
        };
        res.on('finish', endFlowTraceOnce);
        res.on('close', endFlowTraceOnce);
    }

    emit({
        phase: 'request_accepted'
    });

    // ── PingOne admin tool early-exit ──────────────────────────────────────────
    // When mcp_use_pingone_server is ON and the tool is a PingOne management tool,
    // route directly to pingone-mcp-server (stdio). Skips RFC 8693 token exchange —
    // the binary manages its own PKCE auth via OS keychain.
    if (configStore.get('mcp_use_pingone_server') === 'true' && PINGONE_ADMIN_TOOLS.has(tool)) {
        emit({ phase: 'mcp_pingone_admin_tool' });
        try {
            const p1UserSub = (req.session?.user?.oauthId || req.session?.user?.id) || null;
            const result = await mcpPingOneStdioAdapter.callToolViaStdio(tool, params || {}, '', p1UserSub, req.correlationId);
            emit({ phase: 'mcp_remote_done' });
            return res.json({ result, tokenEvents: [] });
        } catch (err) {
            emit({ phase: 'mcp_remote_error' });
            console.error('[PingOne MCP] %s failed: %s', tool, err.message);
            return res.status(502).json({ error: 'pingone_mcp_error', message: err.message });
        }
    }

    let mcpAccessToken; // RFC 8693 §3.2: MCP-scoped access token (result of exchange)
    let userSub = null;
    let tokenEvents = [];
    try {
        emit({
            phase: 'resolving_access_token'
        });
        if (req.session && req.session.mcpWriteToken && WRITE_TOOLS_REQUIRING_CACHE.has(tool)) {
            console.log('[/api/mcp/tool] %s \u2014 using cached write token (scope upgrade path)', tool);
            mcpAccessToken = req.session.mcpWriteToken;
            tokenEvents = [];
            userSub = (req.session.user && (req.session.user.oauthId || req.session.user.id)) || null;
        } else {
            const resolved = await resolveMcpAccessTokenWithEvents(req, tool);
            mcpAccessToken = resolved.token;
            tokenEvents = resolved.tokenEvents;
            userSub = resolved.userSub || null;
        }
        const evs = tokenEvents || [];
        emit({
            phase: 'access_token_ready',
            hasUserToken: evs.some((e) => e && e.id === 'user-token'),
            exchanged: evs.some((e) => e && e.id === 'exchanged-token'),
            exchangeRequired: evs.some((e) => e && e.id === 'exchange-required'),
        });
    } catch (err) {
        console.error(`[MCP Proxy] Token resolution failed for tool ${tool}:`, err.message);
        emit({
            phase: 'access_token_error',
            code: err.code || 'token_exchange_failed'
        });

        // When the exchange fails because the subject token lacks the required scopes
        // (e.g. ENDUSER_AUDIENCE login path only carries banking:agent:invoke, not
        // banking:write), PingOne returns 400 "At least one scope must be granted".
        // In that case, fall back to the local tool handler so the operation still
        // completes — the UI receives _exchangeFailed:true so it can show a soft
        // informational message instead of an error toast.
        //
        // PingOne also returns 401 for token-exchange policy rejections such as
        // "Request denied: Unsupported authentication method" — this happens when the
        // exchanger client (admin OAuth app) is a PKCE Web app whose token-exchange
        // grant or auth method is not configured correctly in PingOne.  These are
        // server-side config errors, not invalid user tokens, so local fallback is safe.
        // We distinguish PingOne-origin 401s from session-guard 401s via err.pingoneError
        // (only set when the 401 response body was parsed from the PingOne token endpoint).
        // missing_exchange_scopes: the user's access token doesn't carry the required scopes.
        // Return a structured 403 so the UI can display an actionable config-fix modal.
        // Do NOT fall back to local tool execution — that would hide the misconfiguration.
        if (err.code === 'missing_exchange_scopes') {
            const events = err.tokenEvents && err.tokenEvents.length ? err.tokenEvents : [];
            return res.status(403).json({
                error: 'missing_exchange_scopes',
                message: err.message,
                missingScopes: err.missingScopes || [],
                userScopes: err.userScopes || '',
                requiredScopes: err.requiredScopes || '',
                tokenEvents: events,
            });
        }

        const sessionUser = req.session ?.user;
        const isExchangeScopeError =
            err.httpStatus === 400 ||
            err.code === 'token_exchange_failed' ||
            (err.httpStatus === 401 && Boolean(err.pingoneError));
        console.error(
            '[MCP Fallback:DEBUG] tool=%s httpStatus=%s errCode=%s pingoneError=%s ' +
            'sessionUser.id=%s sessionUser.oauthId=%s isExchangeScopeError=%s',
            tool,
            err.httpStatus ?? '(none)',
            err.code ?? '(none)',
            err.pingoneError ?? '(none)',
            sessionUser ?.id ?? '(missing — fallback will NOT fire)',
            sessionUser ?.oauthId ?? '(none)',
            isExchangeScopeError
        );
        if (sessionUser ?.id && isExchangeScopeError) {
            const fallbackEvents = err.tokenEvents && err.tokenEvents.length ? err.tokenEvents : [];
            const effectiveUserId = sessionUser.oauthId || sessionUser.id;
            console.log(
                '[MCP Local] %s — exchange failed (%s), falling back to local handler. effectiveUserId=%s',
                tool, err.code ?? err.httpStatus, effectiveUserId
            );
            try {
                emit({
                    phase: 'local_tool_start',
                    path: 'exchange_failed_fallback'
                });
                const result = await callToolLocal(tool, params || {}, effectiveUserId, req);
                emit({
                    phase: 'local_tool_done',
                    path: 'exchange_failed_fallback'
                });
                console.log('[MCP Local] %s — local fallback result keys=%s resultError=%s',
                    tool,
                    result ? Object.keys(result).join(',') : '(null)',
                    result ?.error ?? '(none)'
                );
                return res.json({
                    result,
                    tokenEvents: fallbackEvents,
                    _localFallback: true,
                    _exchangeFailed: true
                });
            } catch (localErr) {
                console.error(
                    '[MCP Local] %s — callToolLocal THREW after exchange failure: %s stack=%s',
                    tool, localErr.message, localErr.stack
                );
                // Fall through to original error response
            }
        }

        const status = err.httpStatus || 502;
        const events = err.tokenEvents && err.tokenEvents.length ? err.tokenEvents : [];
        return res.status(status).json({
            error: err.code || 'token_exchange_failed',
            message: err.message,
            tokenEvents: events,
        });
    }

    if (!mcpAccessToken) {
        emit({
            phase: 'no_bearer_token_branch'
        });
        // No bearer token (cookie-only or degraded session) — use local handler if session user present.
        // This lets the banking agent work for basic operations even without a fully-hydrated Redis session.
        const sessionUser = req.session ?.user;
        if (sessionUser ?.id) {
            console.log(`[MCP Local] ${tool} — no bearer token (cookie-only session), using local handler`);
            try {
                emit({
                    phase: 'local_tool_start',
                    path: 'no_bearer'
                });
                // Use oauthId (PingOne sub/UUID) when available — accounts are stored under the UUID
                // not the local sequential dataStore id, matching what authenticateToken sets on req.user.id.
                const effectiveUserId = sessionUser.oauthId || sessionUser.id;
                const result = await callToolLocal(tool, params || {}, effectiveUserId, req);
                emit({
                    phase: 'local_tool_done',
                    path: 'no_bearer'
                });
                return res.json({
                    result,
                    tokenEvents,
                    _localFallback: true
                });
            } catch (localErr) {
                console.error(`[MCP Local] Error calling ${tool}:`, localErr.message);
                emit({
                    phase: 'local_tool_error',
                    path: 'no_bearer'
                });
                return res.status(502).json({
                    error: 'mcp_error',
                    message: localErr.message,
                    tokenEvents
                });
            }
        }
        emit({
            phase: 'no_bearer_no_user'
        });
        const r = mcpNoBearerResponse(req, tokenEvents);
        return res.status(r.status).json(r.body);
    }

    // PingOne Authorize (or simulated) on first MCP tool use per session — docs/PINGONE_AUTHORIZE_PLAN.md §7
    /** @type {object|undefined} */
    let mcpAuthorizeEvaluationThisRequest;
    try {
        emit({
            phase: 'authorize_gate_begin'
        });
        const mcpAuthz = await mcpToolAuthorizationService.evaluateMcpFirstToolGate({
            req,
            tool,
            agentToken: mcpAccessToken, // RFC 8693: pass as agentToken for backward compat
            userSub,
            userAcr: req.session ?.user ?.acr,
        });
        if (mcpAuthz.ran && mcpAuthz.block) {
            emit({
                phase: 'authorize_denied',
                status: mcpAuthz.block.status
            });
            // HITL: create pending decision so the agent UI can poll and approve/deny
            let hitlTaskId = null;
            if (mcpAuthz.block.body.error === 'mcp_hitl_required') {
                const { createPendingDecision } = require('./routes/mcpDecisionPolling');
                const hitl = createPendingDecision(
                    userSub,
                    {
                        tool,
                        decisionId: mcpAuthz.block.body.decisionId,
                        decisionContext: mcpAuthz.block.body.decisionContext,
                        reason: mcpAuthz.block.body.error_description,
                    },
                );
                hitlTaskId = hitl.taskId;
            }
            return res.status(mcpAuthz.block.status).json({
                ...mcpAuthz.block.body,
                ...(hitlTaskId ? { taskId: hitlTaskId } : {}),
                tokenEvents,
                mcpAuthorizeEvaluation: {
                    decisionContext: mcpAuthz.block.body.decisionContext,
                    decisionId: mcpAuthz.block.body.decisionId,
                },
            });
        }
        if (mcpAuthz.ran && mcpAuthz.simulatedError) {
            emit({
                phase: 'authorize_simulated_error'
            });
            console.error(`[MCP Authorize][Simulated] unexpected error: ${mcpAuthz.simulatedError.message}`);
            return res.status(500).json({
                error: 'mcp_authorize_error',
                error_description: 'Simulated MCP authorization evaluation failed unexpectedly.',
                tokenEvents,
            });
        }
        if (mcpAuthz.ran && mcpAuthz.pingoneError) {
            emit({
                phase: 'authorize_unavailable'
            });
            console.error(`[MCP Authorize] PingOne error — failing closed: ${mcpAuthz.pingoneError.message}`);
            return res.status(503).json({
                error: 'mcp_authorize_unavailable',
                error_description: 'PingOne Authorize is unavailable for MCP tool access.',
                tokenEvents,
            });
        }
        if (mcpAuthz.ran && mcpAuthz.permit) {
            emit({
                phase: 'authorize_permitted'
            });
            req.session.mcpFirstToolAuthorizeDone = true;
            mcpAuthorizeEvaluationThisRequest = mcpAuthz.evaluation;
        }
        if (!mcpAuthz.ran) {
            emit({
                phase: 'authorize_gate_skipped',
                reason: mcpAuthz.reason,
            });
            appEventService.logEvent('authorize', 'info',
                `Authorize gate skipped — ${mcpAuthz.reason || 'unknown'}`,
                { tag: 'authorize/gate-skipped', metadata: { reason: mcpAuthz.reason } });
        }
    } catch (mcpAuthzErr) {
        emit({
            phase: 'authorize_internal_error'
        });
        console.error('[MCP Authorize] Unexpected error in gate:', mcpAuthzErr.message);
        return res.status(500).json({
            error: 'mcp_authorize_internal',
            message: mcpAuthzErr.message,
            tokenEvents,
        });
    }

    // Introspect session token for zero-trust validation (RFC 7662)
    const sessionAccessToken = getSessionAccessToken(req);
    const introspectionConfigured = !!process.env.PINGONE_INTROSPECTION_ENDPOINT;
    if (introspectionConfigured) {
        emit({
            phase: 'introspection_begin'
        });
        if (!sessionAccessToken || sessionAccessToken === '_cookie_session') {
            emit({
                phase: 'introspection_skipped_no_session_token'
            });
            const r = mcpNoBearerResponse(req, tokenEvents);
            return res.status(r.status).json(r.body);
        }
        try {
            const introspectionResult = await introspectToken(sessionAccessToken);
            if (!introspectionResult.active) {
                emit({
                    phase: 'introspection_inactive'
                });
                console.warn(`[MCP Proxy] Session token introspection failed: token inactive for tool ${tool}`);
                return res.status(401).json({
                    error: 'token_inactive',
                    message: 'Session token is no longer active. Please sign in again.',
                    tokenEvents,
                });
            }
            emit({
                phase: 'introspection_active_ok'
            });
        } catch (err) {
            emit({
                phase: 'introspection_error_degraded'
            });
            console.error(`[MCP Proxy] Session token introspection error for tool ${tool}:`, err.message);
            // Continue on introspection failure (graceful degradation) but log the error
        }
    } else {
        emit({
            phase: 'introspection_not_configured'
        });
    }

    // ── Try remote MCP server first; fall back to local handler if unreachable ──
    // When MCP_GATEWAY_HTTP_URL is set, route through the banking-mcp-gateway (Phase 243).
    // The gateway owns RFC 9728 metadata, runs PingOne Authorize policy evaluation, and
    // performs RFC 8693 token exchange to the upstream MCP server — the mcpAccessToken
    // must already be scoped to the gateway audience (MCP_GW_RESOURCE_URI).
    // Graceful fallback: if MCP_GATEWAY_HTTP_URL is not set, use the previous direct path.
    const gatewayHttpUrl = mcpGatewayClient.getMcpGatewayHttpUrl();
    const useGateway = !!process.env.MCP_GATEWAY_HTTP_URL;
    const mcpUrl = getMcpServerUrl();
    const isLocalDefault = mcpUrl === 'ws://localhost:8080' && !process.env.MCP_SERVER_URL;
    const useHttp2 = !useGateway && (mcpUrl.startsWith("http://") || mcpUrl.startsWith("https://"));

    try {
        emit({
            phase: 'mcp_remote_begin'
        });
        appEventService.logEvent('mcp', 'info', `MCP tool call → ${tool}`, { tag: 'mcp/tool', metadata: { tool, gatewayUrl: useGateway ? gatewayHttpUrl : mcpUrl, via: useGateway ? 'gateway' : 'direct' } });
        let result;
        if (useGateway) {
            result = await mcpGatewayClient.callToolViaGateway(gatewayHttpUrl, mcpAccessToken, tool, params || {}, { correlationId: req.correlationId });
        } else if (useHttp2) {
            const h2Session = http2McpBridge.createHttp2Session(mcpUrl, mcpAccessToken);
            result = await http2McpBridge.forwardToolCall(h2Session, tool, params || {}, mcpAccessToken, userSub, req.correlationId);
        } else {
            result = await mcpCallTool(tool, params || {}, mcpAccessToken, userSub, req.correlationId);
        }
        appEventService.logEvent('mcp', 'info', `MCP tool done ← ${tool} (${Date.now() - startTime}ms)`, { tag: 'mcp/tool', metadata: { tool, durationMs: Date.now() - startTime } });
        emit({
            phase: 'mcp_remote_done'
        });

        // Detect auth challenge from MCP server — fall back to local handler
        // instead of surfacing the redirect challenge to the client. The BFF
        // already has the user's session so local execution is preferred.
        const mcpContent = result?.content;
        const hasAuthChallenge = Array.isArray(mcpContent)
            && mcpContent.some(c => c && c.authChallenge);
        if (hasAuthChallenge) {
            emit({ phase: 'mcp_auth_challenge_intercepted' });
            console.log(`[MCP Proxy] ${tool} — MCP server returned auth challenge, using local fallback`);
            const sessionUser = req.session?.user;
            if (sessionUser?.id) {
                try {
                    const effectiveUserId = sessionUser.oauthId || sessionUser.id;
                    emit({ phase: 'local_tool_start', path: 'auth_challenge_fallback' });
                    const localResult = await callToolLocal(tool, params || {}, effectiveUserId, req);
                    emit({ phase: 'local_tool_done', path: 'auth_challenge_fallback' });
                    return res.json({ result: localResult, tokenEvents, _localFallback: true });
                } catch (localErr) {
                    console.error(`[MCP Local] ${tool} — auth-challenge fallback failed:`, localErr.message);
                    emit({ phase: 'local_tool_error', path: 'auth_challenge_fallback' });
                }
            }
        }

        // Get active LLM model for logging and client display
        const langchainConfig = req.session?.langchain_config || {};
        const activeProvider = langchainConfig.provider || 'ollama';
        const activeModel = langchainConfig.model || 'llama3.2';
        console.log(`[/api/mcp/tool] ${tool} — using LLM: ${activeProvider}/${activeModel}`);

        const out = {
            result,
            tokenEvents,
            activeModel,
            activeProvider
        };
        if (mcpAuthorizeEvaluationThisRequest) {
            out.mcpAuthorizeEvaluation = mcpAuthorizeEvaluationThisRequest;
        }

        // Stream response when using HTTP/2 transport (client detects via Content-Type)
        if (useHttp2) {
            res.setHeader('Content-Type', 'application/stream+json; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
            // Emit any pending flow events (already published to SSE hub, now also in response)
            res.write(JSON.stringify({ type: 'result', data: result, tokenEvents }) + '\n');
            res.write(JSON.stringify({ type: 'stream_close', status: 'success' }) + '\n');
            return res.end();
        }
        return res.json(out);
    } catch (err) {
        // Scope denial: MCP server returned -32005 (valid token, wrong scope).
        // Return 403 — do NOT fall back to the local tool handler.
        if (err.code === 'mcp_insufficient_scope') {
            const d = err.mcpErrorData || {};
            console.warn(`[/api/mcp/tool] Scope denied for tool '${tool}': missing [${(d.missingScopes || []).join(', ')}]`);
            return res.status(403).json({
                error: 'mcp_scope_denied',
                tool,
                requiredScopes: d.requiredScopes || [],
                missingScopes: d.missingScopes || [],
                availableScopes: d.availableScopes || [],
            });
        }

        const isConnErr =
            err.useLocal ||
            err.message.includes('ECONNREFUSED') ||
            err.message.includes('ENETUNREACH') ||
            err.message.includes('timed out') ||
            err.message.includes('connect ETIMEDOUT') ||
            (err.code && ['ECONNREFUSED', 'ENETUNREACH', 'ETIMEDOUT'].includes(err.code));

        if (!isConnErr) {
            emit({
                phase: 'mcp_remote_tool_error'
            });
            console.error(`[MCP Proxy] Error calling ${tool}:`, err.message);
            return res.status(502).json({
                error: 'mcp_error',
                message: err.message,
                tokenEvents
            });
        }

        emit({
            phase: 'mcp_remote_unreachable'
        });
        // ── Local fallback ──────────────────────────────────────────────────────
        const sessionUser = req.session ?.user;
        if (!sessionUser ?.id) {
            emit({
                phase: 'local_fallback_blocked_no_user'
            });
            const r = mcpNoBearerResponse(req, tokenEvents);
            return res.status(r.status).json(r.body);
        }

        console.log(`[MCP Local] ${tool} — MCP server unreachable (${mcpUrl}), using local handler`);
        try {
            emit({
                phase: 'local_tool_start',
                path: 'remote_fallback'
            });
            // Use oauthId (PingOne sub/UUID) — accounts are keyed by UUID (same as authenticateToken / REST routes).
            const effectiveUserId = sessionUser.oauthId || sessionUser.id;
            const result = await callToolLocal(tool, params || {}, effectiveUserId, req);
            emit({
                phase: 'local_tool_done',
                path: 'remote_fallback'
            });
            return res.json({
                result,
                tokenEvents,
                _localFallback: true
            });
        } catch (localErr) {
            emit({
                phase: 'local_tool_error',
                path: 'remote_fallback'
            });
            console.error(`[MCP Local] Error calling ${tool}:`, localErr.message);
            return res.status(502).json({
                error: 'mcp_error',
                message: localErr.message,
                tokenEvents
            });
        }
    }
  } catch (err) {
    next(err);
  }
});

// ── Static file serving ──────────────────────────────────────────────────────
// Express serves the React build directly.
{
    const buildPath = path.join(__dirname, '..', 'banking_api_ui', 'build');
    const docsPath = path.join(__dirname, '..', 'docs');
    const fs = require('fs');

    // Serve docs directory for Postman collections and documentation
    if (fs.existsSync(docsPath)) {
        app.use('/docs', express.static(docsPath));
        console.log('[static] Serving docs from', docsPath);
    }

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
            if (req.path.startsWith('/api')) return res.status(404).json({
                error: 'not_found'
            });
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

process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    process.exit(1);
});

// Only start the server if this file is run directly (not imported for testing)
if (require.main === module) {
    const fs = require('fs');
    const certDir = path.join(__dirname, '../certs');
    const certFile = path.join(certDir, 'api.pingdemo.com+2.pem');
    const keyFile = path.join(certDir, 'api.pingdemo.com+2-key.pem');

    let server;
    if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
        const https = require('https');
        server = https.createServer({
            key: fs.readFileSync(keyFile),
            cert: fs.readFileSync(certFile),
        }, app).listen(PORT, () => {
            console.log(`Banking API server (HTTPS) running on https://api.pingdemo.com:${PORT}`);
        });
    } else {
        server = app.listen(PORT, () => {
            console.log(`Banking API server running on https://api.pingdemo.com:3001 (local port ${PORT})`);
            console.log('Tip: run mkcert in Banking/certs/ to enable HTTPS (see run-bank.sh)');
        });
    }

    process.on('SIGTERM', () => {
        oauthMonitor.stop();
        server.close(() => process.exit(0));
    });
}


// ── Startup redirect-URI guard ──────────────────────────────────────────────
// Silently checks (and if missing, patches) the OAuth apps' redirect_uri
// allowlists in PingOne using the management worker token.
// Non-blocking: runs after server is listening; never prevents startup.
setImmediate(async () => {
  try {
    const { ensureAllRedirectUris } = require('./services/pingoneAppConfigService');
    await ensureAllRedirectUris();
  } catch (err) {
    // Management credentials not configured, or PingOne unreachable — not fatal.
    console.warn('[redirect-uri-guard] Skipped —', err.message);
  }
});

// Export app as the default (for supertest / existing requires) and attach
// named flags so other modules can do: require('./server').isReplit etc.
module.exports = app;
module.exports.app = app;
module.exports.isProduction = isProduction;
module.exports.isReplit = isReplit;