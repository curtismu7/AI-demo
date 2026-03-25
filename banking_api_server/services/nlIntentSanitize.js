// banking_api_server/services/nlIntentSanitize.js
/**
 * Validates LLM JSON so only real banking actions and education panels execute.
 * Unknown kinds/actions fall back to heuristic parsing (no fake commands).
 */
'use strict';

const { parseHeuristic } = require('./nlIntentParser');

const VALID_BANKING_ACTIONS = new Set([
  'accounts', 'transactions', 'balance', 'deposit', 'withdraw', 'transfer', 'logout', 'mcp_tools',
]);

const VALID_EDU_PANELS = new Set([
  'login-flow', 'token-exchange', 'may-act', 'mcp-protocol', 'introspection',
  'agent-gateway', 'rfc-index', 'step-up', 'pingone-authorize', 'cimd',
]);

/**
 * @param {object} result
 * @param {string} originalMessage
 * @returns {{ result: object, rejected: boolean, reason?: string }}
 */
function sanitizeNlResult(result, originalMessage) {
  if (!result || typeof result !== 'object' || !result.kind) {
    return { result: parseHeuristic(originalMessage), rejected: true, reason: 'missing_kind' };
  }

  const { kind } = result;

  if (kind === 'none') {
    if (typeof result.message !== 'string') {
      return { result: parseHeuristic(originalMessage), rejected: true, reason: 'none_invalid' };
    }
    return { result, rejected: false };
  }

  if (kind === 'education') {
    if (result.ciba === true) {
      return { result, rejected: false };
    }
    const panel = result.education?.panel;
    if (!panel || !VALID_EDU_PANELS.has(panel)) {
      const fallback = parseHeuristic(originalMessage);
      return { result: fallback, rejected: true, reason: 'invalid_education_panel' };
    }
    return { result, rejected: false };
  }

  if (kind === 'banking') {
    const action = result.banking?.action;
    if (!action || !VALID_BANKING_ACTIONS.has(action)) {
      const fallback = parseHeuristic(originalMessage);
      return { result: fallback, rejected: true, reason: 'invalid_banking_action' };
    }
    return { result, rejected: false };
  }

  return { result: parseHeuristic(originalMessage), rejected: true, reason: 'unknown_kind' };
}

module.exports = { sanitizeNlResult, VALID_BANKING_ACTIONS, VALID_EDU_PANELS };
