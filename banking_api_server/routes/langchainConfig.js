/**
 * LangChain configuration routes.
 *
 * Stores API keys in the server-side session only — keys are NEVER returned
 * to the browser in responses.
 *
 * Routes:
 *   GET  /api/langchain/config/status   — current provider, model, key_set flags
 *   POST /api/langchain/config          — save provider/model/key to session
 *   DELETE /api/langchain/config/key/:keyType — clear a key from session
 */
const express = require('express');

const router = express.Router();

// Models available per provider
const PROVIDER_MODELS = {
  ollama:    ['llama3.2', 'llama3.1', 'gemma4:e4b', 'mistral', 'phi3', 'qwen2.5'],
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-3-5-haiku-20241022'],
  groq:      ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  google:    ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
};

const DEFAULT_MODELS = {
  ollama:    'llama3.2',
  openai:    'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  groq:      'llama-3.1-8b-instant',
  google:    'gemini-2.0-flash',
};

const KEY_SESSION_FIELDS = {};

function getLangchainConfig(req) {
  return req.session.langchain_config || {};
}

function setLangchainConfig(req, updates) {
  req.session.langchain_config = Object.assign(getLangchainConfig(req), updates);
}

// GET /api/langchain/config/status
router.get('/config/status', (req, res) => {
  const cfg = getLangchainConfig(req);
  const provider = 'ollama';
  const model = cfg.model || DEFAULT_MODELS.ollama;

  res.json({
    provider,
    model,
    key_set: { ollama: true },
    provider_models: PROVIDER_MODELS,
    default_models: DEFAULT_MODELS,
  });
});

// POST /api/langchain/config
// Body: { model }
router.post('/config', (req, res) => {
  const { model } = req.body || {};

  const updates = { provider: 'ollama' };
  if (model) updates.model = model;

  setLangchainConfig(req, updates);

  const cfg = getLangchainConfig(req);
  res.json({ ok: true, provider: 'ollama', model: cfg.model || DEFAULT_MODELS.ollama, key_set: { ollama: true } });
});

// DELETE /api/langchain/config/key/:keyType — no-op (Ollama has no keys)
router.delete('/config/key/:keyType', (req, res) => {
  res.json({ ok: true, key_type: req.params.keyType, cleared: true });
});

module.exports = router;

// GET /api/langchain/provider/:providerName/status
// Returns: { provider, status, reason, configured: boolean }
// Status: 'available' | 'unconfigured' | 'unreachable'
// NOTE: Async health check runs server-side; client sees result synchronously
router.get('/provider/:providerName/status', async (req, res) => {
  const { providerName } = req.params;
  
  // Validate provider
  if (!PROVIDER_MODELS[providerName]) {
    return res.status(400).json({ error: `Unknown provider: ${providerName}` });
  }

  try {
    const { getProviderStatus } = require('../services/llmProviderStatus');
    const cfg = getLangchainConfig(req);
    
    const statusData = await getProviderStatus(providerName, cfg);
    
    res.json({
      provider: providerName,
      status: statusData.status,
      reason: statusData.reason,
      configured: statusData.hasKey,
    });
  } catch (error) {
    console.error(`[langchainConfig] Provider status check failed for ${providerName}:`, error.message);
    res.status(500).json({
      provider: providerName,
      status: 'unreachable',
      reason: `Status check error: ${error.message}`,
      configured: false,
    });
  }
});
