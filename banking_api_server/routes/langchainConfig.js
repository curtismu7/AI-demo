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
const { resolveAgentMode, AGENT_MODES } = require('../services/agentModeResolver');
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
  try {
    const cfg = getLangchainConfig(req);
    const { resolveLlmProvider } = require('../services/llmProviderResolver');
    const provider = resolveLlmProvider(cfg).provider;
    const model = cfg.model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.ollama;

    // Load Helix credentials from SQLite if not in session (e.g., after tab switch)
    let helix_base_url = cfg.helix_base_url || '';
    let helix_api_key = cfg.helix_api_key || '';
    let helix_environment_id = cfg.helix_environment_id || '';
    let helix_agent_id = cfg.helix_agent_id || '';
    let helix_prompt_field_id = cfg.helix_prompt_field_id || '';

    // Try to load from configStore but don't let it crash the response.
    // Use getEffective so FIELD_DEFS defaults (committed in configStore.js for
    // helix_base_url, helix_environment_id, helix_agent_id, helix_prompt_field_id)
    // reach fresh clones whose SQLite has not yet been populated.
    try {
      helix_base_url = helix_base_url || configStore.getEffective('helix_base_url') || '';
      helix_api_key = helix_api_key || configStore.getEffective('helix_api_key') || '';
      helix_environment_id = helix_environment_id || configStore.getEffective('helix_environment_id') || '';
      helix_agent_id = helix_agent_id || configStore.getEffective('helix_agent_id') || '';
      helix_prompt_field_id = helix_prompt_field_id || configStore.getEffective('helix_prompt_field_id') || '';
    } catch (dbErr) {
      console.warn('[langchainConfig GET] configStore error:', dbErr.message);
    }

    // If we loaded from SQLite, update the session so it's available for this session
    if ((helix_base_url || helix_api_key || helix_environment_id || helix_agent_id || helix_prompt_field_id) &&
        (!cfg.helix_base_url && !cfg.helix_api_key && !cfg.helix_environment_id && !cfg.helix_agent_id && !cfg.helix_prompt_field_id)) {
      setLangchainConfig(req, {
        helix_base_url,
        helix_api_key,
        helix_environment_id,
        helix_agent_id,
        helix_prompt_field_id,
      });
    }

    res.json({
      provider,
      model,
      helix_base_url,
      helix_api_key: helix_api_key ? '••••••••' : '',
      helix_environment_id,
      helix_agent_id,
      helix_prompt_field_id,
      // Honest credential presence so UIs can disable unconfigured
      // providers (teaching spec 2026-05-18-chatgpt-claude-as-agent,
      // "disable unconfigured" UX). ollama is local (always available);
      // openai/anthropic are enforced for real at banking_agent_service
      // (:3006), which reads OPENAI_API_KEY / ANTHROPIC_API_KEY — mirror
      // that source here (session key OR configStore OR that env var).
      key_set: {
        ollama: true,
        helix: !!(helix_api_key && helix_base_url),
        openai: !!(cfg.openai_api_key ||
          configStore.getEffective('openai_api_key') ||
          process.env.OPENAI_API_KEY),
        anthropic: !!(cfg.anthropic_api_key ||
          configStore.getEffective('anthropic_api_key') ||
          process.env.ANTHROPIC_API_KEY),
      },
      provider_models: PROVIDER_MODELS,
      default_models: DEFAULT_MODELS,
      agent_mode: configStore.getEffective('agent_mode') || 'heuristics_helix',
      external_wiring: configStore.getEffective('agent_external_wiring') || 'bff',
      agent_modes: AGENT_MODES.map((m) => ({ id: m.id, label: m.label, external: m.external })),
    });
  } catch (err) {
    console.error('[langchainConfig GET] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/langchain/config
// Body: { provider, model, key_type, key, helix_api_key, helix_base_url, helix_environment_id, helix_agent_id, helix_prompt_field_id }
router.post('/config', async (req, res) => {
  const { provider, model, key_type, key, helix_api_key, helix_base_url, helix_environment_id, helix_agent_id, helix_prompt_field_id } = req.body || {};
  const { agent_mode, external_wiring } = req.body || {};

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
    if (helix_prompt_field_id) {
      updates.helix_prompt_field_id = helix_prompt_field_id;
      dbUpdates.helix_prompt_field_id = helix_prompt_field_id;
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

  if (agent_mode !== undefined) {
    const am = resolveAgentMode(agent_mode, external_wiring);
    try {
      await configStore.setConfig({
        agent_mode: am.mode,
        agent_external_wiring: am.externalWiring || '',
      });
    } catch (err) {
      console.error('[langchainConfig POST] agent_mode persist failed:', err.message);
    }
    if (am.provider) setLangchainConfig(req, { provider: am.provider });
  }

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
  const { resolveLlmProvider } = require('../services/llmProviderResolver');
  const activeProvider = resolveLlmProvider(cfg).provider;

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

  res.json({
    ok: true,
    provider: activeProvider,
    model: cfg.model || DEFAULT_MODELS[activeProvider],
    key_set: { [activeProvider]: true },
    agent_mode: agent_mode !== undefined
      ? resolveAgentMode(agent_mode, external_wiring).mode
      : (configStore.getEffective('agent_mode') || null),
    external_wiring: agent_mode !== undefined
      ? resolveAgentMode(agent_mode, external_wiring).externalWiring
      : (configStore.getEffective('agent_external_wiring') || null),
  });
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

// POST /api/langchain/ollama/disable-autostart
// Disables Ollama auto-start by unloading the LaunchAgent (macOS only)
router.post('/ollama/disable-autostart', (req, res) => {
  const { execSync } = require('node:child_process');
  const platform = process.platform;

  if (platform !== 'darwin') {
    return res.json({ ok: true, message: 'Ollama auto-start is not applicable on this platform' });
  }

  const launchAgentPath = `${process.env.HOME}/Library/LaunchAgents/com.ollama.server.plist`;

  try {
    // Try modern syntax first (macOS 12.4+)
    try {
      execSync(`launchctl bootout gui/$(id -u) "${launchAgentPath}"`, { timeout: 5_000, stdio: 'pipe' });
      console.log('[ollama disable-autostart] LaunchAgent unloaded via bootout');
    } catch {
      // Fall back to older syntax
      execSync(`launchctl unload "${launchAgentPath}"`, { timeout: 5_000, stdio: 'pipe' });
      console.log('[ollama disable-autostart] LaunchAgent unloaded via unload');
    }

    res.json({ ok: true, message: 'Ollama auto-start disabled. It will not start on login.' });
  } catch (err) {
    console.warn('[ollama disable-autostart] Error disabling auto-start:', err.message);
    // Don't treat this as a failure — the LaunchAgent might already be unloaded
    res.json({ ok: true, message: 'Ollama auto-start disabled (or already disabled)' });
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

    // For Helix, try to load from SQLite if not in session.
    // Use getEffective so FIELD_DEFS defaults reach fresh clones.
    if (providerName === 'helix') {
      try {
        cfg.helix_base_url = cfg.helix_base_url || configStore.getEffective('helix_base_url') || '';
        cfg.helix_api_key = cfg.helix_api_key || configStore.getEffective('helix_api_key') || '';
        cfg.helix_environment_id = cfg.helix_environment_id || configStore.getEffective('helix_environment_id') || '';
        cfg.helix_agent_id = cfg.helix_agent_id || configStore.getEffective('helix_agent_id') || '';
      } catch (dbErr) {
        console.warn('[langchainConfig provider status] configStore error:', dbErr.message);
      }
    }

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
