/**
 * Banking Agent Routes
 * Endpoints for LangChain agent interaction with HITL consent gates
 * Per-request stateless agent initialization with session-persisted history
 */

const express = require('express');
const { agentSessionMiddleware } = require('../middleware/agentSessionMiddleware');
const {
  storeConsentRequest,
  getConsentDecision,
  recordConsentDecision,
} = require('../middleware/hitlGatewayMiddleware');
const { processAgentMessage } = require('../services/bankingAgentLangGraphService');
const appEventService = require('../services/appEventService');
const { trackTokenEvent } = require('../services/tokenChainService');

const router = express.Router();
router.use(agentSessionMiddleware);

// POST /init - Initialize agent session
// i4ai-ref-arch.mmd steps 1–10: Chatbot → Agent → CC token + tools/list
router.post('/init', async (req, res) => {
  try {
    const { userId, accessToken } = req.agentContext || {};
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'Session expired', agentInitRequired: true, need_auth: true });
    }

    console.log('[banking-agent/init] User authenticated, requesting agent CC token');

    // Step 3–4: Obtain agent CC token from PingOne
    const agentCCTokenService = require('../services/agentCCTokenService');
    let ccTokenResult;
    try {
      ccTokenResult = await agentCCTokenService.getAgentCCToken(req);
    } catch (ccError) {
      console.error('[banking-agent/init] CC token failed:', ccError.code, ccError.message);
      const httpStatus = ccError.httpStatus || 503;
      return res.status(httpStatus).json({
        error: ccError.code || 'agent_cc_token_failed',
        message: ccError.message,
        initialized: false,
        agentConfigured: false,
        agentReady: false,
      });
    }

    console.log('[banking-agent/init] Agent CC token obtained, requesting tools/list from gateway');

    // Step 5–10: Request available tools from Agent Gateway
    // Gateway will call Ping Authorize for policy evaluation
    const agentGatewayClient = require('../services/agentGatewayClient');
    let toolsResult;
    try {
      toolsResult = await agentGatewayClient.getAvailableTools(req, ccTokenResult.access_token);
    } catch (toolsError) {
      console.error('[banking-agent/init] Tools list failed:', toolsError.code, toolsError.message);

      // If gateway is unreachable and not configured, fallback to local catalog
      if (toolsError.code === 'tools_list_failed' && toolsError.message.includes('ECONNREFUSED')) {
        console.log('[banking-agent/init] Agent Gateway unreachable, using local tools catalog');
        toolsResult = {
          tools: agentGatewayClient.getLocalToolsCatalog(),
          tokenEvents: [],
        };
        if (req?.recordTokenEvent) {
          req.recordTokenEvent('tools_list_fallback', {
            reason: 'gateway_unreachable',
            toolCount: toolsResult.tools.length,
          });
        }
      } else {
        // Authorization failure (403) or other fatal errors
        const httpStatus = toolsError.httpStatus || 502;
        return res.status(httpStatus).json({
          error: toolsError.code || 'tools_list_failed',
          message: toolsError.message,
          initialized: true, // User session is valid
          agentConfigured: false, // But agent can't fetch tools
          agentReady: false,
          tokenEvents: toolsError.tokenEvents || (req.tokenEvents || []),
        });
      }
    }

    console.log('[banking-agent/init] Agent init complete, returning tools');

    // Merge all token events from CC token + tools/list requests
    const allTokenEvents = [
      ...(req.tokenEvents || []),
      ...(toolsResult.tokenEvents || []),
    ];

    // Success: Return initialized agent with available tools
    res.json({
      sessionId: req.session.id,
      initialized: true,
      agentReady: true,
      agentConfigured: true,
      availableTools: toolsResult.tools || [],
      tokenEvents: allTokenEvents,
    });
  } catch (error) {
    console.error('[banking-agent/init] Unexpected error:', error.code || 'unknown', error.message);
    res.status(500).json({
      error: error.code || 'agent_init_error',
      message: error.message,
      initialized: false,
      agentConfigured: false,
      agentReady: false,
    });
  }
});

