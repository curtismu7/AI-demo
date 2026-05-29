'use strict';

const lodashSet = require('lodash.set');
const mergeWith = require('lodash.mergewith');
const { ManifestSchema } = require('./schema');

function arrayCustomizer(_, src) {
  if (Array.isArray(src)) return src;
}

// Walk a nested object and return all leaf paths (dot notation).
function leafPaths(obj, prefix) {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...leafPaths(v, p));
    } else {
      out.push(p);
    }
  }
  return out;
}

// Remove `path` from obj; returns true if removed; cleans up empty parent objects.
function deletePath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  const stack = [obj];
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') return false;
    cur = cur[parts[i]];
    stack.push(cur);
  }
  const last = parts[parts.length - 1];
  if (!(last in cur)) return false;
  delete cur[last];
  for (let i = stack.length - 1; i > 0; i--) {
    if (Object.keys(stack[i]).length === 0) {
      delete stack[i - 1][parts[i - 1]];
    } else break;
  }
  return true;
}

function createOverlay(store, loader) {
  function get(id) { return store.getOverlay(id); }

  function _validateMerged(id, overlay) {
    const seed = loader.get(id);
    if (!seed) throw new Error(`No seed for id ${id}`);
    const merged = mergeWith({}, seed.manifest, overlay, arrayCustomizer);
    // Force id and schemaVersion to the seed values; overlay can't change them.
    merged.id = seed.manifest.id;
    merged.schemaVersion = 3;
    const res = ManifestSchema.safeParse(merged);
    if (!res.success) {
      throw new Error(`Overlay produces invalid manifest: ${JSON.stringify(res.error.issues)}`);
    }
  }

  function setField(id, path, value) {
    const current = get(id);
    lodashSet(current, path, value);
    _validateMerged(id, current);
    store.setOverlay(id, current);
  }

  function setBatch(id, entries) {
    const current = get(id);
    for (const { path, value } of entries) {
      lodashSet(current, path, value);
    }
    _validateMerged(id, current);
    store.setOverlay(id, current);
  }

  function clearField(id, path) {
    const current = get(id);
    if (!deletePath(current, path)) return;
    store.setOverlay(id, current);
  }

  function clearAll(id) { store.clearOverlay(id); }

  function list(id) { return leafPaths(get(id)); }

  return { get, setField, setBatch, clearField, clearAll, list };
}

module.exports = { createOverlay };
