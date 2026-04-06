const fs = require('fs');
const path = require('path');
const configStore = require('./configStore');

const VERTICALS_DIR = path.join(__dirname, '..', 'config', 'verticals');

// In-memory cache of loaded vertical configs
let verticalCache = null;

/**
 * Load all vertical config JSON files from config/verticals/.
 */
function loadVerticals() {
  if (verticalCache) return verticalCache;
  verticalCache = {};
  try {
    const files = fs.readdirSync(VERTICALS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(VERTICALS_DIR, file), 'utf8');
      const config = JSON.parse(raw);
      if (config.id) {
        verticalCache[config.id] = config;
      }
    }
  } catch (err) {
    console.error('[verticalConfigService] Failed to load verticals:', err.message);
    // Provide a minimal banking fallback
    verticalCache.banking = { id: 'banking', displayName: 'BX Finance', tagline: 'AI-Powered Banking Demo' };
  }
  return verticalCache;
}

/**
 * List all available verticals (summary view).
 */
function listVerticals() {
  const all = loadVerticals();
  return Object.values(all).map(v => ({
    id: v.id,
    displayName: v.displayName,
    tagline: v.tagline,
    theme: v.theme
  }));
}

/**
 * Get the active vertical ID from configStore. Defaults to 'banking'.
 */
function getActiveVertical() {
  return configStore.getEffective('active_vertical') || 'banking';
}

/**
 * Set the active vertical. Validates the ID exists.
 */
async function setActiveVertical(verticalId) {
  const all = loadVerticals();
  if (!all[verticalId]) {
    throw new Error(`Unknown vertical: "${verticalId}". Available: ${Object.keys(all).join(', ')}`);
  }
  await configStore.setConfig({ active_vertical: verticalId });
  return all[verticalId];
}

/**
 * Get the full config for a specific vertical, or the active one.
 */
function getVerticalConfig(verticalId) {
  const all = loadVerticals();
  const id = verticalId || getActiveVertical();
  return all[id] || all.banking || null;
}

/**
 * Map a generic term to the active vertical's terminology.
 * e.g. mapTerm('agent') → 'Banking Agent' or 'Shopping Assistant'
 */
function mapTerm(term) {
  const config = getVerticalConfig();
  if (!config || !config.terminology) return term;
  return config.terminology[term] || term;
}

/**
 * Force reload verticals from disk (useful after adding new JSON files).
 */
function reloadVerticals() {
  verticalCache = null;
  return loadVerticals();
}

module.exports = {
  listVerticals,
  getActiveVertical,
  setActiveVertical,
  getVerticalConfig,
  mapTerm,
  reloadVerticals
};
