/**
 * Agent Invoke Route
 * POST /api/agent/invoke — unified agent entry point with intent authorization
 *
 * Flow:
 * 1. UI calls /api/agent/invoke with { prompt }
 * 2. Route calls processAgentMessage() to get agent response
 * 3. Response includes intent + confidence extracted from reasoning/heuristic
 * 4. Route calls /api/authorize-intent to check if intent is authorized
 * 5. If authorized & no consent needed: return response
 * 6. If authorized & consent needed: return 428 (HITL)
 * 7. If not authorized: return 403 (Forbidden)
 */

const express = require('express');
const { processAgentMessage } = require('../services/demoAgentLangGraphService');
const { evaluateIntentAuthorization } = require('../services/intentAuthService');
const { requireSession } = require('../middleware/auth');
const configStore = require('../services/configStore');

const router = express.Router();

/**
 * Extract intent and confidence from agent response.
 * For now, we extract intent from toolsCalled[0] and use a default confidence.
 * In the future, the agent will return intent + confidence directly.
 */
function extractIntentFromResponse(response) {
  const toolName = response.toolsCalled?.[0];
  // Map tool names to intent labels
  const toolToIntent = {
    get_accounts: 'view_accounts',
    get_balance: 'view_balance',
    get_transactions: 'view_transactions',
    create_transfer: 'transfer',
    create_deposit: 'deposit',
    create_withdrawal: 'withdraw',
    get_sensitive_account_details: 'view_sensitive_account',
  };

  const intent = toolToIntent[toolName] || toolName || 'unknown';
  // Default high confidence for heuristic-matched actions (will be enhanced when agent returns it)
  const confidence = response.agentPath === 'heuristic' ? 0.95 : 0.7;

  return { intent, confidence };
}

/**
 * POST /api/agent/invoke
 * Process a user prompt through the agent with intent-based authorization
 *
 * Request body:
 *   { prompt: string }
 *
 * Response:
 *   (same as /api/banking-agent/message)
 */
router.post('/agent/invoke', requireSession, express.json(), async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required and must be a string' });
    }

    console.log('[agentInvokeRoute] Processing prompt');

    // Step 1: Call the agent
    const agentResponse = await processAgentMessage({
      message: prompt,
      userId: req.user?.sub,
      userToken: req.session?.oauthTokens?.accessToken,
      sessionId: req.session.id,
      tokenEvents: req.tokenEvents || [],
      langchainConfig: req.session?.langchain_config || {},
      req,
    });

    console.log('[agentInvokeRoute] Agent response received, toolsCalled:', agentResponse.toolsCalled);

    // Step 2: Extract intent from response (always extract, but only use if flag enabled)
    const { intent, confidence } = extractIntentFromResponse(agentResponse);
    agentResponse.intent = intent;
    agentResponse.confidence = confidence;

    console.log('[agentInvokeRoute] Extracted intent:', { intent, confidence });

    // Step 3: Check intent authorization only if feature is enabled
    const intentAuthorizationEnabled = configStore.getEffective('ff_intent_authorization_enabled') === 'true';

    if (intentAuthorizationEnabled && agentResponse.toolsCalled && agentResponse.toolsCalled.length > 0) {
      console.log('[agentInvokeRoute] Intent authorization enabled, evaluating intent');
      const intentDecision = await evaluateIntentAuthorization({
        intent,
        confidence,
        amount: agentResponse.transactionAmount,
        toolName: agentResponse.toolsCalled[0],
      });

      console.log('[agentInvokeRoute] Intent decision:', intentDecision);

      // If intent requires consent, return 428
      if (intentDecision.requires_consent) {
        console.log('[agentInvokeRoute] Intent requires consent, returning 428');
        return res.status(428).json({
          ...agentResponse,
          requiresConsent: true,
          intentAuthDecision: intentDecision,
        });
      }

      // If intent is not authorized, return 403
      if (!intentDecision.authorized) {
        console.log('[agentInvokeRoute] Intent not authorized, returning 403');
        return res.status(403).json({
          error: 'intent_not_authorized',
          message: intentDecision.reason,
          intent,
          confidence,
        });
      }

      // Intent is authorized, proceed with response
      console.log('[agentInvokeRoute] Intent authorized');
    } else if (!intentAuthorizationEnabled) {
      console.log('[agentInvokeRoute] Intent authorization disabled via ff_intent_authorization_enabled');
    }

    // Step 4: Return agent response
    return res.json(agentResponse);
  } catch (error) {
    console.error('[agentInvokeRoute] Error:', error.message);
    res.status(500).json({ error: 'Agent invocation failed', message: error.message });
  }
});

module.exports = router;
