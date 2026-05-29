'use strict';
const express = require('express');
const { verticalManifest } = require('../services/verticalManifest');

const router = express.Router();

function requireSession(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
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

// Export the auth middlewares so Task 12's write endpoints can reuse them
// without re-declaring.
router.requireSession = requireSession;
router.requireAdmin = requireAdmin;

module.exports = router;
