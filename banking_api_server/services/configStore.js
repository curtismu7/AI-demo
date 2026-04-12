/**
 * ConfigStore — persists app configuration across server/browser restarts.
 *
 * Local (no KV_REST_API_URL):  SQLite via better-sqlite3  →  data/config.db
 * Vercel + KV (KV_REST_API_URL set): @vercel/kv (Upstash Redis) → banking:config hash;
 *   runtime Config UI persists here (SaaS). Vercel without KV: env vars only (read-only UI).
 *
 * Secrets (clientSecret, sessionSecret) are encrypted with AES-256-GCM before
 * being written to storage, using a key derived from CONFIG_ENCRYPTION_KEY or
 * SESSION_SECRET.  The in-memory cache always holds plaintext values.
 *
 * The exported singleton exposes:
 *   configStore.get(key)              → sync read from in-memory cache
 *   await configStore.setConfig(data) → validate + save + update cache
 *   configStore.getMasked()           → safe subset for sending to the browser
 *   await configStore.ensureInitialized() → call once before handling requests
 */

'use strict';

const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Vercel KV (managed) OR direct Upstash (via marketplace integration)
const KV_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN  || process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_KV   = !!(KV_URL && KV_TOKEN);
const KV_HASH_KEY = 'banking:config';

// Fields that must be encrypted at rest
const SECRET_KEYS = new Set([
  'PINGONE_ADMIN_CLIENT_SECRET',
  'PINGONE_USER_CLIENT_SECRET',
  'PINGONE_SESSION_SECRET',
  'PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET',
  'PINGONE_MANAGEMENT_CLIENT_SECRET',
  'PINGONE_AGENT_CLIENT_SECRET',
  'PINGONE_AI_AGENT_CLIENT_SECRET',
]);

