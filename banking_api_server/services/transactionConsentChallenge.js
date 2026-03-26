// banking_api_server/services/transactionConsentChallenge.js
/**
 * Server-bound consent challenges for high-value transactions (HITL).
 * State lives in express-session so it works across serverless instances when session store is Redis.
 */
'use strict';

const crypto = require('crypto');
const dataStore = require('../data/store');

const HIGH_VALUE_CONSENT_USD = 500;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CONFIRMED_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_PER_SESSION = 8;

/** @returns {Record<string, object>} */
function store(session) {
  if (!session.txConsentChallenges || typeof session.txConsentChallenges !== 'object') {
    session.txConsentChallenges = {};
  }
  return session.txConsentChallenges;
}

function pruneExpired(st) {
  const now = Date.now();
  for (const [id, ch] of Object.entries(st)) {
    if (!ch || typeof ch !== 'object') {
      delete st[id];
      continue;
    }
    if (ch.status === 'pending' && ch.expiresAt < now) delete st[id];
    if (ch.status === 'confirmed' && ch.confirmExpiresAt < now) delete st[id];
  }
}

/**
 * Normalize transaction body fields for comparison (must match POST /api/transactions).
 * @param {object} body
 */
function normalizeSnapshot(body) {
  const parsedAmount = parseFloat(body.amount);
  const amount = Math.round(parsedAmount * 100) / 100;
  return {
    type: body.type,
    amount,
    fromAccountId: body.fromAccountId || null,
    toAccountId: body.toAccountId || null,
    description: String(body.description || '').trim(),
  };
}

function snapshotsEqual(a, b) {
  return (
    a.type === b.type &&
    a.amount === b.amount &&
    a.fromAccountId === b.fromAccountId &&
    a.toAccountId === b.toAccountId &&
    a.description === b.description
  );
}

/**
 * Validates the same business rules as POST /api/transactions (without executing).
 * @returns {{ ok: true, normalized: object } | { ok: false, status: number, json: object }}
 */
function validateIntent(req, rawBody) {
  const { fromAccountId, toAccountId, amount, type, description } = rawBody;

  const parsedAmount = parseFloat(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return { ok: false, status: 400, json: { error: 'invalid_amount', message: 'Amount must be a positive number.' } };
  }
  if (parsedAmount > 1_000_000) {
    return { ok: false, status: 400, json: { error: 'amount_exceeds_limit', message: 'Transaction amount cannot exceed $1,000,000.' } };
  }
  if (type === 'transfer' && parsedAmount < 50) {
    return { ok: false, status: 400, json: { error: 'below_minimum', message: 'Transfer amount must be at least $50.' } };
  }

  const rounded = Math.round(parsedAmount * 100) / 100;
  if (!type) {
    return { ok: false, status: 400, json: { error: 'Missing required fields: amount and type' } };
  }
  if (type === 'deposit' && !toAccountId) {
    return { ok: false, status: 400, json: { error: 'Missing required field: toAccountId for deposit' } };
  }
  if (type === 'withdrawal' && !fromAccountId) {
    return { ok: false, status: 400, json: { error: 'Missing required field: fromAccountId for withdrawal' } };
  }
  if (type === 'transfer' && (!fromAccountId || !toAccountId)) {
    return { ok: false, status: 400, json: { error: 'Missing required fields: fromAccountId and toAccountId for transfer' } };
  }

  if (req.user.role !== 'admin') {
    if (fromAccountId) {
      const fromAccount = dataStore.getAccountById(fromAccountId);
      if (!fromAccount) return { ok: false, status: 404, json: { error: 'From account not found' } };
      if (fromAccount.userId !== req.user.id) {
        return { ok: false, status: 403, json: { error: 'Access denied. You can only transfer from your own accounts.' } };
      }
    }
    if (toAccountId) {
      const toAccount = dataStore.getAccountById(toAccountId);
      if (!toAccount) return { ok: false, status: 404, json: { error: 'To account not found' } };
      if (toAccount.userId !== req.user.id) {
        return { ok: false, status: 403, json: { error: 'Access denied. You can only deposit to your own accounts.' } };
      }
    }
  }

  if (fromAccountId && (type === 'withdrawal' || type === 'transfer')) {
    const fromAccount = dataStore.getAccountById(fromAccountId);
    if (!fromAccount) return { ok: false, status: 404, json: { error: 'From account not found' } };
    if (fromAccount.balance < rounded) {
      return { ok: false, status: 400, json: { error: 'Insufficient balance' } };
    }
  }

  const normalized = normalizeSnapshot({
    type,
    amount: rounded,
    fromAccountId: fromAccountId || null,
    toAccountId: toAccountId || null,
    description: description || '',
  });

  return { ok: true, normalized };
}

/**
 * @param {import('express').Request} req
 * @param {object} rawBody
 */
