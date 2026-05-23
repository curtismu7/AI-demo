// banking_api_server/routes/bankingAgentNl.js
/**
 * POST /api/banking-agent/nl — natural language → education or banking intent.
 * Authenticated users get role context. Anonymous calls are allowed (marketing agent UX):
 * the SPA routes education + NL hints without PingOne; banking execution still requires sign-in client-side.
 * LLM: heuristic first, then Ollama (local) for unrecognized input.
 */
'use strict';

const express = require('express');
const { parseNaturalLanguage } = require('../services/geminiNlIntent');

const router = express.Router();

router.post('/nl', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message : '';
  const provider = typeof req.body?.provider === 'string' ? req.body.provider : 'auto';

  if (!message.trim()) {
    return res.status(400).json({ error: 'invalid_body', message: 'message is required' });
  }

  try {
    const u = req.session?.user;
    const context = u
      ? { role: u.role, firstName: u.firstName }
      : { anonymous: true };

    // Pass langchain_config so NL routing can respect configured LLM provider (Helix, etc.)
    const langchainConfig = req.session?.langchain_config || {};

    const { source, result, llm_attempted, llm_not_configured } = await parseNaturalLanguage(message.trim(), context, provider, langchainConfig);
    return res.json({ source, result, llm_attempted, llm_not_configured });
  } catch (e) {
    console.error('[bankingAgentNl]', e);
    return res.status(500).json({ error: 'nl_parse_failed', message: e.message || 'Failed to parse message' });
  }
});

/** GET /api/banking-agent/nl/status — which LLM backends are configured.
 * IN-02: OLLAMA_BASE_URL / OLLAMA_MODEL can reveal internal network topology
 * (e.g. http://10.0.0.5:11434) on a hosted/tenant deploy. The SPA only needs
 * to know the provider is configured (BankingAgent.js reads nlMeta for
 * groqConfigured, never ollamaBaseUrl). So: anonymous callers get a redacted
 * response (no host, no exact model); authenticated callers still get the
 * full detail for the Config/diagnostics surfaces. */
router.get('/nl/status', (req, res) => {
  const configStore = require('../services/configStore');
  const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';
  const isAuthed = Boolean(req.session?.user);

  // Resolve which LLM provider is actually configured.
  // helix_api_key uses the file-based loader (LLM2.json) as fallback.
  const helixApiKey = configStore.getEffective('helix_api_key') || '';
  const helixBaseUrl = configStore.getEffective('helix_base_url') || '';
  const helixConfigured = !!(helixApiKey && helixBaseUrl);

  const ollamaConfigured = !!(process.env.OLLAMA_BASE_URL);

  // Determine active LLM provider: helix wins if configured, then ollama, then none.
  const activeLlmProvider = helixConfigured ? 'helix' : ollamaConfigured ? 'ollama' : null;

  const base = {
    activeLlmProvider,
    helixConfigured,
    ollamaConfigured,
    heuristicAlwaysAvailable: true,
  };

  if (!isAuthed) return res.json(base);

  return res.json({
    ...base,
    ollamaBaseUrl: ollamaBase,
    ollamaModel,
    helixAgentId: configStore.getEffective('helix_agent_id') || '',
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
