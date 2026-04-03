// banking_api_server/services/transactionConsentChallenge.js
/**
 * Server-bound consent challenges for high-value transactions (HITL).
 * State lives in express-session so it works across serverless instances when session store is Redis.
 *
 * Flow after user ticks consent checkbox:
 *   1. POST /consent-challenge              → createChallenge()  → status: 'pending'
 *   2. POST /consent-challenge/:id/confirm  → sendOtp()          → status: 'otp_pending' + otpHash stored
 *   3. POST /consent-challenge/:id/verify-otp → verifyOtp()      → status: 'confirmed'
 *   4. POST /transactions { consentChallengeId } → verifyAndConsumeChallenge() → executes
 */
'use strict';

const crypto = require('crypto');
const dataStore = require('../data/store');

const HIGH_VALUE_CONSENT_USD = 500;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CONFIRMED_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_PER_SESSION = 8;
const OTP_TTL_MS = 5 * 60 * 1000;   // 5 minutes to enter OTP
const OTP_MAX_ATTEMPTS = 3;          // lock after 3 wrong codes

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

// ── OTP helpers ──────────────────────────────────────────────────────────────

/** Generate a cryptographically random 6-digit OTP string. */
function generateOtp() {
  const buf = crypto.randomBytes(3);
  const num = (buf[0] << 16 | buf[1] << 8 | buf[2]) % 1_000_000;
  return String(num).padStart(6, '0');
}

/**
 * One-way hash of the raw OTP so we never store plaintext in the session.
 * Uses HMAC-SHA256 with a per-challenge random salt (stored alongside).
 */
function hashOtp(otp, salt) {
  return crypto.createHmac('sha256', salt).update(otp).digest('hex');
}

/** Constant-time comparison of two hex strings. */
function safeEqual(a, b) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
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

/**
 * confirmChallenge — user has ticked the consent checkbox and clicked "Agree".
 * Generates a 6-digit OTP, stores its hash in the session, and sends it
 * via PingOne email.  Challenge moves to status 'otp_pending'.
 *
 * NOTE: this function is async because it calls emailService.sendOtpEmail().
 * The caller (route handler) must await it.
 *
 * @param {import('express').Request} req
 * @param {string} challengeId
 * @param {object} [opts]
 * @param {string} [opts.userName]  Display name for the email greeting
 * @returns {Promise<{ ok: true, challengeId: string, otpSent: boolean }
 *                 | { ok: false, status: number, json: object }>}
 */
async function confirmChallenge(req, challengeId, opts = {}) {
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

  // Generate OTP and store its hash
  const otpPlain = generateOtp();
  const otpSalt  = crypto.randomBytes(16).toString('hex');
  ch.otpHash       = hashOtp(otpPlain, otpSalt);
  ch.otpSalt       = otpSalt;
  ch.otpAttempts   = 0;
  ch.otpExpiresAt  = now + OTP_TTL_MS;
  ch.status        = 'otp_pending';

  console.log(`[ConsentChallenge] OTP generated challenge=${challengeId.slice(0, 8)}… user=${req.user.id}`);

  // Send via PingOne email (fire and collect result — failure is surfaced to caller)
  let otpSent = false;
  let otpCodeFallback = null; // only set when email fails — returned to UI for demo display
  try {
    const { sendOtpEmail } = require('./emailService');
    const performer = dataStore.getUserById(req.user.id);
    const userName = opts.userName ||
      (performer ? `${performer.firstName} ${performer.lastName}`.trim() : null) ||
      req.user.username || 'Valued Customer';
    await sendOtpEmail(req.user.id, {
      otpCode: otpPlain,
      amount: ch.snapshot.amount,
      transactionType: ch.snapshot.type,
      userName,
      expiresInMin: Math.ceil(OTP_TTL_MS / 60_000),
    });
    otpSent = true;
  } catch (emailErr) {
    // Email delivery unavailable (PingOne not configured or API error).
    // Return the plaintext code so the UI can display it inline for demo purposes.
    const detail = emailErr.response?.data ? JSON.stringify(emailErr.response.data) : emailErr.message;
    console.warn(`[ConsentChallenge] OTP email failed (challenge=${challengeId.slice(0, 8)}…): ${detail}`);
    otpCodeFallback = otpPlain;
  }

  return { ok: true, challengeId, otpSent, otpExpiresAt: ch.otpExpiresAt, otpCodeFallback };
}

/**
 * verifyOtp — user submits the 6-digit code received by email.
 * On success, challenge moves to status 'confirmed' (ready for verifyAndConsumeChallenge).
 *
 * @param {import('express').Request} req
 * @param {string} challengeId
 * @param {string} otpCode  Raw 6-digit code from the user
 */
function verifyOtp(req, challengeId, otpCode) {
  if (!challengeId || typeof challengeId !== 'string') {
    return { ok: false, status: 400, json: { error: 'invalid_challenge', message: 'challengeId is required.' } };
  }
  const st = store(req.session);
  pruneExpired(st);
  const ch = st[challengeId];
  if (!ch || ch.userId !== req.user.id) {
    return { ok: false, status: 404, json: { error: 'challenge_not_found', message: 'Unknown or expired consent challenge.' } };
  }
  if (ch.status !== 'otp_pending') {
    return { ok: false, status: 409, json: { error: 'otp_not_expected', message: 'No OTP is pending for this challenge.' } };
  }
  if (Date.now() > ch.otpExpiresAt) {
    ch.status = 'expired';
    return { ok: false, status: 410, json: { error: 'otp_expired', message: 'The verification code has expired. Start the transaction again.' } };
  }
  if (!otpCode || typeof otpCode !== 'string' || !/^\d{6}$/.test(otpCode.trim())) {
    return { ok: false, status: 400, json: { error: 'otp_invalid_format', message: 'Enter a 6-digit verification code.' } };
  }

  ch.otpAttempts = (ch.otpAttempts || 0) + 1;
  const expected = hashOtp(otpCode.trim(), ch.otpSalt);
  if (!safeEqual(ch.otpHash, expected)) {
    const remaining = OTP_MAX_ATTEMPTS - ch.otpAttempts;
    if (remaining <= 0) {
      delete st[challengeId];
      console.warn(`[ConsentChallenge] OTP locked after ${OTP_MAX_ATTEMPTS} attempts challenge=${challengeId.slice(0, 8)}… user=${req.user.id}`);
      return { ok: false, status: 429, json: { error: 'otp_locked', message: 'Too many incorrect attempts. Please start the transaction again.' } };
    }
    return { ok: false, status: 400, json: { error: 'otp_incorrect', message: `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`, attemptsRemaining: remaining } };
  }

  // ✅ Correct — promote to confirmed
  const now = Date.now();
  ch.status          = 'confirmed';
  ch.confirmedAt     = now;
  ch.confirmExpiresAt = now + CONFIRMED_TTL_MS;
  // Clear sensitive OTP fields
  delete ch.otpHash;
  delete ch.otpSalt;
  delete ch.otpAttempts;
  delete ch.otpExpiresAt;

  console.log(`[ConsentChallenge] OTP verified challenge=${challengeId.slice(0, 8)}… user=${req.user.id}`);
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
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  normalizeSnapshot,
  validateIntent,
  createChallenge,
  getChallenge,
  confirmChallenge,
  verifyOtp,
  verifyAndConsumeChallenge,
};
