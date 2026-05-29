'use strict';

const mergeWith = require('lodash.mergewith');
const { ManifestSchema } = require('./schema');

function arrayCustomizer(_, src) {
  if (Array.isArray(src)) return src;
}

/**
 * createResolver — deep-merges seed + overlay into a fully validated manifest,
 * caches per (id, overlayVersion), owns the active-id getter/setter, and wraps
 * the overlay so every mutation also bumps the cache version and fires onEvent.
 *
 * @param {object} loader  — has .get(id) => { manifest, mockData } | null
 * @param {object} overlay — raw overlay created by createOverlay(store, loader)
 * @param {object} store   — verticalStore.lmdb module (for activeId)
 * @param {object} opts
 * @param {function} opts.onEvent  — (type: string, payload: object) => void
 */
function createResolver(loader, overlay, store, { onEvent } = { onEvent: () => {} }) {
  // Cache key: id; value: { version, merged }
  const cache = new Map();
  // Per-id version counter; bumped on every overlay write or loader reload.
  const versions = new Map();

  function _bump(id) {
    versions.set(id, (versions.get(id) || 0) + 1);
    cache.delete(id);
  }

  // Wrap overlay mutators so the resolver cache invalidates and events fire.
  // Consumers should use resolver.overlay.* — NOT the bare overlay passed in.
  const wrappedOverlay = {
    get(id) { return overlay.get(id); },
    list(id) { return overlay.list(id); },
    setField(id, path, value) {
      overlay.setField(id, path, value);
      _bump(id);
      onEvent('vertical-edited', { id });
    },
    setBatch(id, entries) {
      overlay.setBatch(id, entries);
      _bump(id);
      onEvent('vertical-edited', { id });
    },
    clearField(id, path) {
      overlay.clearField(id, path);
      _bump(id);
      onEvent('vertical-edited', { id });
    },
    clearAll(id) {
      overlay.clearAll(id);
      _bump(id);
      onEvent('vertical-edited', { id });
    },
  };

  function resolve(id) {
    const seed = loader.get(id);
    if (!seed) return null;

    const ver = versions.get(id) || 0;
    const cached = cache.get(id);
    if (cached && cached.version === ver) {
      // Return a structured clone so caller mutations don't poison the cache.
      return JSON.parse(JSON.stringify(cached.merged));
    }

    const overlayValue = overlay.get(id);
    const merged = mergeWith({}, seed.manifest, overlayValue, arrayCustomizer);
    // Force id and schemaVersion — overlay cannot change them.
    merged.id = seed.manifest.id;
    merged.schemaVersion = 3;
    // Ensure scopes is at least {} so Zod parses inner field defaults (read/write/transfer).
    // When scopes is absent, Zod's outer .default({}) returns {} without running
    // inner field defaults; passing {} explicitly triggers them.
    if (merged.scopes === undefined || merged.scopes === null) merged.scopes = {};
    const parsed = ManifestSchema.parse(merged); // applies defaults (e.g. scopes)

    cache.set(id, { version: ver, merged: parsed });
    return JSON.parse(JSON.stringify(parsed));
  }

  function reload(id) {
    loader.reload(id);
    _bump(id);
  }

  function removeFromCache(id) {
    cache.delete(id);
    versions.delete(id);
    if (typeof loader.removeFromCache === 'function') loader.removeFromCache(id);
  }

  function activeId() { return store.getActiveId(); }

  function setActive(id) {
    store.setActiveId(id);
    onEvent('vertical-switched', { activeId: id });
  }

  return { resolve, reload, removeFromCache, activeId, setActive, overlay: wrappedOverlay, loader };
}

module.exports = { createResolver };
