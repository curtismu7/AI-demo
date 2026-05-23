import { useState, useRef, useCallback, useEffect } from "react";

// HITL_PARTICIPANTS — matches hitl-sequence.mmd participant declarations
const HITL_PARTICIPANTS = [
  { id: "B",   label: "Browser" },
  { id: "BFF", label: "BFF (demo_api_server)" },
  { id: "TC",  label: "transactionConsent.js" },
  { id: "P1",  label: "PingOne MFA" },
];

// HITL_STEPS — populated in Task 2 and Task 3
const HITL_STEPS = [
  // ── Shared preamble ─────────────────────────────────────────────────────────
  {
    type: "note",
    participants: ["B", "P1"],
    path: "shared",
    text: "ALL PATHS — 428 gate enforces consent requirement",
    description: "428 gate",
    why: "Every write operation (transfer, withdrawal, deposit >= $250) is gated by a mandatory consent challenge. The 428 Precondition Required response is the BFF telling the browser 'you must prove consent before I'll execute this'. No challenge ID, no transaction.",
    onError: [
      "Feature flag ff_hitl_enabled=false — gate is bypassed entirely; expected in dev/test only",
      "Amount below threshold — 428 is not issued; transaction proceeds without challenge",
    ],
  },
  {
    step: 1,
    path: "shared",
    from: "B",
    to: "BFF",
    label: "POST /api/transactions (transfer, or withdrawal/deposit >= $250)",
    type: "request",
    description: "POST /api/transactions",
    why: "The user has triggered a write operation in the UI. The BFF receives it, checks the HITL feature flag and amount threshold, and immediately returns 428 — it does not attempt the transaction. This makes the gate synchronous and impossible to race.",
    request: {
      method: "POST",
      url: "https://api.ping.demo:3001/api/transactions",
      headers: { "Content-Type": "application/json", Cookie: "connect.sid=…" },
      body: { type: "transfer", fromAccountId: "acct_01", toAccountId: "acct_02", amount: 500 },
    },
    response: {
      status: 428,
      headers: { "Content-Type": "application/json" },
      body: { error: "precondition_required", message: "Consent challenge required before executing this transaction" },
    },
    rulesEvaluated: [
      { rule: "ff_hitl_enabled = true", result: "PASS", detail: "configStore.getEffective('ff_hitl_enabled') = 'true'" },
      { rule: "amount >= confirm_threshold_usd ($250)", result: "PASS", detail: "amount=500 >= threshold=250" },
    ],
    onError: [
      "200 returned instead of 428 — HITL flag is off or amount is below threshold",
      "401 — session expired; user must re-authenticate before retrying",
    ],
  },
  {
    step: 2,
    path: "shared",
    from: "BFF",
    to: "B",
    label: "428 Precondition Required",
    type: "response",
    description: "428 response",
    why: "RFC 6585 §3: 428 signals that the server requires a precondition the client hasn't met. The UI uses this status code to trigger the consent modal — it's not an error, it's a protocol signal.",
    response: {
      status: 428,
      body: { error: "precondition_required", message: "Consent challenge required" },
    },
    onError: [
      "UI treats 428 as a generic error and shows an error toast — UI must handle 428 specifically",
      "Browser blocks the response — CORS misconfiguration on the BFF",
    ],
  },
  {
    step: 3,
    path: "shared",
    from: "B",
    to: "BFF",
    label: "POST /consent-challenge { type, amount, fromAccountId, ... }",
    type: "request",
    description: "Create challenge",
    why: "The browser now creates a consent challenge, attaching the transaction details. The BFF hashes a snapshot of those details into the challenge record — this snapshot is checked at verify time to prevent tampering with the amount or destination between challenge creation and execution.",
    request: {
      method: "POST",
      url: "https://api.ping.demo:3001/consent-challenge",
      headers: { "Content-Type": "application/json", Cookie: "connect.sid=…" },
      body: { type: "transfer", amount: 500, fromAccountId: "acct_01", toAccountId: "acct_02", currency: "USD" },
    },
    response: {
      status: 201,
      body: { challengeId: "ch_01ABC", expiresAt: "2026-05-23T…", snapshot: "sha256:…" },
    },
    onError: [
      "400 — missing required field (type, amount, fromAccountId)",
      "401 — session expired",
      "Challenge created but snapshot hash wrong — tampering detection will fail at verify step",
    ],
  },
  {
    step: 4,
    path: "shared",
    from: "BFF",
    to: "TC",
    label: "createChallenge()",
    type: "request",
    description: "createChallenge()",
    why: "The BFF delegates challenge lifecycle to transactionConsentChallenge.js. This service stores the challenge in the session (keyed by challengeId), including a SHA-256 snapshot of the transaction details. Keeping it in the session ties the challenge to the authenticated user — a different session cannot consume it.",
    request: { call: "createChallenge({ type, amount, fromAccountId, toAccountId, userId })" },
    response: { returns: "{ challengeId, expiresAt, snapshot }" },
    rulesEvaluated: [
      { rule: "User is authenticated", result: "PASS", detail: "req.session.user.id present" },
      { rule: "Challenge fields valid", result: "PASS", detail: "type, amount, fromAccountId all present and typed correctly" },
    ],
    onError: [
      "Session missing — createChallenge throws; BFF returns 401",
      "Duplicate challengeId collision — extremely unlikely (UUID v4); retry is safe",
    ],
  },
  {
    step: 5,
    path: "shared",
    from: "BFF",
    to: "B",
    label: "201 { challengeId, expiresAt, snapshot }",
    type: "response",
    description: "Challenge created",
    why: "The browser receives the challengeId it will attach to every subsequent consent-flow request. The expiresAt field lets the UI display a countdown and disable the form when the challenge expires. The snapshot is opaque to the browser — it's for server-side tamper detection only.",
    response: {
      status: 201,
      body: { challengeId: "ch_01ABC", expiresAt: "2026-05-23T12:05:00Z", snapshot: "sha256:abc…" },
    },
    onError: [
      "UI doesn't store challengeId — subsequent confirm call will 404",
      "UI ignores expiresAt — user submits OTP after expiry; verify returns 410 Gone",
    ],
  },

  // ── Path 1: Homegrown OTP ────────────────────────────────────────────────────
  {
    type: "note",
    participants: ["B", "TC"],
    path: "homegrown",
    text: "PATH 1 — mode = homegrown (BFF-generated OTP, any amount)",
    description: "Path 1 start",
    why: "When hitl_consent_mfa_mode=homegrown, the BFF generates and emails a 6-digit OTP itself — no PingOne call needed. This path is the simplest: no external MFA dependency, no device enrollment, works at any amount. It's the fallback for environments without PingOne MFA configured.",
    onError: [
      "Config flag is wrong — check configStore.getEffective('hitl_consent_mfa_mode')",
    ],
  },
  {
    step: 6,
    path: "homegrown",
    from: "B",
    to: "BFF",
    label: "POST /consent-challenge/:id/confirm",
    type: "request",
    description: "Confirm challenge (P1)",
    why: "The browser posts to confirm, signalling that the user has reviewed the transaction details in the modal and is ready to receive the OTP. The BFF checks the challenge is still pending and not expired before generating the OTP.",
    request: {
      method: "POST",
      url: "https://api.ping.demo:3001/consent-challenge/ch_01ABC/confirm",
      headers: { "Content-Type": "application/json", Cookie: "connect.sid=…" },
      body: {},
    },
    response: {
      status: 200,
      body: { otpSent: true, otpExpiresAt: "2026-05-23T12:06:00Z" },
    },
    onError: [
      "404 — challengeId not found or already consumed",
      "410 — challenge expired (expiresAt in the past)",
      "403 — session user doesn't match challenge subject",
    ],
  },
  {
    step: 7,
    path: "homegrown",
    from: "BFF",
    to: "TC",
    label: "confirmChallenge() — mode=homegrown — generates OTP, stores HMAC hash",
    type: "request",
    description: "Generate OTP",
    why: "transactionConsentChallenge.js generates a cryptographically random 6-digit OTP and stores its HMAC-SHA256 hash in the challenge record (never the plaintext). The OTP is emailed to the user's registered address. Storing the hash means a DB read can't leak the OTP.",
    request: { call: "confirmChallenge(challengeId, { mode: 'homegrown' })" },
    response: { returns: "{ otpSent: true, otpExpiresAt }" },
    rulesEvaluated: [
      { rule: "Challenge status = pending", result: "PASS", detail: "ch.status='pending'" },
      { rule: "Challenge not expired", result: "PASS", detail: "ch.expiresAt > now" },
      { rule: "mode = homegrown", result: "PASS", detail: "configStore 'hitl_consent_mfa_mode' = 'homegrown'" },
    ],
    onError: [
      "Email send fails — BFF returns 500; user must retry",
      "OTP generation uses Math.random() — must use crypto.randomInt() for security",
    ],
  },
  {
    step: 8,
    path: "homegrown",
    from: "BFF",
    to: "B",
    label: "200 { otpSent: true, otpExpiresAt }",
    type: "response",
    description: "OTP sent (P1)",
    why: "The browser receives confirmation that an OTP email was sent. The UI should now show the OTP entry field and the expiry countdown. Note: no maskedContact is returned on this path (unlike Path 2) because the BFF already knows the address from the session.",
    response: {
      status: 200,
      body: { otpSent: true, otpExpiresAt: "2026-05-23T12:06:00Z" },
    },
    onError: [
      "UI doesn't show OTP field — it must check otpSent: true to reveal the input",
    ],
  },
  {
    step: 9,
    path: "homegrown",
    from: "B",
    to: "BFF",
    label: "POST /consent-challenge/:id/verify-otp { otp }",
    type: "request",
    description: "Submit OTP (P1)",
    why: "The user enters the 6-digit OTP and submits. The BFF will compare it against the stored HMAC hash using timingSafeEqual to prevent timing-based oracle attacks.",
    request: {
      method: "POST",
      url: "https://api.ping.demo:3001/consent-challenge/ch_01ABC/verify-otp",
      headers: { "Content-Type": "application/json", Cookie: "connect.sid=…" },
      body: { otp: "123456" },
    },
    response: {
      status: 200,
      body: { challengeId: "ch_01ABC", confirmExpiresAt: "2026-05-23T12:10:00Z" },
    },
    onError: [
      "401 — OTP wrong; challenge status remains 'pending'; user can retry until expiry",
      "410 — OTP expired (otpExpiresAt in the past)",
      "429 — too many wrong OTP attempts (if rate limiting is enabled)",
    ],
  },
  {
    step: 10,
    path: "homegrown",
    from: "BFF",
    to: "TC",
    label: "verifyOtp() — timingSafeEqual(hash) — status = confirmed",
    type: "request",
    description: "Verify OTP (P1)",
    why: "timingSafeEqual prevents an attacker from guessing the OTP one digit at a time by measuring response latency. Once verified, the challenge status is set to 'confirmed' and a confirmExpiresAt window is set — the actual transaction must be submitted within this window.",
    request: { call: "verifyOtp(challengeId, otp)" },
    response: { returns: "{ confirmed: true, confirmExpiresAt }" },
    rulesEvaluated: [
      { rule: "HMAC hash matches OTP", result: "PASS", detail: "crypto.timingSafeEqual(stored, submitted)" },
      { rule: "OTP not expired", result: "PASS", detail: "ch.otpExpiresAt > now" },
    ],
    onError: [
      "Using string equality instead of timingSafeEqual — timing oracle vulnerability",
      "Status not updated to 'confirmed' — transaction step will re-challenge",
    ],
  },
  {
    step: 11,
    path: "homegrown",
    from: "BFF",
    to: "B",
    label: "200 { challengeId, confirmExpiresAt }",
    type: "response",
    description: "OTP verified (P1)",
    why: "The browser now knows the challenge is confirmed. It has a window (confirmExpiresAt) to submit the actual transaction. The UI should immediately POST the transaction without waiting for user interaction — the consent was given.",
    response: {
      status: 200,
      body: { challengeId: "ch_01ABC", confirmExpiresAt: "2026-05-23T12:10:00Z" },
    },
    onError: [
      "UI delays transaction submission past confirmExpiresAt — transaction is rejected",
    ],
  },
  {
    step: 12,
    path: "homegrown",
    from: "B",
    to: "BFF",
    label: "POST /api/transactions { consentChallengeId }",
    type: "request",
    description: "Execute transaction (P1)",
    why: "The original transaction is now re-submitted with the consentChallengeId attached. The BFF will verify and consume the challenge (one-time use) before executing. The transaction payload is exactly what the user reviewed — the snapshot check ensures it hasn't changed.",
    request: {
      method: "POST",
      url: "https://api.ping.demo:3001/api/transactions",
      headers: { "Content-Type": "application/json", Cookie: "connect.sid=…" },
      body: { type: "transfer", fromAccountId: "acct_01", toAccountId: "acct_02", amount: 500, consentChallengeId: "ch_01ABC" },
    },
    response: {
      status: 200,
      body: { transactionId: "txn_01XYZ", status: "completed" },
    },
    onError: [
      "409 — challenge already consumed (replay attempt)",
      "422 — snapshot mismatch (amount or destination tampered)",
      "410 — confirmExpiresAt passed",
    ],
  },
  {
    step: 13,
    path: "homegrown",
    from: "BFF",
    to: "TC",
    label: "verifyAndConsumeChallenge() — snapshot match, one-time use",
    type: "request",
    description: "Consume challenge (P1)",
    why: "Two invariants are checked atomically: (1) the transaction snapshot matches what the user approved — prevents amount/destination tampering between challenge creation and execution; (2) the challenge is marked consumed so it can never be replayed, even if the network retransmits the request.",
    request: { call: "verifyAndConsumeChallenge(challengeId, { type, amount, fromAccountId, toAccountId })" },
    response: { returns: "{ consumed: true }" },
    rulesEvaluated: [
      { rule: "Challenge status = confirmed", result: "PASS", detail: "ch.status='confirmed'" },
      { rule: "Snapshot matches transaction payload", result: "PASS", detail: "sha256(payload) === ch.snapshot" },
      { rule: "confirmExpiresAt not passed", result: "PASS", detail: "ch.confirmExpiresAt > now" },
      { rule: "Challenge not already consumed", result: "PASS", detail: "ch.consumed = false" },
    ],
    onError: [
      "Snapshot mismatch — attacker modified amount after user approved",
      "Challenge already consumed — replay attack or network retry",
    ],
  },
  {
    step: 14,
    path: "homegrown",
    from: "BFF",
    to: "B",
    label: "200 transaction result",
    type: "response",
    description: "Transaction complete (P1)",
    why: "The transaction executed successfully. The challenge lifecycle is complete — created, confirmed, consumed. The UI can now show the success state and close the modal.",
    response: {
      status: 200,
      body: { transactionId: "txn_01XYZ", status: "completed", amount: 500, type: "transfer" },
    },
    onError: [
      "Downstream banking error after consent passed — show error but don't re-challenge",
    ],
  },
];

// HITL_SCENARIOS — populated in Task 4
const HITL_SCENARIOS = {
  all:       HITL_STEPS,
  homegrown: HITL_STEPS.filter((s) => s.path === "shared" || s.path === "homegrown"),
  onetime:   HITL_STEPS.filter((s) => s.path === "shared" || s.path === "onetime"),
  device:    HITL_STEPS.filter((s) => s.path === "shared" || s.path === "device"),
};

export default function HitlSequenceDiagram() {
  return <div style={{ padding: "1rem", color: "#475569" }}>Loading…</div>;
}
