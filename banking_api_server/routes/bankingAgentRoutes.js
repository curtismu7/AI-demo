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
const { processAgentMessage } = require('../services/bankingAgentLangChainService');

const router = express.Router();
router.use(agentSessionMiddleware);

// POST /init - Initialize agent session
router.post('/init', async (req, res) => {
  try {
    const { userId, accessToken } = req.agentContext || {};
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'Session expired', agentInitRequired: true });
    }
    res.json({ 
      sessionId: req.session.id, 
      initialized: true,
      agentReady: true 
    });
  } catch (error) {
    console.error('Agent init error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /message - Process agent message
router.post('/message', async (req, res) => {
  try {
    console.log('[banking-agent/message] Incoming request');
    console.log('[banking-agent/message] Session ID:', req.session?.id);
    console.log('[banking-agent/message] Session exists:', !!req.session);
    console.log('[banking-agent/message] Request body keys:', Object.keys(req.body || {}));
    console.log('[banking-agent/message] Message present:', !!req.body?.message);

    const { message } = req.body;
    if (!message) {
      console.log('[banking-agent/message] ERROR: Message required');
      return res.status(400).json({ error: 'Message required' });
    }

    console.log('[banking-agent/message] Message length:', message.length);
    console.log('[banking-agent/message] agentContext present:', !!req.agentContext);
    console.log('[banking-agent/message] agentContext keys:', req.agentContext ? Object.keys(req.agentContext) : 'none');

    const { userId, accessToken, tokenEvents } = req.agentContext || {};
    console.log('[banking-agent/message] userId:', userId);
    console.log('[banking-agent/message] accessToken present:', !!accessToken);
    console.log('[banking-agent/message] tokenEvents count:', tokenEvents?.length || 0);

    if (!userId || !accessToken) {
      console.log('[banking-agent/message] ERROR: Session expired - userId:', userId, 'accessToken present:', !!accessToken);
      return res.status(401).json({ error: 'Session expired', agentInitRequired: true });
    }

    // Check for pending consent decisions
    console.log('[banking-agent/message] Checking consent decision...');
    const consentDecision = await getConsentDecision(req.session.id);
    console.log('[banking-agent/message] Consent decision:', consentDecision);
    if (consentDecision?.decision === 'denied') {
      console.log('[banking-agent/message] Consent denied');
      return res.status(403).json({ error: 'User denied consent', consentDenied: true });
    }

    // Process message with agent
    console.log('[banking-agent/message] Calling processAgentMessage...');
    const response = await processAgentMessage({
      message,
      userId,
      userToken: accessToken,
      sessionId: req.session.id,
      tokenEvents: tokenEvents || []
    });
    console.log('[banking-agent/message] processAgentMessage response received');
    console.log('[banking-agent/message] Response keys:', Object.keys(response || {}));
    console.log('[banking-agent/message] requiresConsent:', response?.requiresConsent);

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
        message: response.message
      });
    }

    console.log('[banking-agent/message] Sending successful response');
    res.json(response);
  } catch (error) {
    console.error('[banking-agent/message] ERROR: Agent message error');
    console.error('[banking-agent/message] Error name:', error.name);
    console.error('[banking-agent/message] Error message:', error.message);
    console.error('[banking-agent/message] Error stack:', error.stack);
    console.error('[banking-agent/message] Error code:', error.code);
    console.error('[banking-agent/message] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    // Always return a meaningful error message to the user
    const errorMessage = error.message || 'An unexpected error occurred while processing your request. Please try again.';
    res.status(500).json({ error: errorMessage });
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