function createChallenge(req, rawBody) {
  if (req.user.role === 'admin') {
    return { ok: false, status: 400, json: { error: 'consent_challenge_not_applicable', message: 'Admin transactions do not use consent challenges.' } };
  }

  const v = validateIntent(req, rawBody);
  if (!v.ok) return v;

  if (!['transfer', 'withdrawal', 'deposit'].includes(v.normalized.type)) {
    return { ok: false, status: 400, json: { error: 'invalid_type', message: 'Consent challenges apply to transfer, withdrawal, or deposit only.' } };
  }

  if (v.normalized.amount <= HIGH_VALUE_CONSENT_USD) {
    return {
      ok: false,
      status: 400,
      json: {
        error: 'consent_challenge_not_required',
        message: `Consent challenges are only issued for amounts over $${HIGH_VALUE_CONSENT_USD}.`,
        high_value_threshold_usd: HIGH_VALUE_CONSENT_USD,
      },
    };
  }

  const st = store(req.session);
  pruneExpired(st);

  const pendingCount = Object.values(st).filter((c) => c && c.userId === req.user.id && c.status === 'pending').length;
  if (pendingCount >= MAX_PENDING_PER_SESSION) {
    return { ok: false, status: 429, json: { error: 'too_many_challenges', message: 'Too many open consent challenges. Complete or wait for them to expire.' } };
  }

  const challengeId = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  st[challengeId] = {
    userId: req.user.id,
    snapshot: v.normalized,
    status: 'pending',
    createdAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
  };

  console.log(
    `[ConsentChallenge] created challenge=${challengeId.slice(0, 8)}… user=${req.user.id} amount=${v.normalized.amount} type=${v.normalized.type}`,
  );

  return { ok: true, challengeId, expiresAt: st[challengeId].expiresAt, snapshot: v.normalized };
}

function getChallenge(req, challengeId) {
  if (!challengeId || typeof challengeId !== 'string') {
    return { ok: false, status: 400, json: { error: 'invalid_challenge', message: 'challengeId is required.' } };
  }
  const st = store(req.session);
  pruneExpired(st);
  const ch = st[challengeId];
  if (!ch || ch.userId !== req.user.id) {
    return { ok: false, status: 404, json: { error: 'challenge_not_found', message: 'Unknown or expired consent challenge.' } };
  }
  if (ch.status !== 'pending') {
    return { ok: false, status: 409, json: { error: 'challenge_not_pending', message: 'This challenge is no longer awaiting review.' } };
  }
  return {
    ok: true,
    challengeId,
    snapshot: ch.snapshot,
    status: ch.status,
    expiresAt: ch.expiresAt,
  };
}

function confirmChallenge(req, challengeId) {
  if (!challengeId || typeof challengeId !== 'string') {
    return { ok: false, status: 400, json: { error: 'invalid_challenge', message: 'challengeId is required.' } };
  }
  const st = store(req.session);
  pruneExpired(st);
  const ch = st[challengeId];
  if (!ch || ch.userId !== req.user.id) {
    return { ok: false, status: 404, json: { error: 'challenge_not_found', message: 'Unknown or expired consent challenge.' } };
  }
  if (ch.status !== 'pending') {
    return { ok: false, status: 409, json: { error: 'challenge_not_pending', message: 'Challenge already confirmed or consumed.' } };
  }
  const now = Date.now();
  if (ch.expiresAt < now) {
    delete st[challengeId];
    return { ok: false, status: 410, json: { error: 'challenge_expired', message: 'Consent challenge expired. Start again from the dashboard.' } };
  }

  ch.status = 'confirmed';
  ch.confirmedAt = now;
  ch.confirmExpiresAt = now + CONFIRMED_TTL_MS;

  console.log(`[ConsentChallenge] confirmed challenge=${challengeId.slice(0, 8)}… user=${req.user.id}`);

  return { ok: true, challengeId, confirmExpiresAt: ch.confirmExpiresAt };
}

/**
 * Verifies confirmed challenge matches POST body, then removes it (one-time use).
 * @returns {{ ok: true } | { ok: false, status: number, json: object }}
 */
function verifyAndConsumeChallenge(req, challengeId, postBody) {
  if (!challengeId || typeof challengeId !== 'string') {
    return { ok: false, status: 400, json: { error: 'consent_challenge_required', message: 'A valid consentChallengeId is required for this amount.' } };
  }
  const st = store(req.session);
  pruneExpired(st);
  const ch = st[challengeId];
  if (!ch || ch.userId !== req.user.id) {
    return { ok: false, status: 400, json: { error: 'consent_challenge_invalid', message: 'Unknown or expired consent challenge. Complete the consent flow again.' } };
  }
  if (ch.status !== 'confirmed') {
    return { ok: false, status: 400, json: { error: 'consent_not_confirmed', message: 'Confirm the consent screen before submitting the transaction.' } };
  }
  if (ch.confirmExpiresAt < Date.now()) {
    delete st[challengeId];
    return { ok: false, status: 410, json: { error: 'consent_confirmation_expired', message: 'Confirmation expired. Open a new consent challenge from the dashboard.' } };
  }

  const postSnap = normalizeSnapshot(postBody);
  if (!snapshotsEqual(ch.snapshot, postSnap)) {
    return {
      ok: false,
      status: 400,
      json: {
        error: 'consent_payload_mismatch',
        message: 'Transaction details do not match the consent challenge. Start again from the dashboard.',
      },
    };
  }

  delete st[challengeId];
  console.log(`[ConsentChallenge] consumed challenge=${challengeId.slice(0, 8)}… user=${req.user.id}`);

  return { ok: true };
}

module.exports = {
  HIGH_VALUE_CONSENT_USD,
  CHALLENGE_TTL_MS,
  CONFIRMED_TTL_MS,
  normalizeSnapshot,
  validateIntent,
  createChallenge,
  getChallenge,
  confirmChallenge,
  verifyAndConsumeChallenge,
};
