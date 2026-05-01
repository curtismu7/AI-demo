'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');
const path = require('path');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

const REPO_ROOT = path.resolve(__dirname, '../../');

let activeLaunch = false;

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

  if (activeLaunch) {
    return res.status(409).json({ error: 'already_running', message: 'Already starting, please wait.' });
  }

  activeLaunch = true;
  setTimeout(() => { activeLaunch = false; }, 60_000);

  // Use osascript to open a real Terminal window with a full GUI session.
  // This gives run-bank.sh a TTY so CRA's npm start can open the browser,
  // identical to running ./run-bank.sh restart in a terminal manually.
  const osa = `tell application "Terminal"
    activate
    do script "cd ${REPO_ROOT} && ./run-bank.sh restart"
  end tell`;

  const proc = spawn('osascript', ['-e', osa], {
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();

  res.status(202).json({ message: 'Opening Terminal to restart servers.' });
});

module.exports = router;
