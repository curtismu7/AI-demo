/**
 * Banking Agent Routes
 * Endpoints for LangChain agent interaction with HITL consent gates
 * Per-request stateless agent initialization with session-persisted history
 */

import express from 'express';
import { agentSessionMiddleware } from '../middleware/agentSessionMiddleware.js';
import {
  storeConsentRequest,
  getConsentDecision,
  recordConsentDecision,
} from '../middleware/hitlGatewayMiddleware.js';
import { processAgentMessage } from '../services/bankingAgentLangChainService.js';

const router = express.Router();

/**
 * POST /api/banking-agent/init
 * Initialize agent for user session (simplified — no global executor needed)
 */
router.post('/init', agentSessionMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Agent ready',
      sessionId: req.sessionID,
    });
  } catch (error) {
    console.error('[agent/init] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/banking-agent/message
 * Send message to agent with HITL consent flow
 * Per-request agent initialization, session-persisted history
 */
router.post('/message', agentSessionMiddleware, async (req, res) => {
  try {
    const { message, consentId } = req.body;

    // Validate message
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    // If consentId provided: retrieve + validate consent decision before proceeding
    if (consentId) {
      const consent = await getConsentDecision(consentId);
      if (!consent.valid) {
        return res.status(428).json({ error: consent.error, consentId });
      }
      if (!consent.approved) {
        return res.json({
          success: true,
          reply: 'Operation cancelled by user.',
          tokenEvents: req.tokenEvents,
        });
      }
      req.consentApproved = true;
    }

    // Load session history (max 20 messages, [{role:'human'|'ai', content:string}])
    const sessionHistory = req.session.agentChatHistory || [];

    // Process through LangChain agent (re-initializes per request, restores history)
    const result = await processAgentMessage(
      message.trim(),
      req.agentContext,
      sessionHistory,
      req.tokenEvents
    );

    // Persist updated history to session
    req.session.agentChatHistory = result.updatedHistory;

    // If HITL interrupt was returned and not already approved: store consent request and return 428
    if (result.interrupt && !req.consentApproved) {
      const interruptData = result.interrupt.value ?? result.interrupt;
      const consentId = `consent_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await storeConsentRequest(consentId, {
        consentId,
        reason: 'High-value operation requires your approval',
        operation: interruptData,
        createdAt: new Date().toISOString(),
      });
      return res.status(428).json({
        hitl: true,
        consentId,
        reason: 'High-value operation requires your approval',
        operation: interruptData,
        message: 'This operation requires your confirmation. Please approve to continue.',
      });
    }

    res.json({
      success: true,
      reply: result.reply,
      tokenEvents: result.tokenEvents,
    });
  } catch (error) {
    console.error('[agent/message] Error:', error);
    res.status(500).json({ error: error.message || 'Agent processing failed' });
  }
});

/**
 * POST /api/banking-agent/consent
 * Record user consent decision + resume agent
 */
router.post('/consent', agentSessionMiddleware, async (req, res) => {
  try {
    const { consentId, decision } = req.body;

    if (!consentId || !decision) {
      return res.status(400).json({ error: 'consentId + decision required' });
    }

    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
    }

    const consent = await recordConsentDecision(consentId, decision);

    res.json({
      success: true,
      message: `Operation ${decision}ed`,
      decision: consent.decision,
    });
  } catch (error) {
    console.error('[agent/consent] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