// POST /message - Process agent message
router.post('/message', async (req, res) => {
  try {
    console.log('[banking-agent/message] Incoming request');
    appEventService.logEvent('agent', 'info', 'Agent request received', { tag: 'agent/route' });
    console.log('[banking-agent/message] Session ID:', req.session?.id);
    console.log('[banking-agent/message] Session exists:', !!req.session);
    console.log('[banking-agent/message] Request body keys:', Object.keys(req.body || {}));
    console.log('[banking-agent/message] Message present:', !!req.body?.message);

    const { message } = req.body;
    if (!message) {
      console.log('[banking-agent/message] ERROR: Message required');
      return res.status(400).json({ error: 'Message required' });
    }

    console.log('[banking-agent/message] Message length:', message?.length || 0);
    console.log('[banking-agent/message] Message preview:', message?.substring(0, 100));
    console.log('[banking-agent/message] agentContext present:', !!req.agentContext);
    console.log('[banking-agent/message] agentContext keys:', req.agentContext ? Object.keys(req.agentContext) : 'none');

    const { userId, accessToken, tokenEvents } = req.agentContext || {};
    console.log('[banking-agent/message] userId:', userId);
    console.log('[banking-agent/message] accessToken present:', !!accessToken);
    console.log('[banking-agent/message] accessToken length:', accessToken?.length || 0);
    console.log('[banking-agent/message] tokenEvents count:', tokenEvents?.length || 0);

    if (!userId || !accessToken) {
      console.error('[banking-agent/message] ERROR: Session expired - userId:', userId, 'accessToken present:', !!accessToken);
      return res.status(401).json({ error: 'Session expired', agentInitRequired: true, need_auth: true });
    }

    // Check for pending consent decisions
    console.log('[banking-agent/message] Checking consent decision...');
    const consentDecision = await getConsentDecision(req.session.id);
    console.log('[banking-agent/message] Consent decision:', consentDecision);
    if (consentDecision?.decision === 'denied') {
      console.log('[banking-agent/message] Consent denied');
      return res.status(403).json({ error: 'User denied consent', consentDenied: true });
    }

    // Chatbot is dumb: just forward prompt to agent
    // Agent (with LLM) decides which tools to use, handles authorization, token exchange

    // Process message with agent (normal flow)
    console.log('[banking-agent/message] Calling processAgentMessage...');
    const langchainConfig = req.session?.langchain_config || {};
    const response = await processAgentMessage({
      message,
      userId,
      userToken: accessToken,
      sessionId: req.session.id,
      tokenEvents: tokenEvents || [],
      langchainConfig,
      req,
    });
    console.log('[banking-agent/message] processAgentMessage response received');
    console.log('[banking-agent/message] Response keys:', Object.keys(response || {}));
    console.log('[banking-agent/message] success:', response?.success);
    console.log('[banking-agent/message] requiresConsent:', response?.requiresConsent);
    console.log('[banking-agent/message] agentConfigured:', response?.agentConfigured);
    console.log('[banking-agent/message] tokenEvents count:', response?.tokenEvents?.length || 0);
    console.log('[banking-agent/message] error present:', !!response?.error);
    if (response?.error) {
      console.error('[banking-agent/message] Response error:', response.error);
    }

    // Include token events in the response
    if (response?.tokenEvents && response.tokenEvents.length > 0) {
      console.log('[banking-agent/message] Including token events in response');
    }

    // Check if consent is required
    if (response.requiresConsent) {
      console.log('[banking-agent/message] Consent required, storing request...');
      const consentId = Math.random().toString(36).substr(2, 9);
      await storeConsentRequest(req.session.id, {
        id: consentId,
        action: response.action,
        amount: response.amount,
        details: response.details
      });
      console.log('[banking-agent/message] Consent request stored, consentId:', consentId);
      return res.status(428).json({
        requiresConsent: true,
        consentId,
        action: response.action,
        message: response.message,
        tokenEvents: response.tokenEvents || []
      });
    }

    // ── Token chain events for NL path ──────────────────────────────────────
    // The heuristic/LangGraph service executes tools locally (via dataStore) and
    // returns tokenEvents: []. To keep the Token Chain panel updated on the NL path
    // (just like the chip/action → POST /api/mcp/tool path), resolve token events
    // from the session when the agent called any tool.
    let resolvedTokenEvents = response.tokenEvents || [];
    if (resolvedTokenEvents.length === 0 && response.toolsCalled?.length > 0) {
      try {
        const { resolveMcpAccessTokenWithEvents } = require('../services/agentMcpTokenService');
        const toolName = response.toolsCalled[0];
        const resolved = await resolveMcpAccessTokenWithEvents(req, toolName);
        resolvedTokenEvents = resolved.tokenEvents || [];
        console.log('[banking-agent/message] Generated %d token events for NL tool call (%s)',
          resolvedTokenEvents.length, toolName);
      } catch (tokenErr) {
        // Exchange may fail (unconfigured, scope mismatch, etc.) — use whatever events were
        // collected before the error. Fall back to session preview if nothing available.
        resolvedTokenEvents = tokenErr.tokenEvents || [];
        if (resolvedTokenEvents.length === 0) {
          try {
            const { buildSessionPreviewTokenEvents } = require('../services/agentMcpTokenService');
            resolvedTokenEvents = buildSessionPreviewTokenEvents(req).tokenEvents || [];
          } catch (_) { /* non-fatal */ }
        }
        console.log('[banking-agent/message] Token event generation failed (%s), using %d fallback events',
          tokenErr.code || tokenErr.message, resolvedTokenEvents.length);
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // Persist token events to token chain service for /api/token-chain monitoring
    if (resolvedTokenEvents && resolvedTokenEvents.length > 0 && userId) {
      try {
        for (const event of resolvedTokenEvents) {
          await trackTokenEvent({
            eventType: event.status || 'exchange',
            token: '', // We don't have the raw token here, just the metadata
            description: `${event.label}: ${event.explanation || ''}`,
            userId: userId,
            additionalData: {
              tokenLabel: event.label,
              status: event.status,
              claims: event.claims,
              tokenType: event.claims?.aud ? 'mcp_token' : 'user_token'
            }
          });
        }
        console.log('[banking-agent/message] Persisted %d token events to chain service', resolvedTokenEvents.length);
      } catch (trackErr) {
        // Non-fatal: if tracking fails, still return the response
        console.error('[banking-agent/message] Failed to track token events:', trackErr.message);
      }
    }

    console.log('[banking-agent/message] Returning agent response');
    appEventService.logEvent('agent', 'info', 'Agent response sent', { tag: 'agent/route' });
    const responseBody = {
      reply: response.reply,
      success: response.success,
      toolsCalled: response.toolsCalled,
      tokensUsed: response.tokensUsed,
      requiresConsent: response.requiresConsent,
      agentConfigured: response.agentConfigured,
      error: response.error,
      tokenEvents: resolvedTokenEvents
    };

    // Include account data if present (for account details panel display)
    if (response.accountData) {
      responseBody.accountData = response.accountData;
    }
    // Forward HITL signal so the frontend can show the consent modal (Phase 2 shape)
    if (response.error === 'hitl_required' || response.hitl_required) {
      responseBody.error = 'hitl_required';
      responseBody.hitl = { type: response.hitl?.type ?? 'consent' };
      responseBody.hitl_threshold_usd = response.hitl_threshold_usd ?? 0;
    }
    // Include structured list data so client NL handler can infer panel type
    if (response.accounts)              responseBody.accounts      = response.accounts;
    if (response.transactions)          responseBody.transactions  = response.transactions;
    if (response.balance !== undefined) responseBody.balance       = response.balance;

    return res.json(responseBody);
  } catch (error) {
    console.error('[banking-agent/message] ERROR: Agent message error');
    console.error('[banking-agent/message] Error name:', error.name);
    console.error('[banking-agent/message] Error message:', error.message);
    console.error('[banking-agent/message] Error stack:', error.stack);
    console.error('[banking-agent/message] Error code:', error.code);
    console.error('[banking-agent/message] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    // D-03: Structured recovery responses — agent threw a typed recovery error
    if (error.name === 'LoginRequiredError') {
      const rawScopes = Array.isArray(error.requiredScopes) ? error.requiredScopes : [];
      const validScope = /^[a-z][a-z0-9:_-]*$/;
      const requiredScopes = rawScopes.filter(s => typeof s === 'string' && validScope.test(s));
      return res.status(401).json({ error: 'login_required', requiredScopes });
    }
    if (error.name === 'HitlRequiredError') {
      return res.status(403).json({
        error: 'hitl_required',
        challengeId: typeof error.challengeId === 'string' ? error.challengeId : '',
        challengeType: error.challengeType === 'step_up' ? 'step_up' : 'consent',
        expiresAt: typeof error.expiresAt === 'string' ? error.expiresAt : ''
      });
    }
    if (error.name === 'ScopeRequiredError') {
      const rawScopes = Array.isArray(error.requiredScopes) ? error.requiredScopes : [];
      const validScope = /^[a-z][a-z0-9:_-]*$/;
      const requiredScopes = rawScopes.filter(s => typeof s === 'string' && validScope.test(s));
      return res.status(403).json({ error: 'scope_required', requiredScopes });
    }
        // TOKEN_INACTIVE — user's PingOne session expired; signal UI to re-authenticate
    if (error.code === 'TOKEN_INACTIVE') {
      return res.status(401).json({ error: 'Session expired', need_auth: true, agentInitRequired: true });
    }
    // Always return a meaningful error message to the user
    const errorMessage = error.message || 'An unexpected error occurred while processing your request. Please try again.';
    const source = error.source || 'bankingAgentRoutes';
    console.error(`[bankingAgentRoutes] 500 — source=${source} code=${error.code || 'none'}: ${error.message}`);
    res.status(500).json({ error: errorMessage, source });
  }
});

// POST /consent - Record user consent decision
router.post('/consent', async (req, res) => {
  try {
    const { consentId, approved } = req.body;
    if (!consentId || approved === undefined) {
      return res.status(400).json({ error: 'consentId and approved required' });
    }

    await recordConsentDecision(req.session.id, consentId, approved);
    res.json({ recorded: true, approved });
  } catch (error) {
    console.error('Consent recording error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
