// banking_api_server/routes/demoScenario.js
/**
 * GET/PUT demo scenario — account display names, balances, per-user step-up threshold.
 * Authenticated users may only modify their own accounts.
 */
'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const dataStore = require('../data/store');
const runtimeSettings = require('../config/runtimeSettings');
const demoScenarioStore = require('../services/demoScenarioStore');
const accountsRouter = require('./accounts');

const router = express.Router();

const DEFAULT_STEP_UP = () => runtimeSettings.get('stepUpAmountThreshold');
const BLOCKED_USER_FIELDS = new Set(['id', 'password', 'createdAt']);

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
// No banking:* scope gate — BFF session users often lack those scopes in the PingOne access token.
router.get('/', async (req, res) => {
  try {
    let accounts = dataStore.getAccountsByUserId(req.user.id);
    if (accounts.length === 0 && req.user.id && typeof accountsRouter.provisionDemoAccounts === 'function') {
      accounts = await accountsRouter.provisionDemoAccounts(req.user.id);
    }
    const scenario = await demoScenarioStore.load(req.user.id);
    const currentUser = dataStore.getUserById(req.user.id) || {};
    const userData = buildUserDataForDemoResponse(req, currentUser);
    const bankingAgentUiMode =
      scenario.bankingAgentUiMode === 'embedded' || scenario.bankingAgentUiMode === 'floating'
        ? scenario.bankingAgentUiMode
        : null;
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
      persistenceNote: process.env.VERCEL && !(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)
        ? 'KV not configured — threshold override is per server instance only until you add Upstash/KV.'
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
    const { accounts: bodyAccounts, stepUpAmountThreshold, userData } = req.body || {};
    const uid = req.user.id;

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
      } else if (raw === 'embedded' || raw === 'floating') {
        await demoScenarioStore.save(uid, { bankingAgentUiMode: raw });
      } else {
        return res.status(400).json({
          error: 'invalid_banking_agent_ui_mode',
          message: 'bankingAgentUiMode must be embedded, floating, or null.',
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
          const typeRaw = typeof row.accountType === 'string' ? row.accountType.toLowerCase().trim() : '';
          const accountType = typeRaw === 'savings' ? 'savings' : 'checking';
          let name = typeof row.name === 'string' ? row.name.trim().slice(0, 120) : '';
          if (!name) {
            name = accountType === 'savings' ? 'Savings Account' : 'Checking Account';
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
          const acctNumPrefix = accountType === 'savings' ? 'SAV' : 'CHK';
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
        if (!acct || acct.userId !== uid) {
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
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'userData')) {
      const user = dataStore.getUserById(uid);
      if (!user) {
        return res.status(404).json({ error: 'user_not_found', message: 'Signed-in user not found.' });
      }
      const safeUpdates = sanitizeUserUpdates(userData);
      if (Object.keys(safeUpdates).length > 0) {
        await dataStore.updateUser(uid, safeUpdates);
      }
    }

    const accounts = dataStore.getAccountsByUserId(uid);
    const scenario = await demoScenarioStore.load(uid);
    const currentUser = dataStore.getUserById(uid) || {};
    const { password, ...savedUserData } = currentUser;
    const bankingAgentUiModeOut =
      scenario.bankingAgentUiMode === 'embedded' || scenario.bankingAgentUiMode === 'floating'
        ? scenario.bankingAgentUiMode
        : null;
    res.json({
      ok: true,
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
      },
      userData: savedUserData,
    });
  } catch (e) {
    console.error('[demoScenario] PUT', e);
    res.status(500).json({ error: 'demo_scenario_save_failed', message: e.message });
  }
});

module.exports = router;
