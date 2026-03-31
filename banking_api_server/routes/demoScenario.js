// banking_api_server/routes/demoScenario.js
/**
 * GET/PUT demo scenario — account display names, balances, per-user step-up threshold.
 * Authenticated users may only modify their own accounts.
 */
'use strict';

const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const dataStore = require('../data/store');
const runtimeSettings = require('../config/runtimeSettings');
const demoScenarioStore = require('../services/demoScenarioStore');
const accountsRouter = require('./accounts');
const { getManagementToken } = require('../services/pingOneClientService');
const configStore = require('../services/configStore');

const router = express.Router();

const DEFAULT_STEP_UP = () => runtimeSettings.get('stepUpAmountThreshold');
const BLOCKED_USER_FIELDS = new Set(['id', 'password', 'createdAt']);

/** Legacy `both` in KV → floating (embedded and floating FAB are mutually exclusive in the UI). */
function normalizeBankingAgentUiMode(stored) {
  if (stored === 'embedded' || stored === 'floating' || stored === 'both') return stored;
  return null;
}

/** @param {unknown} stored */
function normalizeBankingAgentUi(stored) {
  if (!stored || typeof stored !== 'object') return null;
  const p = stored.placement;
  const fab = Boolean(stored.fab);
  if (p !== 'middle' && p !== 'bottom' && p !== 'none') return null;
  if (p === 'none' && !fab) return { placement: 'none', fab: true };
  return { placement: p, fab };
}

function effectiveBankingAgentUi(scenario) {
  const direct = normalizeBankingAgentUi(scenario.bankingAgentUi);
  if (direct) return direct;
  const legacy = normalizeBankingAgentUiMode(scenario.bankingAgentUiMode);
  if (legacy === 'embedded') return { placement: 'bottom', fab: false };
  if (legacy === 'both') return { placement: 'bottom', fab: true };
  if (legacy === 'floating') return { placement: 'none', fab: true };
  return { placement: 'none', fab: true };
}

function legacyModeFromUi(ui) {
  if (ui.placement === 'none') return 'floating';
  if (ui.placement === 'bottom' && !ui.fab) return 'embedded';
  if (ui.placement === 'bottom' && ui.fab) return 'both';
  if (ui.placement === 'middle' && !ui.fab) return 'embedded';
  return 'both';
}

/** Shown in Demo config UI only when DB + session have no profile strings (never overwrites real data). */
const PROFILE_UI_FALLBACK = Object.freeze({
  firstName: 'Jordan',
  lastName: 'Demo',
  email: 'jordan.demo@bxfinance.local',
  username: 'jordan_demo',
});

