// banking_api_server/routes/bankingAgentNl.js
/**
 * POST /api/banking-agent/nl — natural language → education or banking intent.
 * Session required. LLM priority: Groq (GROQ_API_KEY) → Gemini (GEMINI_API_KEY) → heuristic regex.
 */
'use strict';

const express = require('express');
const { parseNaturalLanguage } = require('../services/geminiNlIntent');

const router = express.Router();

router.post('/nl', async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'authentication_required', message: 'Sign in to use the agent.' });
  }
  const message = typeof req.body?.message === 'string' ? req.body.message : '';
  if (!message.trim()) {
    return res.status(400).json({ error: 'invalid_body', message: 'message is required' });
  }

  try {
    const { source, result } = await parseNaturalLanguage(message.trim());
    return res.json({ source, result });
  } catch (e) {
    console.error('[bankingAgentNl]', e);
    return res.status(500).json({ error: 'nl_parse_failed', message: e.message || 'Failed to parse message' });
  }
});

/** GET /api/banking-agent/nl/status — which LLM backends are configured (no secrets returned). */
router.get('/nl/status', (req, res) => {
  const groq = !!process.env.GROQ_API_KEY;
  const gemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
  const activeProvider = groq ? 'groq' : gemini ? 'gemini' : 'heuristic';
  return res.json({
    groqConfigured: groq,
    groqModel: groq ? (process.env.GROQ_MODEL || 'llama-3.1-8b-instant') : null,
    geminiConfigured: gemini,
    geminiModel: gemini ? (process.env.GEMINI_MODEL || 'gemini-1.5-flash') : null,
    activeProvider,
    heuristicAlwaysAvailable: true,
  });
});

module.exports = router;
