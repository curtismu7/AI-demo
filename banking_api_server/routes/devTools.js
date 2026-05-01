'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');
const path = require('path');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

const REPO_ROOT = path.resolve(__dirname, '../../');

// Singleton guard — cleared when process exits
let activeProcess = null;

const runServersLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.session?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many restart requests. Try again in 1 minute.' },
});

router.post('/run-servers', requireSession, runServersLimiter, (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
    return res.status(403).json({ error: 'forbidden', message: 'Run Servers is not available in production.' });
  }

  if (activeProcess !== null) {
    return res.status(409).json({ error: 'already_running', message: 'Already starting, please wait.' });
  }

  // Spawn detached — returns immediately, run-bank.sh runs independently
  const proc = spawn('./run-bank.sh', ['restart'], {
    cwd: REPO_ROOT,
    shell: true,
    detached: true,
    stdio: 'ignore',
  });
  activeProcess = proc;
  proc.unref(); // don't block the Node process

  proc.on('close', () => { activeProcess = null; });
  proc.on('error', () => { activeProcess = null; });

  res.status(202).json({ message: 'Servers restarting — a new tab will open when ready.' });
});

module.exports = router;
