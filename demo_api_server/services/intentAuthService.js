/**
 * Intent-based Authorization Service
 * Authorizes user intents based on confidence scores and transaction amounts
 * Returns permit/deny decisions for the authorization server
 */

const configStore = require('./configStore');

/**
 * Evaluate whether an intent is authorized based on confidence and amount
 * @param {object} intentContext - { intent, confidence, amount (optional), toolName (optional) }
 * @returns {object} { authorized: boolean, requires_consent: boolean, reason: string }
 */
async function evaluateIntentAuthorization(intentContext) {
  const { intent, confidence, amount } = intentContext;

  if (!intent || typeof confidence !== 'number') {
    return {
      authorized: false,
      requires_consent: false,
      reason: 'Intent and confidence are required'
    };
  }

  const minConfidence = parseFloat(configStore.getEffective('intent_min_confidence')) || 0.7;
  const requiresConsentList = (configStore.getEffective('intent_requires_consent') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const maxAmountLowConfidence = parseFloat(configStore.getEffective('intent_max_amount_low_confidence')) || 100;

  // Check: confidence too low
  if (confidence < minConfidence) {
    // If this is a high-amount transfer with low confidence, block it
    if (amount && amount > maxAmountLowConfidence) {
      return {
        authorized: false,
        requires_consent: false,
        reason: `Confidence ${confidence.toFixed(2)} is below minimum ${minConfidence.toFixed(2)}. Cannot authorize transfer > $${maxAmountLowConfidence} with low confidence.`
      };
    }
    // For amounts below threshold, allow but may require consent
    if (requiresConsentList.includes(intent)) {
      return {
        authorized: true,
        requires_consent: true,
        reason: `Intent '${intent}' requires HITL consent. Confidence: ${confidence.toFixed(2)}`
      };
    }
  }

  // Check: intent requires consent regardless of confidence
  if (requiresConsentList.includes(intent)) {
    return {
      authorized: true,
      requires_consent: true,
      reason: `Intent '${intent}' requires HITL consent`
    };
  }

  // Authorized
  return {
    authorized: true,
    requires_consent: false,
    reason: `Intent '${intent}' authorized with confidence ${confidence.toFixed(2)}`
  };
}

module.exports = {
  evaluateIntentAuthorization,
};
