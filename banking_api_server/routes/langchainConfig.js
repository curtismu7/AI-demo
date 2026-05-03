/**
 * LangChain configuration routes.
 *
 * Persists configuration to SQLite (configStore) so credentials survive server/browser restarts.
 * helix_api_key is encrypted at rest; other fields stored plaintext.
 *
 * Routes:
 *   GET  /api/langchain/config/status   — current provider, model, key_set flags
 *   POST /api/langchain/config          — save provider/model/key to session + SQLite
 *   DELETE /api/langchain/config/key/:keyType — clear a key from session + SQLite
 */
const express = require('express');
const configStore = require('../services/configStore');
const path = require('node:path');
const fs = require('node:fs');

const router = express.Router();

// Models available per provider
const PROVIDER_MODELS = {
  ollama:    ['llama3.2', 'llama3.1', 'gemma4:e4b', 'mistral', 'phi3', 'qwen2.5'],
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-3-5-haiku-20241022'],
  groq:      ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  google:    ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  helix:     ['gpt-4o', 'gpt-4o-mini', 'gemini-1.5-pro', 'claude-3-5-sonnet'],
};

const DEFAULT_MODELS = {
  ollama:    'mistral',
  openai:    'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  groq:      'llama-3.1-8b-instant',
  google:    'gemini-2.0-flash',
  helix:     'gpt-4o-mini',
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
  const provider = cfg.provider || 'ollama';
  const model = cfg.model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.ollama;

  // Load Helix credentials from SQLite if not in session (e.g., after tab switch)
  let helix_base_url = cfg.helix_base_url || configStore.get('helix_base_url') || '';
  let helix_api_key = cfg.helix_api_key || configStore.get('helix_api_key') || '';
  let helix_environment_id = cfg.helix_environment_id || configStore.get('helix_environment_id') || '';
  let helix_agent_id = cfg.helix_agent_id || configStore.get('helix_agent_id') || '';

  // If we loaded from SQLite, update the session so it's available for this session
  if ((helix_base_url || helix_api_key || helix_environment_id || helix_agent_id) &&
      (!cfg.helix_base_url && !cfg.helix_api_key && !cfg.helix_environment_id && !cfg.helix_agent_id)) {
    setLangchainConfig(req, {
      helix_base_url,
      helix_api_key,
      helix_environment_id,
      helix_agent_id
    });
  }

  res.json({
    provider,
    model,
    helix_base_url,
    helix_api_key: helix_api_key ? '••••••••' : '',
    helix_environment_id,
    helix_agent_id,
    key_set: { ollama: true },
    provider_models: PROVIDER_MODELS,
    default_models: DEFAULT_MODELS,
  });
});

// POST /api/langchain/config
// Body: { provider, model, key_type, key, helix_api_key, helix_base_url, helix_environment_id, helix_agent_id }
router.post('/config', async (req, res) => {
  const { provider, model, key_type, key, helix_api_key, helix_base_url, helix_environment_id, helix_agent_id } = req.body || {};

  const updates = {};
  const dbUpdates = {}; // updates for SQLite persistence

  if (provider) updates.provider = provider;
  if (model) updates.model = model;

  // Handle Helix credentials (4-field configuration)
  if (key_type === 'helix' || provider === 'helix') {
    if (helix_base_url) {
      updates.helix_base_url = helix_base_url;
      dbUpdates.helix_base_url = helix_base_url;
    }
    if (helix_environment_id) {
      updates.helix_environment_id = helix_environment_id;
      dbUpdates.helix_environment_id = helix_environment_id;
    }
    if (helix_agent_id) {
      updates.helix_agent_id = helix_agent_id;
      dbUpdates.helix_agent_id = helix_agent_id;
    }
    if (helix_api_key) {
      updates.helix_api_key = helix_api_key;
      dbUpdates.helix_api_key = helix_api_key;
    }
    if (key) {
      updates.helix_api_key = key;
      dbUpdates.helix_api_key = key;
    }
    if (provider) updates.provider = provider;
  }

  // Handle cloud provider API keys (single-field configuration)
  if (key_type && ['openai', 'anthropic', 'google', 'groq'].includes(key_type)) {
    updates[key_type + '_api_key'] = key;
    updates.provider = key_type;
  }

  setLangchainConfig(req, updates);

  // Persist Helix credentials to SQLite
  if (Object.keys(dbUpdates).length > 0) {
    try {
      await configStore.setConfig(dbUpdates);
    } catch (err) {
      console.error('[langchainConfig POST] SQLite persist failed:', err.message);
      // Continue despite DB error — session is still valid
    }
  }

  const cfg = getLangchainConfig(req);
  const activeProvider = cfg.provider || 'ollama';

  // Log Helix config for debugging
  if (key_type === 'helix' || provider === 'helix') {
    console.log('[langchainConfig POST] Helix saved:', {
      helix_base_url: !!cfg.helix_base_url,
      helix_api_key: !!cfg.helix_api_key,
      helix_environment_id: !!cfg.helix_environment_id,
      helix_agent_id: !!cfg.helix_agent_id,
      provider: cfg.provider,
      db: Object.keys(dbUpdates).length > 0 ? 'persisted' : 'session_only'
    });
  }

  res.json({ ok: true, provider: activeProvider, model: cfg.model || DEFAULT_MODELS[activeProvider], key_set: { [activeProvider]: true } });
});

