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

// Models available per provider — mirrors llm_factory.py PROVIDER_MODELS
const PROVIDER_MODELS = {
  groq: [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'llama3-8b-8192',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: [
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
  ],
  google: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  ollama: ['llama3.2', 'llama3.1', 'mistral', 'phi3'],
};

const DEFAULT_MODELS = {
  groq: 'llama-3.1-8b-instant',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  google: 'gemini-2.0-flash',
  ollama: 'llama3.2',
};

const KEY_SESSION_FIELDS = {
  groq: 'groq_api_key',
  openai: 'openai_api_key',
  anthropic: 'anthropic_api_key',
  google: 'google_api_key',
};

function getLangchainConfig(req) {
  return req.session.langchain_config || {};
}

function setLangchainConfig(req, updates) {
  req.session.langchain_config = Object.assign(getLangchainConfig(req), updates);
}

// GET /api/langchain/config/status
router.get('/config/status', (req, res) => {
  const cfg = getLangchainConfig(req);
  const provider = cfg.provider || 'groq';
  const model = cfg.model || DEFAULT_MODELS[provider] || '';

  const key_set = {
    groq: !!cfg.groq_api_key,
    openai: !!cfg.openai_api_key,
    anthropic: !!cfg.anthropic_api_key,
    google: !!cfg.google_api_key,
  };

  res.json({
    provider,
    model,
    key_set,
    provider_models: PROVIDER_MODELS,
    default_models: DEFAULT_MODELS,
  });
});

// POST /api/langchain/config
// Body: { provider, model, key_type, key }
router.post('/config', (req, res) => {
  const { provider, model, key_type, key } = req.body || {};

  if (provider && !PROVIDER_MODELS[provider]) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  const updates = {};

  if (provider) updates.provider = provider;
  if (model) updates.model = model;

  if (key_type && key) {
    const sessionField = KEY_SESSION_FIELDS[key_type];
    if (!sessionField) {
      return res.status(400).json({ error: `Unknown key_type: ${key_type}` });
    }
    // Validate key is non-empty string — keys themselves are never echoed back
    if (typeof key !== 'string' || key.trim().length === 0) {
      return res.status(400).json({ error: 'key must be a non-empty string' });
    }
    updates[sessionField] = key.trim();
  }

  setLangchainConfig(req, updates);

  const cfg = getLangchainConfig(req);
  const resolvedProvider = cfg.provider || 'groq';
  const key_set = {
    groq: !!cfg.groq_api_key,
    openai: !!cfg.openai_api_key,
    anthropic: !!cfg.anthropic_api_key,
    google: !!cfg.google_api_key,
  };

  // Never return key values
  res.json({ ok: true, provider: resolvedProvider, model: cfg.model || DEFAULT_MODELS[resolvedProvider], key_set });
});

// DELETE /api/langchain/config/key/:keyType
router.delete('/config/key/:keyType', (req, res) => {
  const { keyType } = req.params;
  const sessionField = KEY_SESSION_FIELDS[keyType];

  if (!sessionField) {
    return res.status(400).json({ error: `Unknown keyType: ${keyType}` });
  }

  const cfg = getLangchainConfig(req);
  delete cfg[sessionField];
  req.session.langchain_config = cfg;

  res.json({ ok: true, key_type: keyType, cleared: true });
});

module.exports = router;
