// banking_api_server/routes/bankingAgentNl.js
/**
 * POST /api/banking-agent/nl — natural language → education or banking intent.
 * Authenticated users get role context. Anonymous calls are allowed (marketing agent UX):
 * the SPA routes education + NL hints without PingOne; banking execution still requires sign-in client-side.
 * LLM priority: Groq (GROQ_API_KEY) → Gemini (GEMINI_API_KEY) → heuristic regex.
 */
'use strict';

const express = require('express');
const { parseNaturalLanguage } = require('../services/geminiNlIntent');

const router = express.Router();

router.post('/nl', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message : '';
  if (!message.trim()) {
    return res.status(400).json({ error: 'invalid_body', message: 'message is required' });
  }

  try {
    const u = req.session?.user;
    const context = u
      ? { role: u.role, firstName: u.firstName }
      : { anonymous: true };
    const { source, result } = await parseNaturalLanguage(message.trim(), context);
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

/** GET /api/banking-agent/search?q=... — BFF-side web search via Brave Search API.
 * The BRAVE_SEARCH_API_KEY never leaves the server. */
router.get('/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) {
    return res.status(400).json({ ok: false, error: 'query_required', message: 'q parameter is required' });
  }
  const braveSearchService = require('../services/braveSearchService');
  try {
    const result = await braveSearchService.search(query);
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err.code === 'BRAVE_NOT_CONFIGURED') {
      return res.status(503).json({ ok: false, error: err.code, message: err.message });
    }
    console.error('[bankingAgentNl] search error:', err);
    return res.status(500).json({ ok: false, error: 'search_failed', message: 'Search request failed' });
  }
});

module.exports = router;
