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
    const { userId, userToken } = req.session.agentContext || {};
    if (!userId || !userToken) {
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
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    const { userId, userToken, tokenEvents } = req.session.agentContext || {};
    if (!userId || !userToken) {
      return res.status(401).json({ error: 'Session expired', agentInitRequired: true });
    }

    // Check for pending consent decisions
    const consentDecision = await getConsentDecision(req.session.id);
    if (consentDecision?.decision === 'denied') {
      return res.status(403).json({ error: 'User denied consent', consentDenied: true });
    }

    // Process message with agent
    const response = await processAgentMessage({
      message,
      userId,
      userToken,
      sessionId: req.session.id,
      tokenEvents: tokenEvents || []
    });

    // Check if consent is required
    if (response.requiresConsent) {
      const consentId = Math.random().toString(36).substr(2, 9);
      await storeConsentRequest(req.session.id, {
        id: consentId,
        action: response.action,
        amount: response.amount,
        details: response.details
      });
      return res.status(428).json({ 
        requiresConsent: true,
        consentId,
        action: response.action,
        message: response.message 
      });
    }

    res.json(response);
  } catch (error) {
    console.error('Agent message error:', error);
    res.status(500).json({ error: error.message });
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
