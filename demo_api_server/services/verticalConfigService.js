const fs = require('fs');
const path = require('path');
const configStore = require('./configStore');

const VERTICALS_DIR = path.join(__dirname, '..', 'config', 'verticals');
const SEEDS_DIR     = path.join(__dirname, '..', 'data', 'seeds');

// Cache of seed file modules (avoids re-requiring on every call)
const seedCache = {};

/**
 * Load the seed file for a vertical. Returns {} if none exists.
 * Seed files own: seed (account data), chips, llmChipGroups, toolDescriptions.
 */
function getSeedFile(verticalId) {
  if (!seedCache[verticalId]) {
    const seedPath = path.join(SEEDS_DIR, `${verticalId}.js`);
    try {
      seedCache[verticalId] = require(seedPath);
    } catch {
      seedCache[verticalId] = {};
    }
  }
  return seedCache[verticalId];
}

/**
 * Merge seed file chip/llmChipGroups into a manifest clone so the browser
 * receives a single complete manifest without duplicating data in JSON files.
 * The seed file is authoritative; JSON fallback applies when no seed exists.
 */
function mergeSeedIntoManifest(manifest) {
  if (!manifest) return manifest;
  const seed = getSeedFile(manifest.id);
  if (!seed.chips && !seed.llmChipGroups) return manifest;
  const merged = { ...manifest, dashboard: { ...(manifest.dashboard || {}) } };
  if (seed.chips)         merged.dashboard.chips         = seed.chips;
  if (seed.llmChipGroups) merged.dashboard.llmChipGroups = seed.llmChipGroups;
  return merged;
}

// In-memory cache of loaded vertical configs
let verticalCache = null;

/**
 * Verticals that are only used internally (e.g. admin page) and must not
 * appear in the vertical-switcher dropdown. `listVerticals()` filters these out.
 * `getVerticalConfig(id)` still resolves them for internal use.
 */
const INTERNAL_VERTICALS = new Set(['admin']);

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
      const valid =
        config &&
        config.id &&
        config.schemaVersion === 2 &&
        config.identity &&
        config.identity.displayName &&
        config.theme &&
        config.theme.cssVars;
      if (valid) {
        verticalCache[config.id] = config;
      } else {
        console.error(
          `[verticalConfigService] Skipping invalid manifest "${file}" (must be schemaVersion 2 with identity.displayName + theme.cssVars)`
        );
      }
    }
  } catch (err) {
    console.error('[verticalConfigService] Failed to load verticals:', err.message);
    // Provide a minimal banking fallback
    verticalCache.banking = { id: 'banking', displayName: 'Super Banking', tagline: 'AI-Powered Banking Demo' };
  }
  return verticalCache;
}

/**
 * List all available verticals (summary view).
 */
function listVerticals() {
  const all = loadVerticals();
  return Object.values(all)
    .filter(v => !INTERNAL_VERTICALS.has(v.id))
    .map(v => ({
    id: v.id,
    displayName: (v.identity && v.identity.displayName) || v.displayName,
    tagline: (v.identity && v.identity.tagline) || v.tagline,
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
 * Also updates ui_industry_preset so IndustryBrandingContext picks up the styling.
 */
async function setActiveVertical(verticalId) {
  // Re-read from disk on every switch so JSON edits take effect without a server restart.
  verticalCache = null;
  const all = loadVerticals();
  if (!all[verticalId]) {
    throw new Error(`Unknown vertical: "${verticalId}". Available: ${Object.keys(all).join(', ')}`);
  }
  await configStore.setConfig({
    active_vertical: verticalId,
    ui_industry_preset: verticalId
  });
  // Wipe and re-seed all customer accounts/transactions for the new vertical
  // so demo data matches the industry context (e.g. Patient Records for healthcare).
  const dataStore = require('../data/store');
  await dataStore.reseedAllCustomersForVertical(verticalId);
  return all[verticalId];
}

/**
 * Get the full config for a specific vertical, or the active one.
 * Chip data is merged from the seed file so the caller always gets a complete manifest.
 */
function getVerticalConfig(verticalId) {
  const all = loadVerticals();
  const id = verticalId || getActiveVertical();
  return mergeSeedIntoManifest(all[id] || all.banking || null);
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

/**
 * Return the full v2 manifest for the active vertical, with chip data merged
 * from the seed file. Falls back to the banking manifest if active id is missing.
 */
function getActiveManifest() {
  const all = loadVerticals();
  const activeId = getActiveVertical();
  return mergeSeedIntoManifest(all[activeId] || all.banking || null);
}

module.exports = {
  getSeedFile,
  listVerticals,
  getActiveVertical,
  setActiveVertical,
  getVerticalConfig,
  mapTerm,
  reloadVerticals,
  getActiveManifest
};
