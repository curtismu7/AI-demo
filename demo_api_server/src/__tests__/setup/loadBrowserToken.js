/**
 * banking_api_server/src/__tests__/setup/loadBrowserToken.js
 *
 * Jest globalSetup — runs ONCE before any test suite loads.
 *
 * If .env.test-tokens exists (written by scripts/extract-browser-token.js),
 * this reads it and injects the values into process.env so that live
 * integration tests receive INTEGRATION_SUBJECT_ACCESS_TOKEN automatically
 * — no manual export required.
 *
 * The file is never committed (.env.* is gitignored).
 * All variables it injects are treated as weaker defaults: existing env vars
 * (e.g. from CI or shell export) always win.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, '../../../.env.test-tokens');

module.exports = async function loadBrowserToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    // No token file — silently skip. Only live test suites care.
    return;
  }

  const lines = fs.readFileSync(TOKEN_FILE, 'utf8').split('\n');
  let loaded = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();

    // Don't overwrite vars already set in the environment (CI / shell export wins)
    if (!process.env[key]) {
      process.env[key] = val;
      loaded++;
    }
  }

  if (loaded > 0) {
    // eslint-disable-next-line no-console
    console.log(`[loadBrowserToken] Loaded ${loaded} var(s) from .env.test-tokens`);
    const token = process.env.INTEGRATION_SUBJECT_ACCESS_TOKEN || '';
    if (token.length > 20) {
      // eslint-disable-next-line no-console
      console.log(`[loadBrowserToken] INTEGRATION_SUBJECT_ACCESS_TOKEN = ${token.slice(0, 20)}…(${token.length} chars)`);
    }
  }
};
