'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');
const path = require('path');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

// Resolve repo root (two dirs up from this file: routes/ → banking_api_server/ → Banking/)
const REPO_ROOT = path.resolve(__dirname, '../../');

// Singleton guard — module-level (local dev only, not Redis)
let activeProcess = null;

// Rate limiter: 3 requests per minute per session
const runServersLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.session?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many restart requests. Try again in 1 minute.' },
});

router.post('/run-servers', requireSession, runServersLimiter, (req, res) => {
  // Production guard
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
    return res.status(403).json({ error: 'forbidden', message: 'Run Servers is not available in production.' });
  }

  // Singleton guard — 409 if already in progress
  if (activeProcess !== null) {
    return res.status(409).json({ error: 'already_running', message: 'Already starting, please wait.' });
  }

  // SSE headers (match setupWizard.js pattern)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  const send = (payload) => {
    try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch (_) {}
  };

  // Spawn run-bank.sh restart
  const proc = spawn('./run-bank.sh', ['restart'], {
    cwd: REPO_ROOT,
    shell: true,
    detached: false,
  });
  activeProcess = proc;

  proc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    lines.forEach((line) => { if (line) send({ line, type: 'stdout' }); });
  });

  proc.stderr.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    lines.forEach((line) => { if (line) send({ line, type: 'stderr' }); });
  });

  proc.on('close', (exitCode) => {
    activeProcess = null;
    if (exitCode === 0) {
      send({ type: 'done', exitCode });
    } else {
      send({ type: 'error', exitCode: exitCode ?? 1 });
    }
    res.end();
  });

  proc.on('error', (err) => {
    activeProcess = null;
    send({ type: 'error', exitCode: 1, message: err.message });
    res.end();
  });

  // Clean up reference if client disconnects — do NOT kill the process (fire-and-forget)
  req.on('close', () => {
    activeProcess = null;
  });
});

module.exports = router;