// DELETE /api/langchain/config/key/:keyType — clear Helix config from session + SQLite
router.delete('/config/key/:keyType', async (req, res) => {
  const keyType = req.params.keyType;

  // Clear Helix config from session
  if (keyType === 'helix') {
    const cfg = getLangchainConfig(req);
    delete cfg.helix_base_url;
    delete cfg.helix_api_key;
    delete cfg.helix_environment_id;
    delete cfg.helix_agent_id;
    req.session.langchain_config = cfg;

    // Clear from SQLite
    try {
      const Database = require('better-sqlite3');
      const dbDir = path.join(__dirname, '..', 'data', 'persistent');
      const dbPath = path.join(dbDir, 'config.db');
      if (fs.existsSync(dbPath)) {
        const database = new Database(dbPath);
        const stmt = database.prepare('DELETE FROM config WHERE key IN (?, ?, ?, ?)');
        stmt.run('helix_base_url', 'helix_api_key', 'helix_environment_id', 'helix_agent_id');
        database.close();
        console.log('[langchainConfig DELETE] Helix config cleared from SQLite');
      }
    } catch (err) {
      console.error('[langchainConfig DELETE] SQLite cleanup failed:', err.message);
      // Continue despite error — session is still cleared
    }
  }

  res.json({ ok: true, key_type: keyType, cleared: true });
});

// GET /api/langchain/ollama/models
// Lists locally installed Ollama models by running `ollama list`
router.get('/ollama/models', (req, res) => {
  const { execFile } = require('node:child_process');
  execFile('ollama', ['list'], { timeout: 5_000 }, (err, stdout, stderr) => {
    if (err) {
      console.warn(`[ollama list] failed:`, err.message);
      return res.status(500).json({ ok: false, error: err.message, models: [] });
    }
    const lines = (stdout || '').split('\n').filter(Boolean).slice(1);
    const models = lines.map(line => {
      const [name] = line.split(/\s+/);
      return name;
    }).filter(Boolean);
    res.json({ ok: true, models });
  });
});

// POST /api/langchain/ollama/pull
// Body: { model } — pulls (or refreshes) an Ollama model; runs ollama pull <model>
router.post('/ollama/pull', async (req, res) => {
  const { execFile } = require('node:child_process');
  const model = (req.body?.model || DEFAULT_MODELS.ollama).trim();
  if (!model || model.length > 100 || (/\s/).test(model)) {
    return res.status(400).json({ ok: false, error: 'Invalid model name' });
  }
  execFile('ollama', ['pull', model], { timeout: 300_000 }, (err, stdout, stderr) => {
    if (err) {
      console.error(`[ollama pull] failed for ${model}:`, err.message);
      return res.status(500).json({ ok: false, error: err.message, stderr });
    }
    res.json({ ok: true, model, output: stdout || stderr });
  });
});

// POST /api/langchain/ollama/shutdown
// Shuts down the local Ollama server permanently (unloads LaunchAgent on macOS)
router.post('/ollama/shutdown', (req, res) => {
  const { execFile } = require('node:child_process');
  const { execSync } = require('node:child_process');
  const platform = process.platform;

  const launchAgentPath = `${process.env.HOME}/Library/LaunchAgents/com.ollama.server.plist`;
  let responded = false;

  // Set a maximum response time of 2 seconds
  const responseTimeout = setTimeout(() => {
    if (!responded) {
      responded = true;
      res.json({ ok: true, message: 'Ollama shutdown initiated (timeout)' });
    }
  }, 2_000);

  if (platform === 'darwin') {
    // On macOS: unload the LaunchAgent AND kill the process
    try {
      execSync(`launchctl unload "${launchAgentPath}"`, { timeout: 1_000, stdio: 'pipe' });
      console.log(`[ollama shutdown] LaunchAgent unloaded`);
    } catch (err) {
      console.warn(`[ollama shutdown] unload failed:`, err.message);
    }

    // Kill the running Ollama process
    execFile('killall', ['ollama'], { timeout: 1_000 }, (killErr) => {
      if (responded) return;
      responded = true;
      clearTimeout(responseTimeout);
      // code 1 = no processes found (already shut down) = success
      res.json({ ok: true, message: 'Ollama shut down. To restart: launchctl load ~/Library/LaunchAgents/com.ollama.server.plist' });
    });
  } else {
    // On Linux/other: just kill the process
    execFile('killall', ['ollama'], { timeout: 1_000 }, (err) => {
      if (responded) return;
      responded = true;
      clearTimeout(responseTimeout);
      res.json({ ok: true, message: 'Ollama process terminated' });
    });
  }
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
