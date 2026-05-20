// banking_api_server/routes/mcpDecisionPolling.js
/**
 * HITL (Human-in-the-Loop) decision polling for MCP tool authorization.
 *
 * When PingOne Authorize (or simulated mode) signals that a tool call requires
 * human approval, the BFF stores a pending decision keyed by taskId. The agent UI
 * polls GET /decision/:taskId and approves/denies via POST.
 *
 * Storage: in-memory Map with TTL auto-cleanup (no Upstash dependency).
 */
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// ── In-memory HITL decision store ─────────────────────────────────────────
const DECISION_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000;
const decisions = new Map();

// Periodic cleanup of expired decisions
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of decisions) {
    if (now - entry.createdAt > DECISION_TTL_MS) {
      decisions.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Create a pending HITL decision.
 * @param {string} userSub - PingOne user sub (owner)
 * @param {object} context - { tool, decisionId, decisionContext, reason }
 * @returns {{ taskId: string }}
 */
function createPendingDecision(userSub, context = {}) {
  const taskId = crypto.randomUUID();
  decisions.set(taskId, {
    status: 'pending',
    userSub,
    tool: context.tool || null,
    decisionId: context.decisionId || null,
    decisionContext: context.decisionContext || 'McpFirstTool',
    reason: context.reason || 'Human approval required',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    resolvedBy: null,
  });
  return { taskId };
}

/**
 * Get a decision by taskId.
 * @param {string} taskId
 * @returns {object|null}
 */
function getDecision(taskId) {
  const entry = decisions.get(taskId);
  if (!entry) return null;
  // Auto-expire
  if (Date.now() - entry.createdAt > DECISION_TTL_MS) {
    decisions.delete(taskId);
    return { ...entry, status: 'expired' };
  }
  return entry;
}

// ── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /decision/:taskId — Poll for decision status.
 */
router.get('/decision/:taskId', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'authentication_required' });
  }

  const entry = getDecision(req.params.taskId);
  if (!entry) {
    return res.status(404).json({ error: 'not_found', message: 'Decision not found or expired.' });
  }

  // Only the owning user can poll their decisions
  const userSub = req.session.user.oauthId || req.session.user.id;
  if (entry.userSub && entry.userSub !== userSub) {
    return res.status(403).json({ error: 'forbidden', message: 'Decision belongs to another user.' });
  }

  return res.json({
    taskId: req.params.taskId,
    status: entry.status,
    tool: entry.tool,
    reason: entry.reason,
    decisionId: entry.decisionId,
    updatedAt: new Date(entry.updatedAt).toISOString(),
  });
});

/**
 * POST /decision/:taskId/approve — User approves HITL decision.
 */
router.post('/decision/:taskId/approve', express.json(), (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'authentication_required' });
  }

  const entry = decisions.get(req.params.taskId);
  if (!entry) {
    return res.status(404).json({ error: 'not_found', message: 'Decision not found or expired.' });
  }

  const userSub = req.session.user.oauthId || req.session.user.id;
  if (entry.userSub && entry.userSub !== userSub) {
    return res.status(403).json({ error: 'forbidden' });
  }

  if (entry.status !== 'pending') {
    return res.status(409).json({ error: 'already_resolved', status: entry.status });
  }

  entry.status = 'approved';
  entry.updatedAt = Date.now();
  entry.resolvedBy = userSub;

  console.log(JSON.stringify({
    event: 'hitl_decision_approved',
    taskId: req.params.taskId,
    userSub,
    tool: entry.tool,
    decisionId: entry.decisionId,
    timestamp: new Date().toISOString(),
  }));

  return res.json({ status: 'approved', taskId: req.params.taskId });
});

/**
 * POST /decision/:taskId/deny — User denies HITL decision.
 */
router.post('/decision/:taskId/deny', express.json(), (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'authentication_required' });
  }

  const entry = decisions.get(req.params.taskId);
  if (!entry) {
    return res.status(404).json({ error: 'not_found', message: 'Decision not found or expired.' });
  }

  const userSub = req.session.user.oauthId || req.session.user.id;
  if (entry.userSub && entry.userSub !== userSub) {
    return res.status(403).json({ error: 'forbidden' });
  }

  if (entry.status !== 'pending') {
    return res.status(409).json({ error: 'already_resolved', status: entry.status });
  }

  entry.status = 'denied';
  entry.updatedAt = Date.now();
  entry.resolvedBy = userSub;

  console.log(JSON.stringify({
    event: 'hitl_decision_denied',
    taskId: req.params.taskId,
    userSub,
    tool: entry.tool,
    decisionId: entry.decisionId,
    timestamp: new Date().toISOString(),
  }));

  return res.json({ status: 'denied', taskId: req.params.taskId });
});

module.exports = router;
module.exports.createPendingDecision = createPendingDecision;
module.exports.getDecision = getDecision;