function isBlank(v) {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

/** True when the client sent a persisted account id (non-empty string). */
function isExistingAccountId(id) {
  if (id == null) return false;
  return String(id).trim().length > 0;
}

/**
 * Persist a snapshot of the user's current accounts to demoScenarioStore (Redis/KV).
 * Called after any PUT that modifies accounts so cold-start restarts can recover them.
 */
async function saveAccountSnapshot(userId) {
  const accounts = dataStore.getAccountsByUserId(userId);
  const snapshot = accounts.map(a => ({
    id: a.id,
    accountType: a.accountType,
    accountNumber: a.accountNumber,
    name: a.name || '',
    balance: a.balance,
    currency: a.currency || 'USD',
    isActive: a.isActive !== false,
  }));
  await demoScenarioStore.save(userId, { accountSnapshot: snapshot });
}

/**
 * On cold-start, the in-memory dataStore loses all accounts.  Rebuild them from
 * the last snapshot stored in demoScenarioStore (Redis/KV).
 * Returns the restored accounts array, or [] if no snapshot is available.
 */
async function restoreAccountsFromSnapshot(userId) {
  try {
    const scenario = await demoScenarioStore.load(userId);
    if (!Array.isArray(scenario.accountSnapshot) || scenario.accountSnapshot.length === 0) return [];
    const restored = [];
    for (const snap of scenario.accountSnapshot) {
      const existing = dataStore.getAccountById(snap.id);
      if (existing) {
        restored.push(existing);
      } else {
        const acct = await dataStore.createAccount({
          ...snap,
          userId,
          createdAt: new Date(),
        });
        restored.push(acct);
      }
    }
    return restored;
  } catch (e) {
    console.warn('[demoScenario] restoreAccountsFromSnapshot failed:', e.message);
    return [];
  }
}

/** Allowed account types from the Demo config UI (new rows). */
const DEMO_ACCOUNT_TYPES = new Set([
  'checking',
  'savings',
  'investment',
  'money_market',
  'credit',
  'car_loan',
  'mortgage',
]);

const DEMO_ACCOUNT_NUMBER_PREFIX = {
  checking: 'CHK',
  savings: 'SAV',
  investment: 'INV',
  money_market: 'MMK',
  credit: 'CRD',
  car_loan: 'CAR',
  mortgage: 'HOM',
};

const DEMO_DEFAULT_ACCOUNT_NAMES = {
  checking: 'Checking Account',
  savings: 'Savings Account',
  investment: 'Investment Account',
  money_market: 'Money Market Account',
  credit: 'Credit Card',
  car_loan: 'Car Loan',
  mortgage: 'Mortgage (Home Loan)',
};

function normalizeDemoAccountType(raw) {
  const typeRaw = typeof raw === 'string' ? raw.toLowerCase().trim() : '';
  if (DEMO_ACCOUNT_TYPES.has(typeRaw)) return typeRaw;
  return 'checking';
}

/**
 * Merge PingOne/session-backed identity into stored user for the demo-config form.
 * Anonymous fields stay empty until we fall back to PROFILE_UI_FALLBACK.
 */
function buildUserDataForDemoResponse(req, dbUser) {
  const { password: _pw, ...rest } = dbUser || {};
  const su = req.session?.user || {};
  const tu = req.user || {};
  const out = { ...rest };

  const coalesce = (key, ...tokenKeys) => {
    const raw = out[key];
    if (!isBlank(raw)) return String(raw).trim();
    if (!isBlank(su[key])) return String(su[key]).trim();
    const tuKeys = tokenKeys.length ? tokenKeys : [key];
    for (const tk of tuKeys) {
      if (!isBlank(tu[tk])) return String(tu[tk]).trim();
    }
    return '';
  };

  out.id = out.id || tu.id || su.id || '';
  out.firstName = coalesce('firstName');
  out.lastName = coalesce('lastName');
  out.email = coalesce('email');
  out.username = coalesce('username');
  out.role = out.role || su.role || tu.role || '';
  out.createdAt = out.createdAt || su.createdAt || '';
  if (out.isActive === undefined || out.isActive === null) {
    out.isActive = su.isActive !== false;
  }

  if (!out.username && out.email) {
    const local = String(out.email).split('@')[0];
    if (local) out.username = local;
  }

  const allNamesEmpty =
    isBlank(out.firstName) && isBlank(out.lastName) && isBlank(out.email) && isBlank(out.username);
  if (allNamesEmpty) {
    out.firstName = PROFILE_UI_FALLBACK.firstName;
    out.lastName = PROFILE_UI_FALLBACK.lastName;
    out.email = PROFILE_UI_FALLBACK.email;
    out.username = PROFILE_UI_FALLBACK.username;
  }

  return out;
}

/**
 * Returns safe user profile updates from a JSON object.
 * Blocks immutable/sensitive fields and trims long strings.
 */
function sanitizeUserUpdates(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const updates = {};
  for (const [key, value] of Object.entries(raw)) {
    if (BLOCKED_USER_FIELDS.has(key)) continue;
    if (typeof value === 'string') {
      updates[key] = value.trim().slice(0, 300);
      continue;
    }
    if (
      value === null ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      (Array.isArray(value) && value.length <= 50) ||
      (value && typeof value === 'object')
    ) {
      updates[key] = value;
    }
  }
  return updates;
}

// Auth: server mounts this router with authenticateToken only (same pattern as GET /api/accounts/my).
// No banking:* scope gate — Backend-for-Frontend (BFF) session users often lack those scopes in the PingOne access token.
router.get('/', async (req, res) => {
  try {
    let accounts = dataStore.getAccountsByUserId(req.user.id);
    if (accounts.length === 0 && req.user.id) {
      // Try restoring persisted snapshot (Redis/KV) before provisioning fresh defaults.
      accounts = await restoreAccountsFromSnapshot(req.user.id);
      if (accounts.length === 0 && typeof accountsRouter.provisionDemoAccounts === 'function') {
        accounts = await accountsRouter.provisionDemoAccounts(req.user.id);
        // Persist the freshly provisioned accounts so future cold-starts can restore them.
        await saveAccountSnapshot(req.user.id);
      }
    }
    const scenario = await demoScenarioStore.load(req.user.id);
    const currentUser = dataStore.getUserById(req.user.id) || {};
    const userData = buildUserDataForDemoResponse(req, currentUser);
    const bankingAgentUi = effectiveBankingAgentUi(scenario);
    const bankingAgentUiMode = legacyModeFromUi(bankingAgentUi);
    res.json({
      accounts: accounts.map(a => ({
        id: a.id,
        name: a.name || '',
        accountNumber: a.accountNumber,
        accountType: a.accountType,
        balance: a.balance,
        currency: a.currency || 'USD',
      })),
      settings: {
        stepUpAmountThreshold:
          scenario.stepUpAmountThreshold != null ? scenario.stepUpAmountThreshold : DEFAULT_STEP_UP(),
        stepUpAmountThresholdIsDefault: scenario.stepUpAmountThreshold == null,
        bankingAgentUiMode,
        bankingAgentUi,
      },
      defaults: {
        stepUpAmountThreshold: DEFAULT_STEP_UP(),
        checkingName: 'Checking Account',
        savingsName: 'Savings Account',
        checkingBalance: 3000,
        savingsBalance: 2000,
        profileForm: {
          firstName: PROFILE_UI_FALLBACK.firstName,
          lastName: PROFILE_UI_FALLBACK.lastName,
          email: PROFILE_UI_FALLBACK.email,
          username: PROFILE_UI_FALLBACK.username,
        },
      },
      persistenceNote:
        (process.env.VERCEL || process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT) &&
        !demoScenarioStore.isPersistenceConfigured()
          ? 'Demo settings (threshold, agent layout) are not persisted — add Vercel KV / Upstash REST env vars or REDIS_URL (same as sessions) so they survive refresh and deploys.'
          : null,
      userData,
    });
  } catch (e) {
    console.error('[demoScenario] GET', e);
    res.status(500).json({ error: 'demo_scenario_failed', message: e.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { accounts: bodyAccounts, userData } = req.body || {};
    const uid = req.user.id;
    let staleAccountIds = [];

    if (Object.prototype.hasOwnProperty.call(req.body, 'stepUpAmountThreshold')) {
      const raw = req.body.stepUpAmountThreshold;
      if (raw === null || raw === '') {
        await demoScenarioStore.save(uid, { stepUpAmountThreshold: null });
      } else {
        const n = parseFloat(raw);
        if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
          return res.status(400).json({ error: 'invalid_threshold', message: 'Threshold must be between 0 and 1,000,000.' });
        }
        await demoScenarioStore.save(uid, { stepUpAmountThreshold: n });
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'bankingAgentUiMode')) {
      const raw = req.body.bankingAgentUiMode;
      if (raw === null || raw === '') {
        await demoScenarioStore.save(uid, { bankingAgentUiMode: null });
      } else if (raw === 'embedded' || raw === 'floating' || raw === 'both') {
        await demoScenarioStore.save(uid, { bankingAgentUiMode: raw });
      } else {
        return res.status(400).json({
          error: 'invalid_banking_agent_ui_mode',
          message: 'bankingAgentUiMode must be embedded, floating, both, or null.',
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'bankingAgentUi')) {
      const raw = req.body.bankingAgentUi;
      if (raw === null || raw === '') {
        await demoScenarioStore.save(uid, { bankingAgentUi: null });
      } else {
        const ui = normalizeBankingAgentUi(raw);
        if (!ui) {
          return res.status(400).json({
            error: 'invalid_banking_agent_ui',
            message: 'bankingAgentUi must be { placement: middle|bottom|none, fab: boolean } or null.',
          });
        }
        await demoScenarioStore.save(uid, {
          bankingAgentUi: ui,
          bankingAgentUiMode: legacyModeFromUi(ui),
        });
      }
    }

    if (Array.isArray(bodyAccounts)) {
      const maxAccounts = 24;
      const existingForUser = dataStore.getAccountsByUserId(uid);
      const newRowCount = bodyAccounts.filter(
        r => r && typeof r === 'object' && !isExistingAccountId(r.id),
      ).length;
      if (existingForUser.length + newRowCount > maxAccounts) {
        return res.status(400).json({
          error: 'max_accounts',
          message: `You can have at most ${maxAccounts} accounts.`,
        });
      }

      for (const row of bodyAccounts) {
        if (!row || typeof row !== 'object') continue;

        if (!isExistingAccountId(row.id)) {
          // New account — but first check if one already exists for this type (upsert by type).
          const accountType = normalizeDemoAccountType(row.accountType);
          const existingOfType = existingForUser.find(a => a.accountType === accountType);
          if (existingOfType) {
            // Treat as an update of the existing account instead of creating a duplicate.
            const updates = {};
            if (typeof row.name === 'string') updates.name = row.name.trim().slice(0, 120);
            if (row.balance !== undefined && row.balance !== null) {
              const b = parseFloat(row.balance);
              if (!Number.isFinite(b) || b < 0 || b > 99_999_999) {
                return res.status(400).json({ error: 'invalid_balance', message: 'Balance must be a valid non-negative number.' });
              }
              updates.balance = Math.round(b * 100) / 100;
            }
            if (Object.keys(updates).length > 0) {
              await dataStore.updateAccount(existingOfType.id, updates);
            }
            continue;
          }
          // No existing account for this type — create it.
          let name = typeof row.name === 'string' ? row.name.trim().slice(0, 120) : '';
          if (!name) {
            name = DEMO_DEFAULT_ACCOUNT_NAMES[accountType] || 'Account';
          }
          let balance = 0;
          if (row.balance !== undefined && row.balance !== null && row.balance !== '') {
            const b = parseFloat(row.balance);
            if (!Number.isFinite(b) || b < 0 || b > 99_999_999) {
              return res.status(400).json({ error: 'invalid_balance', message: 'Balance must be a valid non-negative number.' });
            }
            balance = Math.round(b * 100) / 100;
          }
          const newId = uuidv4();
          const numSuffix = newId.replace(/-/g, '').slice(0, 12).toUpperCase();
          const acctNumPrefix = DEMO_ACCOUNT_NUMBER_PREFIX[accountType] || 'ACC';
          await dataStore.createAccount({
            id: newId,
            userId: uid,
            accountNumber: `${acctNumPrefix}-${numSuffix}`,
            accountType,
            balance,
            currency: 'USD',
            name,
            createdAt: new Date(),
            isActive: true,
          });
          continue;
        }

        const acct = dataStore.getAccountById(row.id);
        if (!acct) {
          // Stale ID (serverless instance rotation) — skip the update but keep going so
          // new accounts in the same save are still created.
          staleAccountIds.push(row.id);
          continue;
        }
        if (acct.userId !== uid) {
          return res.status(403).json({ error: 'forbidden_account', message: 'You can only edit your own accounts.' });
        }
        const updates = {};
        if (Object.prototype.hasOwnProperty.call(row, 'name')) {
          if (typeof row.name === 'string') {
            updates.name = row.name.trim().slice(0, 120);
          }
        }
        if (row.balance !== undefined && row.balance !== null) {
          const b = parseFloat(row.balance);
          if (!Number.isFinite(b) || b < 0 || b > 99_999_999) {
            return res.status(400).json({ error: 'invalid_balance', message: 'Balance must be a valid non-negative number.' });
          }
          updates.balance = Math.round(b * 100) / 100;
        }
        if (Object.keys(updates).length > 0) {
          await dataStore.updateAccount(row.id, updates);
        }
      }
      // Stale IDs are skipped (not an error) but surfaced in the response so the UI
      // can show a soft warning without discarding the user's just-created accounts.
      if (staleAccountIds.length > 0) {
        console.warn(`[demoScenario] PUT: ${staleAccountIds.length} stale account IDs skipped for user ${uid}:`, staleAccountIds);
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'userData')) {
      let user = dataStore.getUserById(uid);
      if (!user) {
        const su = req.session?.user || {};
        const tu = req.user || {};
        user = await dataStore.ensureUser(uid, {
          username: su.username || tu.username,
          email: su.email || tu.email,
          firstName: su.firstName || tu.firstName,
          lastName: su.lastName || tu.lastName,
          role: su.role || tu.role,
          oauthProvider: su.oauthProvider,
          oauthId: su.oauthId || tu.oauthSub || null,
          isActive: su.isActive !== false && tu.isActive !== false,
        });
      }
      if (!user) {
        return res.status(404).json({ error: 'user_not_found', message: 'Signed-in user not found.' });
      }
      const safeUpdates = sanitizeUserUpdates(userData);
      if (Object.keys(safeUpdates).length > 0) {
        await dataStore.updateUser(uid, safeUpdates);
      }
    }

    const accounts = dataStore.getAccountsByUserId(uid);
    // Persist account snapshot to Redis/KV so cold-start restarts (Vercel, etc.) can recover all accounts.
    await saveAccountSnapshot(uid);
    const scenario = await demoScenarioStore.load(uid);
    const currentUser = dataStore.getUserById(uid) || {};
    const { password: _password, ...savedUserData } = currentUser;
    const bankingAgentUiOut = effectiveBankingAgentUi(scenario);
    const bankingAgentUiModeOut = legacyModeFromUi(bankingAgentUiOut);
    res.json({
      ok: true,
      staleAccountIds: staleAccountIds?.length ? staleAccountIds : undefined,
      accounts: accounts.map(a => ({
        id: a.id,
        name: a.name || '',
        accountNumber: a.accountNumber,
        accountType: a.accountType,
        balance: a.balance,
        currency: a.currency || 'USD',
      })),
      settings: {
        stepUpAmountThreshold:
          scenario.stepUpAmountThreshold != null ? scenario.stepUpAmountThreshold : DEFAULT_STEP_UP(),
        bankingAgentUiMode: bankingAgentUiModeOut,
        bankingAgentUi: bankingAgentUiOut,
      },
      userData: savedUserData,
    });
  } catch (e) {
    console.error('[demoScenario] PUT', e);
    res.status(500).json({ error: 'demo_scenario_save_failed', message: e.message });
  }
});

module.exports = router;

// ── may_act demo helper ────────────────────────────────────────────────────────
// Re-exported so server.js can mount at /api/demo/may-act (no auth middleware
// duplication — server.js wraps everything under authenticateToken already).

/**
 * PATCH /api/demo/may-act
 * Body: { enabled: boolean }
 *
 * Sets or clears the `mayAct` custom attribute on the signed-in PingOne user.
 * When enabled:  mayAct = { "client_id": "<admin_client_id>" }
 * When disabled: mayAct set to null / empty object so PingOne omits may_act from tokens.
 *
 * The user must re-login after this change for their token to reflect the new may_act value.
 */
async function patchMayAct(req, res) {
  const enabled = req.body?.enabled !== false; // default true
  // mode: '1exchange' (default) — mayAct.sub = admin_client_id (Banking App / BFF)
  //        '2exchange'           — mayAct.sub = AI_AGENT_CLIENT_ID (AI Agent App)
  const mode = req.body?.mode === '2exchange' ? '2exchange' : '1exchange';
  const pingOneUserId = req.user?.id;
  if (!pingOneUserId) {
    return res.status(401).json({ error: 'unauthenticated', message: 'No user session' });
  }

  const envId  = configStore.getEffective('pingone_environment_id');
  const region = configStore.getEffective('pingone_region') || 'com';

  // Choose which client ID becomes mayAct.sub based on delegation mode
  const bffClientId = mode === '2exchange'
    ? (configStore.getEffective('ai_agent_client_id') || process.env.AI_AGENT_CLIENT_ID || '')
    : configStore.getEffective('admin_client_id');

  if (!envId || !bffClientId) {
    const missing = !envId ? 'pingone_environment_id' :
      (mode === '2exchange' ? 'AI_AGENT_CLIENT_ID (ai_agent_client_id)' : 'admin_client_id');
    return res.status(503).json({
      error: 'not_configured',
      message: `${missing} not set — cannot update user attribute`,
    });
  }

  let token;
  try {
    token = await getManagementToken();
  } catch (err) {
    return res.status(503).json({
      error: 'management_token_failed',
      message: `Could not obtain PingOne management token: ${err.message}`,
    });
  }

  const url = `https://api.pingone.${region}/v1/environments/${envId}/users/${pingOneUserId}`;
  // PingOne custom attributes live under the schema extension namespace.
  // We use a PATCH with the top-level attribute name (no namespace needed for
  // attributes added via Schema → User Schema in the admin console).
  const patchBody = {
    mayAct: enabled ? { sub: bffClientId } : null,
  };

  try {
    await axios.patch(url, patchBody, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 12000,
    });
    console.log(`[DemoMayAct] ${enabled ? 'Set' : 'Cleared'} mayAct for user ${pingOneUserId} mode=${mode}`);
    return res.json({
      ok: true,
      enabled,
      mode,
      mayAct: enabled ? { sub: bffClientId } : null,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.response?.data?.details?.[0]?.message || err.message;
    console.error(`[DemoMayAct] PingOne PATCH failed (${status}):`, detail);
    return res.status(status || 502).json({
      error: 'pingone_patch_failed',
      message: `PingOne returned ${status}: ${detail}`,
    });
  }
}

module.exports.patchMayAct = patchMayAct;

/**
 * GET /api/demo/may-act/diagnose
 *
 * Checks two things that must both be true for `may_act` to appear in the Subject Token:
 *   1. The signed-in user's `mayAct` custom attribute in PingOne.
 *   2. The `BX Finance User` OIDC app's attribute mappings — does a `may_act` mapping exist?
 *
 * Returns a structured report so the demo page can show exactly what is missing.
 */
async function diagnoseMayAct(req, res) {
  const pingOneUserId = req.user?.id;
  if (!pingOneUserId) {
    return res.status(401).json({ error: 'unauthenticated', message: 'No user session' });
  }

  const envId      = configStore.getEffective('pingone_environment_id');
  const region     = configStore.getEffective('pingone_region') || 'com';
  const bffClientId = configStore.getEffective('admin_client_id');
  const userAppClientId = configStore.getEffective('pingone_core_user_client_id') ||
                          configStore.getEffective('admin_client_id'); // fallback

  if (!envId) {
    return res.status(503).json({ error: 'not_configured', message: 'pingone_environment_id not set' });
  }

  let token;
  try {
    token = await getManagementToken();
  } catch (err) {
    return res.status(503).json({ error: 'management_token_failed', message: err.message });
  }

  const base = `https://api.pingone.${region}/v1/environments/${envId}`;
  const report = {
    userId: pingOneUserId,
    bffClientId,
    checks: {
      userAttribute: { label: 'mayAct on user record', pass: false, value: null, detail: null },
      appMapping:    { label: 'may_act mapping on BX Finance User app', pass: false, value: null, detail: null },
    },
    diagnosis: [],
    nextStep: null,
  };

  // ── Check 1: user's mayAct attribute ────────────────────────────────────────
  try {
    const userRes = await axios.get(`${base}/users/${pingOneUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const mayAct = userRes.data?.mayAct ?? null;
    report.checks.userAttribute.value = mayAct;
    if (mayAct && mayAct.sub) {
      report.checks.userAttribute.pass = true;
      report.checks.userAttribute.detail = `mayAct.sub = "${mayAct.sub}"`;
      if (mayAct.sub !== bffClientId) {
        report.checks.userAttribute.pass = false;
        report.checks.userAttribute.detail = `mayAct.sub "${mayAct.sub}" does NOT match BFF client ID "${bffClientId}"`;
      }
    } else {
      report.checks.userAttribute.detail = 'mayAct attribute is null or missing on this user record';
    }
  } catch (err) {
    report.checks.userAttribute.detail = `PingOne user GET failed: ${err.response?.status} — ${err.response?.data?.message || err.message}`;
  }

  // ── Check 2: BX Finance User app attribute mappings ─────────────────────────
  // Find the app by client_id = userAppClientId, then check its attribute mappings
  try {
    // List OIDC apps, find the one matching userAppClientId
    const appsRes = await axios.get(`${base}/applications?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const apps = appsRes.data?._embedded?.applications || [];
    const userApp = apps.find(a => a.protocol === 'OPENID_CONNECT' && a.oidcOptions?.clientId === userAppClientId);

    if (!userApp) {
      report.checks.appMapping.detail = `Could not find OIDC app with clientId "${userAppClientId}" — check PINGONE_CORE_USER_CLIENT_ID config`;
    } else {
      report.checks.appMapping.value = { appId: userApp.id, appName: userApp.name };
      // Fetch attribute mappings for this app
      const mappingsRes = await axios.get(`${base}/applications/${userApp.id}/attributes`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      const mappings = mappingsRes.data?._embedded?.attributes || [];
      const mayActMapping = mappings.find(m => m.name === 'may_act');
      if (mayActMapping) {
        report.checks.appMapping.pass = true;
        report.checks.appMapping.value = { appId: userApp.id, appName: userApp.name, mapping: mayActMapping };
        report.checks.appMapping.detail = `Mapping found: expression = "${mayActMapping.value}"`;
      } else {
        report.checks.appMapping.detail = `No "may_act" attribute mapping on app "${userApp.name}" (id: ${userApp.id})`;
      }
    }
  } catch (err) {
    report.checks.appMapping.detail = `PingOne app/mappings GET failed: ${err.response?.status} — ${err.response?.data?.message || err.message}`;
  }

  // ── Build diagnosis ──────────────────────────────────────────────────────────
  if (!report.checks.userAttribute.pass) {
    report.diagnosis.push('❌ User attribute: mayAct is not set (or wrong value) on this user record.');
  } else {
    report.diagnosis.push('✅ User attribute: mayAct is set correctly on this user record.');
  }
  if (!report.checks.appMapping.pass) {
    report.diagnosis.push('❌ App mapping: no may_act attribute mapping found on BX Finance User app.');
  } else {
    report.diagnosis.push('✅ App mapping: may_act attribute mapping exists on BX Finance User app.');
  }

  if (!report.checks.userAttribute.pass && !report.checks.appMapping.pass) {
    report.nextStep = 'Fix both: (1) Click "Enable may_act" on /demo-data to set the user attribute. (2) Add the may_act mapping to the BX Finance User app in PingOne Console → Applications → BX Finance User → Attribute Mappings tab. Then re-login for a fresh token.';
  } else if (!report.checks.userAttribute.pass) {
    report.nextStep = 'Click "Enable may_act" on /demo-data (or use the Postman "Utility — Set mayAct" request). Then sign out and back in for a fresh token.';
  } else if (!report.checks.appMapping.pass) {
    report.nextStep = 'Add the may_act attribute mapping to the BX Finance User app in PingOne Console → Applications → BX Finance User → Attribute Mappings tab. Expression: (#root.user.mayAct != null ? #root.user.mayAct : null). Then re-login.';
  } else {
    report.nextStep = 'Both checks pass. Sign out and back in to get a fresh Subject Token — may_act should now appear.';
  }

  return res.json(report);
}

module.exports.diagnoseMayAct = diagnoseMayAct;