// All known config keys with their defaults and whether they are public
const FIELD_DEFS = {
  // PingOne environment
  PINGONE_ENVIRONMENT_ID: { public: true,  default: '' },
  PINGONE_REGION:         { public: true,  default: 'com' },

  // Admin OAuth app
  PINGONE_ADMIN_CLIENT_ID:        { public: true,  default: '' },
  PINGONE_ADMIN_CLIENT_SECRET:    { public: false, default: '' },
  PINGONE_ADMIN_REDIRECT_URI:     { public: true,  default: '' },
  // 'basic' = client_secret via Authorization header; 'post' = client_secret in form body (match PingOne app).
  PINGONE_ADMIN_TOKEN_ENDPOINT_AUTH_METHOD: { public: true, default: 'basic' },

  // End-user OAuth app
  PINGONE_USER_CLIENT_ID:         { public: true,  default: '' },
  PINGONE_USER_CLIENT_SECRET:     { public: false, default: '' },
  PINGONE_USER_REDIRECT_URI:      { public: true,  default: '' },

  // Management API worker (client_credentials) — CIMD registration, email, bootstrap run.
  // Not the admin sign-in app. Env: PINGONE_MANAGEMENT_CLIENT_ID / PINGONE_MANAGEMENT_CLIENT_SECRET.
  PINGONE_MANAGEMENT_CLIENT_ID:     { public: true,  default: '' },
  PINGONE_MANAGEMENT_CLIENT_SECRET: { public: false, default: '' },

  // Dedicated management API worker credentials — used by WorkerAppConfigTab and delegationService.
  // Preferred over PINGONE_MANAGEMENT_CLIENT_ID when set. Env: PINGONE_MGMT_CLIENT_ID / PINGONE_MGMT_CLIENT_SECRET.
  PINGONE_MGMT_CLIENT_ID:          { public: true,  default: '' },
  PINGONE_MGMT_CLIENT_SECRET:      { public: false, default: '' },
  // Token endpoint auth method for the management worker: 'basic' (default) or 'post'.
  PINGONE_MGMT_TOKEN_AUTH_METHOD:  { public: true,  default: 'basic' },

  // PingOne authorize: pi.flow + response_mode=pi.flow for apps that support it (e.g. DaVinci flow policies).
  // See https://developer.pingidentity.com/pingone-api/auth/auth-config-options/browserless-authentication-flow-options.html
  PINGONE_ADMIN_AUTHORIZE_PI_FLOW: { public: true, default: 'false' },
  PINGONE_USER_AUTHORIZE_PI_FLOW:  { public: true, default: 'false' },
  /** Marketing home: redirect (standard code+PKCE) vs slide-over panel + authorize with use_pi_flow=1 */
  marketing_customer_login_mode:   { public: true, default: 'redirect' },
  marketing_demo_username_hint:    { public: true, default: '' },
  marketing_demo_password_hint:    { public: true, default: '' },

  // Auth server
  admin_role:             { public: true,  default: 'admin' },
  user_role:              { public: true,  default: 'customer' },
  // Comma-separated list of PingOne preferred_usernames that always receive admin role
  admin_username:         { public: true,  default: '' },
  // PingOne population ID whose members are treated as admin (no schema changes needed)
  admin_population_id:    { public: true,  default: '' },
  // PingOne userinfo/ID-token claim whose value is compared against admin_role (e.g. a custom attribute)
  PINGONE_ADMIN_ROLE_CLAIM:       { public: true,  default: '' },

  // Server / misc
  PINGONE_SESSION_SECRET:         { public: false, default: '' },
  FRONTEND_URL:           { public: true,  default: '' },
  PINGONE_MCP_SERVER_URL:         { public: true,  default: 'http://localhost:8000' },
  PINGONE_DEBUG_OAUTH:            { public: true,  default: 'false' },

  // PingOne Authorize (policy decision point for transfers/withdrawals)
  PINGONE_AUTHORIZE_ENABLED:                { public: true,  default: 'false' },
  // Phase 2: Decision Endpoints API — preferred path (set this in PingOne Authorize → Decision Endpoints)
  PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID:   { public: true,  default: '' },
  // Optional: second decision endpoint for MCP first-tool delegation (DecisionContext=McpFirstTool in TF params)
  PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID: { public: true, default: '' },
  // Phase 1: Legacy PDP path — fallback when decision endpoint ID is not set
  PINGONE_AUTHORIZE_POLICY_ID:              { public: true,  default: '' },
  PINGONE_AUTHORIZE_WORKER_CLIENT_ID:       { public: true,  default: '' },
  PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET:   { public: false, default: '' },
  PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID:    { public: true,  default: '' },
  pingone_worker_client_id:                 { public: true,  default: '' },

  // Feature flags — granular toggles for in-development features
  // Each maps to a runtime behaviour controlled via /api/admin/feature-flags.
  ff_authorize_fail_open:  { public: true, default: 'true'  }, // fail open (allow) on Authorize errors
  ff_authorize_deposits:   { public: true, default: 'false' }, // apply Authorize to deposits too
  // When true with authorize_enabled: run in-process simulated Authorize (education); no PingOne call
  ff_authorize_simulated:  { public: true, default: 'false' },
  // PingOne Authorize (or simulated) once per session on first BankingAgent MCP tool call — see docs/PINGONE_AUTHORIZE_PLAN.md §7
  ff_authorize_mcp_first_tool: { public: true, default: 'false' },
  ff_hitl_enabled:         { public: true, default: 'true'  }, // require human approval for agent-initiated high-value transactions
  ff_inject_may_act:       { public: true, default: 'false' }, // BFF-synthesise may_act when absent from user token (demo/dev — no PingOne change needed)
  // DEPRECATED: ff_inject_may_act. Use enableMayActSupport instead (RFC 8693 configuration-based approach).
  enableMayActSupport:     { public: true, default: 'true'  }, // Enable validation of RFC 8693 may_act claims from PingOne token policies (not synthetic injection)
  ff_inject_audience:      { public: true, default: 'false' }, // BFF-add mcp_resource_uri to aud claim snapshot when absent (demo/dev — no PingOne change needed)
  ff_skip_token_exchange:  { public: true, default: 'false' }, // Skip RFC 8693 — pass user access token directly to MCP (demo mode; token exchange not required)
  ff_oidc_only_authorize:  { public: true, default: 'false' }, // Strip banking:* from user /authorize — fixes multi-resource error when scopes are on a PingOne Resource Server
  ff_two_exchange_delegation: { public: true, default: 'false' }, // 2-Exchange pattern: Subject→(AI Agent exchange)→Agent Token→(MCP exchange)→Final Token with nested act.act claim
  mcp_use_legacy_protocol: { public: true, default: 'false' }, // When 'true', BFF uses protocolVersion 2024-11-05 in MCP initialize; default (false) = 2025-11-25

  // Token endpoint auth method overrides (configurable at runtime from Demo Data page)
  // Fallback: env vars AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD / MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD
  ai_agent_token_endpoint_auth_method:      { public: true, default: '' },
  mcp_exchanger_token_endpoint_auth_method: { public: true, default: '' },

  // 2-Exchange delegated chain — audiences and AI Agent App credentials
  // Required only when FF_TWO_EXCHANGE_DELEGATION is ON
  PINGONE_AI_AGENT_CLIENT_ID:             { public: true,  default: '' }, // Super Banking AI Agent App client ID — performs Exchange #1
  PINGONE_RESOURCE_AGENT_GATEWAY_URI:     { public: true,  default: 'https://banking-agent-gateway.banking-demo.com' }, // Actor CC audience for Exchange #1
  AI_AGENT_INTERMEDIATE_AUDIENCE:         { public: true,  default: '' }, // Exchange #1 result audience (Exchange #2 subject_token aud); defaults to banking-mcp-server.banking-demo.com
  PINGONE_RESOURCE_MCP_GATEWAY_URI:       { public: true,  default: 'https://banking-mcp-gateway.banking-demo.com' },   // Actor CC audience for Exchange #2
  PINGONE_RESOURCE_TWO_EXCHANGE_URI:       { public: true,  default: 'https://banking-resource-server.banking-demo.com' }, // Exchange #2 output audience (Super Banking Resource Server); must differ from PINGONE_RESOURCE_MCP_SERVER_URI (1-exchange)

  // RFC 8693 Token Exchange — MCP server resource URI
  // When set, the Backend-for-Frontend (BFF) exchanges user tokens for delegated tokens scoped to this
  // audience before forwarding to the MCP server (act claim identifies the Backend-for-Frontend (BFF)).
  PINGONE_RESOURCE_MCP_SERVER_URI:        { public: true,  default: '' },

  // Demo Data — persistent demo accounts (JSON string for Vercel, ignored for local SQLite)
  demo_accounts:              { public: false, default: '' },

  // Vertical — active demo vertical (banking, retail, workforce)
  active_vertical:            { public: true,  default: 'banking' },

  // CIBA — Client-Initiated Backchannel Authentication
  CIBA_ENABLED:               { public: true,  default: 'false' },
  CIBA_TOKEN_DELIVERY_MODE:   { public: true,  default: 'poll' },
  CIBA_BINDING_MESSAGE:       { public: true,  default: 'Banking App Authentication' },
  CIBA_NOTIFICATION_ENDPOINT: { public: true,  default: '' },
  CIBA_POLL_INTERVAL_MS:      { public: true,  default: '5000' },
  CIBA_AUTH_REQUEST_EXPIRY:   { public: true,  default: '300' },

  // Step-up authentication method for large transfers / withdrawals
  // 'ciba'  → back-channel (CIBA) challenge shown inline on the dashboard
  // 'email' → OIDC re-authentication redirect (PingOne email / OTP MFA)
  STEP_UP_METHOD: { public: true, default: 'email' },
  STEP_UP_AMOUNT_THRESHOLD: { public: true, default: 500 },
  /** Maximum allowed transaction amount (hard limit, all transaction types). Blocks anything over this. */
  MAX_TRANSACTION_AMOUNT: { public: true, default: 1000 },

  /** UI industry / white-label preset (client applies colors + logo). See banking_api_ui/src/config/industryPresets.js */
  UI_INDUSTRY_PRESET: { public: true, default: 'bx_finance' },

  /**
   * Space-separated OAuth scopes allowed for RFC 8693 exchange to MCP (agent capability).
   * Subset of KNOWN scopes in agentMcpScopePolicy.js — disabling a scope blocks matching MCP tools.
   */
  agent_mcp_allowed_scopes: {
    public: true,
    default:
      'banking:read banking:write banking:accounts:read banking:transactions:read banking:transactions:write ai_agent',
  },
};

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

