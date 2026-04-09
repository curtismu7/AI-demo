/**
 * Banking Agent Routes
 * Endpoints for LangChain agent interaction with HITL consent gates
 */

import express from 'express';
import { agentSessionMiddleware } from '../middleware/agentSessionMiddleware.js';
import {
  hitlGatewayMiddleware,
  evaluateToolCall,
  storeConsentRequest,
  getConsentDecision,
  recordConsentDecision,
} from '../middleware/hitlGatewayMiddleware.js';
import {
  initializeBankingAgent,
  processBankingAgentMessageWithAuth,
} from '../services/bankingAgentLangChainService.js';

const router = express.Router();

// Global agent executor (initialized once per session)
let bankingAgent = null;

/**
 * POST /api/banking-agent/init
 * Initialize agent executor for user session (called once on app load)
 */
router.post('/init', agentSessionMiddleware, async (req, res) => {
  try {
    // Initialize LangChain agent (reuse if already initialized)
    if (!bankingAgent || !bankingAgent.agent) {
      bankingAgent = await initializeBankingAgent();
    }

    res.json({
      success: true,
      message: 'Agent initialized',
      sessionId: req.sessionID,
    });
  } catch (error) {
    console.error('[agent/init] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/banking-agent/message
 * Send message to agent + handle HITL flow
 */
router.post('/message', agentSessionMiddleware, hitlGatewayMiddleware, async (req, res) => {
  try {
    const { message, consentId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    if (!bankingAgent) {
      bankingAgent = await initializeBankingAgent();
    }

    // If consentId provided: retrieve + validate consent decision
    if (consentId) {
      const consent = await getConsentDecision(consentId);
      if (!consent.valid) {
        return res.status(428).json({ error: consent.error, consentId });
      }

      if (!consent.approved) {
        return res.json({
          success: true,
          message: 'Operation cancelled by user',
          tokenEvents: req.tokenEvents,
        });
      }
      // Continue with approved flag in request
      req.consentApproved = true;
    }

    // Process message through agent with auth context
    const response = await processBankingAgentMessageWithAuth(
      message,
      bankingAgent,
      req.user.sub,
      req.agentContext,
      req.tokenEvents
    );

    // Check if response contains tool call requiring HITL
    // (Simplified: actual implementation checks agent intermediate steps)
    if (response.requiresConsent && !req.consentApproved) {
      const hitl = response.requiresConsent;
      // Store consent request + return 428
      await storeConsentRequest(hitl.consentId, hitl);
      return res.status(428).json({
        hitl: true,
        consentId: hitl.consentId,
        reason: hitl.reason,
        operation: hitl.operation,
        message: `${hitl.reason}. Please confirm to continue.`,
      });
    }

    res.json({
      success: response.success,
      message: response.message,
      error: response.error,
      tokenEvents: response.tokenEvents,
    });
  } catch (error) {
    console.error('[agent/message] Error:', error);
    res.status(500).json({ error: error.message });
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
