/**
 * HITL Gateway Middleware
 * Evaluates MCP tool calls for high-value operations
 * Requires explicit user consent for transfers/withdrawals >$500
 */

import crypto from 'crypto';

// Configuration
const HITL_THRESHOLD = 500; // USD
const HIGH_VALUE_TOOLS = ['create_transfer', 'create_withdrawal'];

/**
 * Middleware: Check if tool call requires HITL consent
 */
export function hitlGatewayMiddleware(req, res, next) {
  // Attach HITL evaluator to request
  req.evaluateHitl = evaluateToolCall;
  req.hitlPending = {}; // Store pending consent requests
  next();
}

/**
 * Evaluate tool call for HITL requirement
 * Returns: { requiresConsent: boolean, consentId?: string, reason?: string }
 */
export async function evaluateToolCall(toolCall, userId) {
  const { tool, params } = toolCall;

  // Check if tool is high-value operation
  if (!HIGH_VALUE_TOOLS.includes(tool)) {
    return { requiresConsent: false };
  }

  // Check amount threshold
  const amount = params.amount || 0;
  if (amount > HITL_THRESHOLD) {
    const consentId = generateConsentId(userId, tool, params);
    return {
      requiresConsent: true,
      consentId,
      reason: `High-value ${tool}: $${amount.toFixed(2)} requires approval`,
      operation: {
        tool,
        params: {
          amount,
          account_id: params.account_id,
          from_account_id: params.from_account_id,
          to_account_id: params.to_account_id,
          description: params.description,
        },
      },
    };
  }

  return { requiresConsent: false };
}

/**
 * Generate unique consent request ID
 */
export function generateConsentId(userId, tool, params) {
  const hash = crypto
    .createHash('sha256')
    .update(`${userId}-${tool}-${JSON.stringify(params)}-${Date.now()}`)
    .digest('hex');
  return hash.substring(0, 16);
}

/**
 * Store consent request (in-memory or Redis)
 */
export async function storeConsentRequest(consentId, consentData) {
  // For demo: in-memory map
  // Production: use Redis with 5-min TTL
  if (!global.pendingConsents) {
    global.pendingConsents = {};
  }

  global.pendingConsents[consentId] = {
    ...consentData,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    decision: null,
  };
}

/**
 * Retrieve + validate consent decision
 */
export async function getConsentDecision(consentId) {
  const consent = global.pendingConsents?.[consentId];
  if (!consent) {
    return { valid: false, error: 'Consent request expired or not found' };
  }

  if (consent.expiresAt < Date.now()) {
    delete global.pendingConsents[consentId];
    return { valid: false, error: 'Consent request expired' };
  }

  if (consent.decision === null) {
    return { valid: false, error: 'Consent not yet decided' };
  }

  return {
    valid: true,
    approved: consent.decision === 'approve',
    operation: consent.operation,
  };
}

/**
 * Record consent decision
 */
export async function recordConsentDecision(consentId, decision) {
  const consent = global.pendingConsents?.[consentId];
  if (!consent) {
    throw new Error('Consent request not found');
  }

  consent.decision = decision; // 'approve' or 'reject'
  consent.decidedAt = Date.now();

  return consent;
}