function _getEncryptionKey() {
  const rawKey = process.env.CONFIG_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'dev-fallback-key-do-not-use-in-production';
  // Derive a stable 32-byte key using scrypt with a fixed salt
  return crypto.scryptSync(rawKey, 'banking-config-salt-v1', 32);
}

function _encrypt(plaintext) {
  try {
    const key = _getEncryptionKey();
    const iv  = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  } catch (err) {
    throw new Error(`Config encryption failed: ${err.message}`);
  }
}

function _decrypt(ciphertext) {
  try {
    const key  = _getEncryptionKey();
    const data = Buffer.from(ciphertext, 'base64');
    const iv   = data.subarray(0, 12);
    const tag  = data.subarray(12, 28);
    const enc  = data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (_) {
    // Corrupted or mis-keyed — return empty so the field shows as "not set"
    return '';
  }
}

// ---------------------------------------------------------------------------
// SQLite helpers (local only)
// ---------------------------------------------------------------------------

let _sqliteDB = null;

function _getSQLite() {
  if (_sqliteDB) return _sqliteDB;
  const Database = require('better-sqlite3');
  const dbDir  = path.join(__dirname, '..', 'data', 'persistent');
  const dbPath = path.join(dbDir, 'config.db');
  fs.mkdirSync(dbDir, { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  _sqliteDB = db;
  return db;
}

// ---------------------------------------------------------------------------
// ConfigStore class
// ---------------------------------------------------------------------------

class ConfigStore {
  constructor() {
    /** @type {Record<string, string>} plaintext in-memory cache */
    this._cache = {};
    this._initPromise = null;
  }

  /**
   * Ensure the store is loaded before use.
   * Safe to call multiple times — only initialises once.
   */
  ensureInitialized() {
    if (!this._initPromise) {
      this._initPromise = this._initialize().catch((err) => {
        console.error('[ConfigStore] initialization error:', err.message);
        this._initPromise = null; // allow retry
      });
    }
    return this._initPromise;
  }

  async _initialize() {
    if (USE_KV) {
      await this._loadFromKV();
    } else {
      try {
        this._loadFromSQLite();
      } catch (err) {
        console.warn('[ConfigStore] SQLite initialization failed, using in-memory fallback:', err.message);
        // Continue with empty cache - config will be in-memory only
      }
    }
  }

  _loadFromSQLite() {
    const db   = _getSQLite();
    const rows = db.prepare('SELECT key, value FROM config').all();
    for (const row of rows) {
      this._cache[row.key] = SECRET_KEYS.has(row.key) ? _decrypt(row.value) : row.value;
    }
  }

  async _loadFromKV() {
    const { createClient } = require('@vercel/kv');
    const kv = createClient({ url: KV_URL, token: KV_TOKEN });
    const data = await kv.hgetall(KV_HASH_KEY);
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        this._cache[key] = SECRET_KEYS.has(key) ? _decrypt(value) : value;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Synchronous cache lookup.  Returns null if not set.
   * Always call ensureInitialized() before the first get().
   */
  get(key) {
    const v = this._cache[key];
    return (v !== undefined && v !== '') ? v : null;
  }

  /**
   * Persist new configuration values.
   * Accepts partial updates — only sets keys that are provided and non-empty.
   * Secrets are encrypted before writing to storage.
   *
   * On Vercel without KV, env vars are the only store — this is a no-op.
   * On Vercel with KV (or local SQLite), values are persisted.
   */
  async setConfig(data) {
    if (process.env.VERCEL && !USE_KV) return;
    await this.ensureInitialized();

    // Validate DEMO_ACCOUNTS if present
    if (data.demo_accounts) {
      try {
        JSON.parse(data.demo_accounts);
      } catch (e) {
        throw new Error('DEMO_ACCOUNTS must be valid JSON string');
      }
    }

    const updates = {};        // what goes into storage (encrypted secrets)
    const cacheUpdates = {};   // what goes into the in-memory cache (plaintext)

    const allowEmptyStringKeys = new Set(['marketing_demo_username_hint', 'marketing_demo_password_hint', 'demo_accounts']);
    for (const [key, value] of Object.entries(data)) {
      if (!(key in FIELD_DEFS)) continue;          // ignore unknown keys
      if (value === null || value === undefined) continue;
      if (value === '' && !allowEmptyStringKeys.has(key)) continue;
      // Value is a non-empty string
      const stored = SECRET_KEYS.has(key) ? _encrypt(value) : value;
      updates[key]      = stored;
      cacheUpdates[key] = value;
    }

    if (Object.keys(updates).length === 0) return;

    if (USE_KV) {
      const { createClient } = require('@vercel/kv');
      const kv = createClient({ url: KV_URL, token: KV_TOKEN });
      await kv.hset(KV_HASH_KEY, updates);
    } else {
      try {
        const db = _getSQLite();
        const upsert = db.prepare(
          'INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, ?)'
        );
        const now = new Date().toISOString();
        db.transaction(() => {
          for (const [key, value] of Object.entries(updates)) {
            upsert.run(key, value, now);
          }
        })();
      } catch (err) {
        console.warn('[ConfigStore] SQLite write failed, config will be in-memory only:', err.message);
        // Continue - config stays in memory only
      }
    }

    // Update cache last, so failures above leave cache consistent
    Object.assign(this._cache, cacheUpdates);
  }

  /**
   * Returns the full stored config with secrets replaced by '••••••••'.
   * Also includes a `<key>_set` boolean for each secret field.
   * Public fields are returned as-is.
   */
  getMasked() {
    const result = {};
    for (const key of Object.keys(FIELD_DEFS)) {
      if (SECRET_KEYS.has(key)) {
        const isSet = String(this.getEffective(key) || '').trim() !== '';
        result[key] = isSet ? '••••••••' : '';
        result[`${key}_set`] = isSet;
      } else {
        result[key] = this.getEffective(key) || '';
      }
    }
    return result;
  }

  /**
   * Returns the effective value for a key:
   * - With persisted store (SQLite or KV): cache first, then env fallbacks, then default.
   * - On Vercel without KV: env vars only (no runtime persistence).
   * This is what config/oauth.js getters call.
   */
  getEffective(key) {
    // Env-var fallback map (PINGONE_CORE_* / PINGONE_AI_CORE_* / PINGONE_ADMIN_* all refer to the same PingOne apps)
    // NOTE: env vars always take priority — over KV, SQLite, and committed defaults.
    // This ensures Vercel env vars override anything saved in the Config UI.
    const envFallbackMap = {
      pingone_environment_id: ['PINGONE_ENVIRONMENT_ID'],
      pingone_region:         ['PINGONE_REGION'],
      admin_client_id:        [
        'PINGONE_AI_CORE_CLIENT_ID',
        'PINGONE_CORE_CLIENT_ID',
        'PINGONE_ADMIN_CLIENT_ID',
        'VITE_PINGONE_CLIENT_ID',
      ],
      admin_client_secret:    [
        'PINGONE_AI_CORE_CLIENT_SECRET',
        'PINGONE_CORE_CLIENT_SECRET',
        'PINGONE_ADMIN_CLIENT_SECRET',
        'VITE_PINGONE_CLIENT_SECRET',
      ],
      admin_redirect_uri:     [
        'PINGONE_AI_CORE_REDIRECT_URI',
        'PINGONE_CORE_REDIRECT_URI',
        'PINGONE_ADMIN_REDIRECT_URI',
      ],
      admin_token_endpoint_auth_method: [
        'PINGONE_ADMIN_TOKEN_ENDPOINT_AUTH',
        'ADMIN_TOKEN_ENDPOINT_AUTH',
      ],
      user_client_id:         [
        'PINGONE_AI_CORE_USER_CLIENT_ID',
        'PINGONE_CORE_USER_CLIENT_ID',
        'PINGONE_USER_CLIENT_ID',
        'VITE_PINGONE_CLIENT_ID',
      ],
      user_client_secret:     [
        'PINGONE_AI_CORE_USER_CLIENT_SECRET',
        'PINGONE_CORE_USER_CLIENT_SECRET',
        'PINGONE_USER_CLIENT_SECRET',
        'VITE_PINGONE_CLIENT_SECRET',
      ],
      user_redirect_uri:      [
        'PINGONE_AI_CORE_USER_REDIRECT_URI',
        'PINGONE_CORE_USER_REDIRECT_URI',
        'PINGONE_USER_REDIRECT_URI',
      ],
      pingone_client_id:     ['PINGONE_MANAGEMENT_CLIENT_ID', 'PINGONE_CIMD_CLIENT_ID'],
      pingone_client_secret: ['PINGONE_MANAGEMENT_CLIENT_SECRET', 'PINGONE_CIMD_CLIENT_SECRET'],
      pingone_mgmt_client_id:          ['PINGONE_MGMT_CLIENT_ID', 'PINGONE_MANAGEMENT_CLIENT_ID'],
      pingone_mgmt_client_secret:      ['PINGONE_MGMT_CLIENT_SECRET', 'PINGONE_MANAGEMENT_CLIENT_SECRET'],
      pingone_mgmt_token_auth_method:  ['PINGONE_MGMT_TOKEN_AUTH_METHOD'],
      admin_pingone_authorize_pi_flow: ['PINGONE_ADMIN_AUTHORIZE_PI_FLOW'],
      user_pingone_authorize_pi_flow:  ['PINGONE_USER_AUTHORIZE_PI_FLOW'],
      admin_role:             ['ADMIN_ROLE'],
      user_role:              ['USER_ROLE'],
      admin_username:         ['ADMIN_USERNAME'],
      admin_population_id:    ['ADMIN_POPULATION_ID'],
      admin_role_claim:       ['ADMIN_ROLE_CLAIM'],
      session_secret:         ['SESSION_SECRET'],
      frontend_url:           ['REACT_APP_CLIENT_URL', 'FRONTEND_ADMIN_URL'],
      mcp_server_url:                   ['MCP_SERVER_URL'],
      pingone_resource_mcp_server_uri:  ['PINGONE_RESOURCE_MCP_SERVER_URI', 'MCP_RESOURCE_URI', 'MCP_SERVER_RESOURCE_URI'],
      authorize_decision_endpoint_id:   ['PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID'],
      authorize_mcp_decision_endpoint_id: ['PINGONE_AUTHORIZE_MCP_DECISION_ENDPOINT_ID'],
      debug_oauth:                      ['DEBUG_OAUTH'],
      ciba_enabled:           ['CIBA_ENABLED'],
      step_up_method:         ['STEP_UP_METHOD'],
      step_up_amount_threshold: ['STEP_UP_AMOUNT_THRESHOLD'],
      pingone_mfa_policy_id:  ['PINGONE_MFA_POLICY_ID'],
      agent_mcp_allowed_scopes: ['AGENT_MCP_ALLOWED_SCOPES'],
      ff_two_exchange_delegation:      ['FF_TWO_EXCHANGE_DELEGATION'],
      pingone_ai_agent_client_id:       ['PINGONE_AI_AGENT_CLIENT_ID', 'AI_AGENT_CLIENT_ID'],
      pingone_ai_agent_client_secret:    ['PINGONE_AI_AGENT_CLIENT_SECRET', 'AI_AGENT_CLIENT_SECRET'],
      pingone_worker_client_id:                    ['PINGONE_AUTHORIZE_WORKER_CLIENT_ID'],
      pingone_mcp_token_exchanger_client_id:     ['PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID', 'AGENT_OAUTH_CLIENT_ID'],
      pingone_mcp_token_exchanger_client_secret: ['PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET', 'AGENT_OAUTH_CLIENT_SECRET'],
      pingone_mcp_token_exchanger_client_scopes: ['PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SCOPES', 'AGENT_OAUTH_CLIENT_SCOPES'],
      pingone_resource_agent_gateway_uri: ['PINGONE_RESOURCE_AGENT_GATEWAY_URI', 'AGENT_GATEWAY_AUDIENCE'],
      ai_agent_intermediate_audience:  ['AI_AGENT_INTERMEDIATE_AUDIENCE'],
      pingone_resource_mcp_gateway_uri: ['PINGONE_RESOURCE_MCP_GATEWAY_URI', 'MCP_GATEWAY_AUDIENCE'],
      pingone_resource_two_exchange_uri: ['PINGONE_RESOURCE_TWO_EXCHANGE_URI', 'MCP_RESOURCE_URI_TWO_EXCHANGE'],
      marketing_customer_login_mode: ['MARKETING_CUSTOMER_LOGIN_MODE'],
      marketing_demo_username_hint: ['MARKETING_DEMO_USERNAME_HINT'],
      marketing_demo_password_hint: ['MARKETING_DEMO_PASSWORD_HINT'],
      ai_agent_token_endpoint_auth_method:   ['AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD'],
      mcp_exchanger_token_endpoint_auth_method: ['MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD'],
    };

    const envVars = envFallbackMap[key] || [];
    for (const envKey of envVars) {
      const v = process.env[envKey];
      if (v) return v.trim();
    }

    // KV / SQLite stored config — after env vars so Vercel env vars always win.
    if (!process.env.VERCEL || USE_KV) {
      const stored = this.get(key);
      if (stored) return stored;
    }

    // Optional committed defaults — last resort so any env var above wins.
    // Used for the hosted demo where visitors have no need to configure credentials.
    try {
      const builtin = require('../config/pingoneBackendDefaults');
      if (builtin && builtin[key] !== undefined && String(builtin[key]).trim() !== '') {
        return String(builtin[key]).trim();
      }
    } catch (_) {
      /* optional file missing */
    }

    return FIELD_DEFS[key]?.default || '';
  }

  /** True when config cannot be changed at runtime (Vercel without KV). */
  isReadOnly() {
    return !!process.env.VERCEL && !USE_KV;
  }

  /** True when KV/Upstash is wired — SaaS-style persistence on Vercel. */
  hasKvStorage() {
    return USE_KV;
  }

  /** 'vercel-kv', 'upstash-direct', or 'sqlite' */
  getStorageType() {
    if (USE_KV) return KV_URL?.includes('upstash.io') ? 'upstash-direct' : 'vercel-kv';
    return 'sqlite';
  }

  /**
   * True once admin PingOne OAuth can run.
   * Uses getEffective (same as config/oauth.js) so on Vercel this matches env vars,
   * not KV cache alone — avoids redirecting to PingOne with empty client_id or //as path.
   */
  isConfigured() {
    const envId = String(this.getEffective('pingone_environment_id') || '').trim();
    const adminId = String(this.getEffective('admin_client_id') || '').trim();
    return !!(envId && adminId);
  }

  /** True when end-user OAuth (user_client_id) + environment id are present. */
  isUserOAuthConfigured() {
    const envId = String(this.getEffective('pingone_environment_id') || '').trim();
    const userId = String(this.getEffective('user_client_id') || '').trim();
    return !!(envId && userId);
  }

  /**
   * Remove a persisted OAuth client secret so PKCE-only (public) apps do not retain an old confidential secret.
   * Does not unset environment variables — remove those in your deployment settings separately.
   */
  async clearOAuthClientSecret(key) {
    if (key !== 'admin_client_secret' && key !== 'user_client_secret') {
      throw new Error('clearOAuthClientSecret: invalid key');
    }
    if (process.env.VERCEL && !USE_KV) return;
    await this.ensureInitialized();
    delete this._cache[key];
    if (USE_KV) {
      const { createClient } = require('@vercel/kv');
      const kv = createClient({ url: KV_URL, token: KV_TOKEN });
      await kv.hdel(KV_HASH_KEY, key);
    } else {
      const db = _getSQLite();
      db.prepare('DELETE FROM config WHERE key = ?').run(key);
    }
  }

  /** Wipe stored config (KV or SQLite). No-op on Vercel without KV. */
  async resetConfig() {
    if (process.env.VERCEL && !USE_KV) return;
    if (USE_KV) {
      const { createClient } = require('@vercel/kv');
      const kv = createClient({ url: KV_URL, token: KV_TOKEN });
      await kv.del(KV_HASH_KEY);
    } else {
      const db = _getSQLite();
      db.prepare('DELETE FROM config').run();
    }
    this._cache = {};
    this._initPromise = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Two-Exchange Configuration Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate two-exchange delegation configuration.
 * Called at startup and before first two-exchange attempt.
 * Enforces explicit configuration (no hard-coded defaults).
 * 
 * @throws {Error} with code 'TWO_EXCHANGE_CONFIG_INVALID' if validation fails
 * @returns {Object} Configuration details for audit logging
 */
function validateTwoExchangeConfig() {
  const errors = [];
  const warnings = [];
  const logger = require('./logger') || console;
  
  // Require explicit AI Agent credentials (no fallbacks)
  const aiAgentClientId = configStore.get('PINGONE_AI_AGENT_CLIENT_ID') || process.env.PINGONE_AI_AGENT_CLIENT_ID || process.env.AI_AGENT_CLIENT_ID;
  const aiAgentSecret = configStore.get('PINGONE_AI_AGENT_CLIENT_SECRET') || process.env.PINGONE_AI_AGENT_CLIENT_SECRET || process.env.AI_AGENT_CLIENT_SECRET;
  if (!aiAgentClientId) errors.push('Missing: PINGONE_AI_AGENT_CLIENT_ID (or AI_AGENT_CLIENT_ID)');
  if (!aiAgentSecret) errors.push('Missing: PINGONE_AI_AGENT_CLIENT_SECRET (or AI_AGENT_CLIENT_SECRET)');
  
  // Require explicit MCP Exchanger credentials (no fallbacks)
  const mcpClientId = configStore.getEffective('pingone_mcp_token_exchanger_client_id') || process.env.AGENT_OAUTH_CLIENT_ID;
  const mcpSecret = process.env.AGENT_OAUTH_CLIENT_SECRET;
  if (!mcpClientId) errors.push('Missing: AGENT_OAUTH_CLIENT_ID (MCP Token Exchanger client ID)');
  if (!mcpSecret) errors.push('Missing: AGENT_OAUTH_CLIENT_SECRET (MCP Token Exchanger client secret)');
  
  // Require explicit audiences (NO hard-coded pingdemo.com defaults)
  const agentGatewayAud = configStore.getEffective('PINGONE_RESOURCE_AGENT_GATEWAY_URI') || process.env.PINGONE_RESOURCE_AGENT_GATEWAY_URI;
  const mcpGatewayAud = configStore.getEffective('PINGONE_RESOURCE_MCP_GATEWAY_URI') || process.env.PINGONE_RESOURCE_MCP_GATEWAY_URI;
  const intermediateAud = configStore.getEffective('AI_AGENT_INTERMEDIATE_AUDIENCE') || process.env.AI_AGENT_INTERMEDIATE_AUDIENCE;
  const finalAud = configStore.getEffective('PINGONE_RESOURCE_TWO_EXCHANGE_URI') || process.env.PINGONE_RESOURCE_TWO_EXCHANGE_URI;
  
  if (!agentGatewayAud) errors.push('Missing: PINGONE_RESOURCE_AGENT_GATEWAY_URI (Step 1: audience for AI Agent token acquisition)');
  if (!mcpGatewayAud) errors.push('Missing: PINGONE_RESOURCE_MCP_GATEWAY_URI (Step 3: audience for MCP token acquisition)');
  if (!intermediateAud) errors.push('Missing: AI_AGENT_INTERMEDIATE_AUDIENCE (Step 2: exchange #1 target audience)');
  if (!finalAud) errors.push('Missing: PINGONE_RESOURCE_TWO_EXCHANGE_URI (Step 4: exchange #2 final audience)');
  
  // Audience uniqueness warning
  if (intermediateAud && finalAud && intermediateAud === finalAud) {
    warnings.push('Audience mismatch: AI_AGENT_INTERMEDIATE_AUDIENCE === PINGONE_RESOURCE_TWO_EXCHANGE_URI. Verify this is intentional — usually they should differ for proper nested delegation.');
  }
  
  // If validation fails, throw detailed error with remediation
  if (errors.length > 0) {
    const remediation = [
      'Two-Exchange Configuration Validation Failed:',
      '',
      errors.map(e => '  ✗ ' + e).join('\n'),
      '',
      'Remediation Steps:',
      '  1. Set missing environment variables (listed above), OR',
      '  2. Configure via Admin UI → Config → Two-Exchange Settings',
      '  3. Verify App Credentials:',
      '     - AI_AGENT_CLIENT_ID/SECRET → Super Banking AI Agent App (or via PINGONE_AI_AGENT_CLIENT_*)',
      '     - AGENT_OAUTH_CLIENT_ID/SECRET → Super Banking MCP Token Exchanger, OR',
      '  4. For production: Ensure ff_two_exchange_delegation is enabled',
      '  5. Verify PingOne token exchange policies on both resources allow delegation'
    ].join('\n');
    
    const err = new Error(remediation);
    err.code = 'TWO_EXCHANGE_CONFIG_INVALID';
    err.httpStatus = 503;
    err.isConfigError = true;
    err.details = {
      missing: errors,
      config: { aiAgentClientId: !!aiAgentClientId, mcpClientId: !!mcpClientId }
    };
    throw err;
  }
  
  // Log warnings if any
  if (warnings.length > 0) {
    warnings.forEach(w => {
      if (logger.warn) logger.warn('[TwoExchange:Config] ' + w);
    });
  }
  
  return {
    valid: true,
    credentials: {
      aiAgentClientId,
      mcpClientId
    },
    audiences: {
      agentGatewayAud,
      mcpGatewayAud,
      intermediateAud,
      finalAud
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// RFC 8707: Scope-Audience Mapping (Phase 56-04)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build explicit scope-audience mapping per RFC 8707 resource indicators.
 * Maps each audience URI to the OAuth scopes valid for token exchange to that audience.
 * Reads resource URIs from configStore to support dynamic configuration.
 * 
 * Called at validation time (not at module load) so config changes are reflected.
 */
function buildAllowedScopesByAudience() {
  const mapping = {};

  // User End-User banking API (standard 1-exchange)
  const endUserAudience = store.get('PINGONE_AUDIENCE_ENDUSER') || 'https://banking-api.banking-demo.com';
  if (endUserAudience) {
    mapping[endUserAudience] = [
      'banking:read',
      'banking:write',
      'banking:accounts:read',
      'banking:transactions:read',
      'banking:transactions:write',
      'banking:general:read',
      'banking:general:write',
      'banking:admin', // Allow admin scopes here too for role-based access
    ];
  }

  // Agent Gateway (Step 1 actor token) — 2-exchange only
  const agentGatewayUri = store.get('PINGONE_RESOURCE_AGENT_GATEWAY_URI') || 'https://banking-agent-gateway.banking-demo.com';
  if (agentGatewayUri) {
    mapping[agentGatewayUri] = [
      'banking:agent:invoke',
      'ai_agent',
    ];
  }

  // AI Agent Intermediate (Step 2 exchange output) — 2-exchange delegation
  const aiAgentAudience = store.get('AI_AGENT_INTERMEDIATE_AUDIENCE') || store.get('PINGONE_AUDIENCE_AI_AGENT') || 'https://banking-ai-agent.banking-demo.com';
  if (aiAgentAudience) {
    mapping[aiAgentAudience] = [
      'banking:read',
      'banking:write',
      'banking:agent:invoke',
      'banking:accounts:read',
      'banking:transactions:read',
      'banking:transactions:write',
    ];
  }

  // MCP Gateway (Step 3 actor token) — 2-exchange only
  const mcpGatewayUri = store.get('PINGONE_RESOURCE_MCP_GATEWAY_URI') || 'https://banking-mcp-gateway.banking-demo.com';
  if (mcpGatewayUri) {
    mapping[mcpGatewayUri] = [
      'banking:mcp:invoke',
      'mcp_resource_access',
      'banking:ai:agent:read',
      'banking:ai:agent:write',
    ];
  }

  // MCP Resource Server (1-exchange final) — standard 1-exchange
  const mcpServerUri = store.get('PINGONE_RESOURCE_MCP_SERVER_URI') || 'https://banking-mcp-server.banking-demo.com';
  if (mcpServerUri) {
    mapping[mcpServerUri] = [
      'get_accounts:read',
      'transfer:execute',
      'check:read',
      'banking:accounts:read',
      'banking:transactions:read',
      'banking:transactions:write',
      'banking:ai:agent:read',
      'banking:ai:agent:write',
    ];
  }

  // 2-Exchange final resource
  const twoExchangeUri = store.get('PINGONE_RESOURCE_TWO_EXCHANGE_URI') || 'https://banking-resource-server.banking-demo.com';
  if (twoExchangeUri) {
    mapping[twoExchangeUri] = [
      'get_accounts:read',
      'transfer:execute',
      'check:read',
      'banking:accounts:read',
      'banking:transactions:read',
      'banking:transactions:write',
      'banking:ai:agent:read',
      'banking:ai:agent:write',
    ];
  }

  return mapping;
}

/**
 * Validate that provided scopes are allowed for the given audience.
 * Implements explicit scope-audience mapping (RFC 8707).
 * 
 * Throws error if:
 *   - scopes list is empty
 *   - audience is unknown
 *   - no scopes match the audience allowlist
 * 
 * @param {string[]} scopes - OAuth scopes to validate
 * @param {string} audience - Target audience URI (resource indicator)
 * @returns {object} { valid: true, scopes: narrowedScopes[], narrowed: boolean }
 * @throws {Error} with descriptive message for validation failures
 */
function validateScopeAudience(scopes, audience) {
  // Check: scopes not empty
  if (!scopes || scopes.length === 0) {
    throw new Error(
      `SCOPE_ERROR: No scopes provided for audience ${audience}`
    );
  }

  // Build mapping at validation time (allows dynamic config changes)
  const ALLOWED_SCOPES_BY_AUDIENCE = buildAllowedScopesByAudience();

  // Check: audience is known in mapping
  const allowedForAudience = ALLOWED_SCOPES_BY_AUDIENCE[audience];
  if (!allowedForAudience) {
    // Unknown audience - gracefully degrade by allowing all scopes
    // This allows the validator to be added without breaking existing deployments
    return {
      valid: true,
      scopes: scopes,
      narrowed: false,
      note: `Unknown audience (not in ALLOWED_SCOPES_BY_AUDIENCE mapping): ${audience}`,
    };
  }

  // Filter: keep only scopes valid for this audience
  const allowedSet = new Set(allowedForAudience);
  const validScopes = scopes.filter(s => allowedSet.has(s));

  // Check: at least one scope matches
  if (validScopes.length === 0) {
    throw new Error(
      `SCOPE_MISMATCH: User scopes [${scopes.join(', ')}] ` +
      `do not match allowed scopes for ${audience} ` +
      `[${allowedForAudience.join(', ')}]`
    );
  }

  return {
    valid: true,
    scopes: validScopes,
    narrowed: validScopes.length < scopes.length,
  };
}



// ─────────────────────────────────────────────────────────────────────────────
// RFC 8693 §5.2: Standardized Error Codes (Phase 56-05)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standardized error codes per RFC 8693 §5.2 and custom extensions.
 * Maps error conditions to RFC-compliant error codes with remediation info.
 */
const ERROR_CODES = {
  // Configuration Errors (operational, not RFC)
  'config.missing_credentials': {
    http_status: 500,
    oauth_error: 'server_error',
    description: 'Application credentials not configured',
    category: 'Configuration',
  },
  'config.invalid_audience': {
    http_status: 500,
    oauth_error: 'server_error',
    description: 'Invalid or missing token audience configuration',
    category: 'Configuration',
  },

  // RFC 8693 §5.2 Error Codes
  'invalid_request': {
    http_status: 400,
    oauth_error: 'invalid_request',
    description: 'The request is missing a required parameter or is otherwise malformed',
    category: 'Request',
  },
  'invalid_client': {
    http_status: 401,
    oauth_error: 'invalid_client',
    description: 'Client authentication failed (unknown client or unsupported auth method)',
    category: 'Authentication',
  },
  'invalid_grant': {
    http_status: 400,
    oauth_error: 'invalid_grant',
    description: 'The provided grant is invalid or expired',
    category: 'Authorization',
  },
  'invalid_scope': {
    http_status: 400,
    oauth_error: 'invalid_scope',
    description: 'The requested scope is invalid, unknown, or exceeds what was granted',
    category: 'Scope',
  },
  'unauthorized_client': {
    http_status: 403,
    oauth_error: 'unauthorized_client',
    description: 'The client is not authorized for this method',
    category: 'Authorization',
  },
  'unsupported_grant_type': {
    http_status: 400,
    oauth_error: 'unsupported_grant_type',
    description: 'The authorization grant type is not supported',
    category: 'Request',
  },
  'server_error': {
    http_status: 500,
    oauth_error: 'server_error',
    description: 'The authorization server encountered an unexpected condition',
    category: 'Server',
  },
  'temporarily_unavailable': {
    http_status: 503,
    oauth_error: 'temporarily_unavailable',
    description: 'The authorization server is unable to handle the request (temp overload)',
    category: 'Server',
  },

  // Custom/Extended Errors
  'access_denied': {
    http_status: 403,
    oauth_error: 'access_denied',
    description: 'The resource owner or authorization server denied the request',
    category: 'Authorization',
  },
  'insufficient_scope': {
    http_status: 403,
    oauth_error: 'insufficient_scope',
    description: 'The access token provided does not have the required scope',
    category: 'Scope',
  },
  'invalid_token': {
    http_status: 401,
    oauth_error: 'invalid_token',
    description: 'The access token provided is expired, revoked, or invalid',
    category: 'Authentication',
  },
  'token_expired': {
    http_status: 401,
    oauth_error: 'invalid_token',
    description: 'The token has expired',
    category: 'Authentication',
  },
  'may_act_validation_failed': {
    http_status: 400,
    oauth_error: 'invalid_grant',
    description: 'The may_act claim does not match the request context',
    category: 'Authorization',
  },
  'subject_mismatch': {
    http_status: 400,
    oauth_error: 'invalid_grant',
    description: 'The subject claim does not match user identity',
    category: 'Authorization',
  },
};

/**
 * Get error details and metadata for an error code.
 * Returns standardized error info for RFC 8693 compliance.
 * 
 * @param {string} errorCode - Error code to look up
 * @returns {object} Error metadata {http_status, oauth_error, description, category}
 */
function getErrorDetails(errorCode) {
  const config = ERROR_CODES[errorCode];
  if (!config) {
    return {
      http_status: 500,
      oauth_error: 'server_error',
      description: 'Unknown error',
      category: 'Server',
    };
  }
  return config;
}

/**
 * Map internal error messages to standardized error codes.
 * Used for translating implementation errors to RFC 8693 codes.
 * 
 * @param {string} errorMessage - Error message or internal error string
 * @param {object} context - Additional context (optional)
 * @returns {string} Error code from ERROR_CODES
 */
function mapErrorToCode(errorMessage, context = {}) {
  const msg = String(errorMessage).toLowerCase();
  
  // Configuration errors
  if (msg.includes('credentials not configured')) return 'config.missing_credentials';
  if (msg.includes('invalid audience')) return 'config.invalid_audience';
  
  // RFC 8693 errors
  if (msg.includes('invalid_client') || msg.includes('client authentication failed')) return 'invalid_client';
  if (msg.includes('invalid_grant') || msg.includes('grant')) return 'invalid_grant';
  if (msg.includes('invalid_scope') || msg.includes('scope_mismatch')) return 'invalid_scope';
  if (msg.includes('unauthorized_client')) return 'unauthorized_client';
  if (msg.includes('unsupported_grant_type')) return 'unsupported_grant_type';
  if (msg.includes('token_expired') || msg.includes('expired')) return 'token_expired';
  if (msg.includes('invalid_token')) return 'invalid_token';
  
  // Custom errors
  if (msg.includes('may_act')) return 'may_act_validation_failed';
  if (msg.includes('subject')) return 'subject_mismatch';
  if (msg.includes('access_denied')) return 'access_denied';
  if (msg.includes('insufficient_scope')) return 'insufficient_scope';
  if (msg.includes('malformed') || msg.includes('invalid_request')) return 'invalid_request';
  
  // Default
  return 'server_error';
}

// Singleton
const configStore = new ConfigStore();
module.exports = configStore;
module.exports.FIELD_DEFS = FIELD_DEFS;
module.exports.validateTwoExchangeConfig = validateTwoExchangeConfig;
module.exports.SECRET_KEYS = SECRET_KEYS;
module.exports.buildAllowedScopesByAudience = buildAllowedScopesByAudience;
module.exports.validateScopeAudience = validateScopeAudience;
module.exports.ERROR_CODES = ERROR_CODES;
module.exports.getErrorDetails = getErrorDetails;
module.exports.mapErrorToCode = mapErrorToCode;
