'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { verticalManifest } = require('../services/verticalManifest');

const router = express.Router();

const PROTECTED_IDS = new Set(['banking', 'admin-console']);
const ID_REGEX = /^[a-z][a-z0-9-]*$/;

function requireSession(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}

// Guard for parameterized :id routes — validates req.params.id against ID_REGEX
// before it reaches any path.join / fs call. Express decodes %2F to '/' inside
// req.params.id, so this is the path-traversal boundary, not just a 404 helper.
function requireValidId(req, res, next) {
  if (!ID_REGEX.test(req.params.id || '')) {
    return res.status(400).json({ error: 'invalid id format' });
  }
  next();
}

// ---- Read endpoints ----

router.get('/me', requireSession, (req, res) => {
  res.json(verticalManifest.scope.resolveForRequest(req));
});

router.get('/list', requireSession, (_req, res) => {
  res.json(verticalManifest.list());
});

router.get('/stream', requireSession, (req, res) => {
  verticalManifest.events.onClient(req, res);
  // Don't end — the client keeps it open until they disconnect.
});

// ---- Write endpoints ----
// Specific paths first, parameterized paths last (express routes top-to-bottom).

// Switching the active vertical is open to any authenticated user (not admin-only):
// it's a demo affordance and the change is global + broadcast over SSE. The id is
// still validated against the loaded set. The remaining write endpoints stay admin-only.
// Hidden verticals (admin overlay, deprecated admin-console) cannot be activated.
router.post('/active', requireSession, (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });
  if (verticalManifest.HIDDEN_IDS.has(id)) return res.status(403).json({ error: 'cannot activate hidden vertical' });
  if (!verticalManifest.loader.get(id)) return res.status(404).json({ error: 'unknown id' });
  verticalManifest.resolver.setActive(id);
  res.status(204).end();
});

router.post('/reset-all', requireAdmin, (_req, res) => {
  for (const id of verticalManifest.store.listOverlayIds()) {
    verticalManifest.resolver.overlay.clearAll(id);
  }
  res.status(204).end();
});

router.post('/snapshot', requireAdmin, (req, res) => {
  const savedAt = verticalManifest.snapshot.save(req.user.id);
  res.json({ savedAt });
});

router.post('/snapshot/restore', requireAdmin, (req, res) => {
  verticalManifest.snapshot.restore(req.user.id);
  res.status(204).end();
});

router.delete('/snapshot', requireAdmin, (req, res) => {
  verticalManifest.snapshot.clear(req.user.id);
  res.status(204).end();
});

router.post('/:sourceId/clone', requireAdmin, (req, res) => {
  const { sourceId } = req.params;
  const { newId, displayName } = req.body || {};
  if (!ID_REGEX.test(sourceId)) return res.status(400).json({ error: 'invalid source id format' });
  if (!newId || !displayName) return res.status(400).json({ error: 'newId and displayName required' });
  if (!ID_REGEX.test(newId)) return res.status(400).json({ error: 'invalid id format' });
  if (verticalManifest.loader.get(newId)) return res.status(409).json({ error: 'id already exists' });
  const source = verticalManifest.loader.get(sourceId);
  if (!source) return res.status(404).json({ error: 'unknown source id' });

  const root = process.env.VERTICAL_SEED_ROOT
    || path.join(__dirname, '..', 'config', 'verticals');
  const newDir = path.join(root, newId);
  fs.mkdirSync(newDir, { recursive: true });

  const newManifest = JSON.parse(JSON.stringify(source.manifest));
  newManifest.id = newId;
  newManifest.identity.displayName = displayName;
  fs.writeFileSync(path.join(newDir, 'manifest.json'), JSON.stringify(newManifest, null, 2));
  fs.writeFileSync(path.join(newDir, 'mock-data.json'), JSON.stringify(source.mockData || {}, null, 2));

  verticalManifest.loader.reload(newId);
  verticalManifest.events.emit('vertical-list-changed', { ids: verticalManifest.list().map((v) => v.id) });
  res.status(201).json({ id: newId, displayName });
});

// Raw seed manifest + current overlay paths — powers the admin editor's
// seed-diffing (so editing a field back to seed clears the override) and the
// override panel. loader.get(id).manifest is the un-merged seed.
router.get('/:id/seed', requireAdmin, requireValidId, (req, res) => {
  const entry = verticalManifest.loader.get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'unknown id' });
  res.json({
    seedManifest: entry.manifest,
    overlayPaths: verticalManifest.resolver.overlay.list(req.params.id),
  });
});

router.delete('/:id', requireAdmin, requireValidId, (req, res) => {
  const { id } = req.params;
  if (PROTECTED_IDS.has(id)) return res.status(403).json({ error: 'protected id' });
  if (verticalManifest.resolver.activeId() === id) return res.status(409).json({ error: 'cannot delete active vertical' });
  if (!verticalManifest.loader.get(id)) return res.status(404).json({ error: 'unknown id' });

  const root = process.env.VERTICAL_SEED_ROOT
    || path.join(__dirname, '..', 'config', 'verticals');
  fs.rmSync(path.join(root, id), { recursive: true, force: true });
  verticalManifest.resolver.overlay.clearAll(id);
  verticalManifest.resolver.removeFromCache(id);
  verticalManifest.loader.removeFromCache(id);
  verticalManifest.events.emit('vertical-list-changed', { ids: verticalManifest.list().map((v) => v.id) });
  res.status(204).end();
});

// The editor sends the FULL desired overlay (= diff(seed, edited)) here, so this
// uses replace semantics: the overlay becomes exactly `entries`, and any field
// no longer present is cleared. That's what makes "edit a field back to its seed
// value and Save" remove the override.
router.post('/:id/overlay/batch', requireAdmin, requireValidId, (req, res) => {
  const { id } = req.params;
  const { entries } = req.body || {};
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries array required' });
  if (!verticalManifest.loader.get(id)) return res.status(404).json({ error: 'unknown id' });
  try {
    verticalManifest.resolver.overlay.replaceBatch(id, entries);
    res.status(204).end();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/overlay', requireAdmin, requireValidId, (req, res) => {
  const { id } = req.params;
  const { path: fieldPath, value } = req.body || {};
  if (!fieldPath) return res.status(400).json({ error: 'path required' });
  if (!verticalManifest.loader.get(id)) return res.status(404).json({ error: 'unknown id' });
  try {
    verticalManifest.resolver.overlay.setField(id, fieldPath, value);
    res.status(204).end();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id/overlay', requireAdmin, requireValidId, (req, res) => {
  const { id } = req.params;
  const { path: fieldPath } = req.body || {};
  if (!verticalManifest.loader.get(id)) return res.status(404).json({ error: 'unknown id' });
  if (fieldPath) {
    verticalManifest.resolver.overlay.clearField(id, fieldPath);
  } else {
    verticalManifest.resolver.overlay.clearAll(id);
  }
  res.status(204).end();
});

// Export the auth middlewares so callers can reuse them without re-declaring.
router.requireSession = requireSession;
router.requireAdmin = requireAdmin;

module.exports = router;
