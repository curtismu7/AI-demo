'use strict';

/**
 * configStore.envCoverage.test.js
 *
 * Ensures every env var defined in banking_api_server/.env has a corresponding
 * entry in configStore's envFallbackMap, and that each mapping resolves the
 * right value when process.env is set.
 *
 * This test runs in the pre-commit hook (api-server test suite) so that a new
 * .env variable added without a configStore mapping is caught before it ships.
 */

const path = require('path');
const fs   = require('fs');

// ── Parse .env to get the canonical list of variable names ───────────────────
const ENV_FILE = path.resolve(__dirname, '../../.env');

function parseEnvKeys(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(line => /^[A-Z_][A-Z0-9_]*=/.test(line.trim()))
    .map(line => line.trim().split('=')[0]);
}

// Variables intentionally NOT routed through configStore — purely runtime /
// infra / test-only vars that no feature code calls getEffective() for.
const IGNORED_VARS = new Set([
  'NODE_ENV',          // runtime platform flag, never via configStore
  'USERNAME',          // demo cred mapped as demo_username
  'PASSWORD',          // demo cred mapped as demo_password
  'PINGONE_MFA_POLICY_ID', // appears twice in .env (duplicate); mapped once
]);

// ── Build the envFallbackMap by requiring configStore internals ───────────────
// We expose the map for testing by calling getEffective with a known sentinel
// and checking the reverse lookup.  Instead, we extract the map directly by
// loading the module and walking getEffective source — but the simplest approach
// is to verify resolution: set process.env[VAR]=sentinel, call getEffective(key),
// assert it returns the sentinel, then restore.

// We need to know which configStore key maps to each env var.
// Build that inverse map from FIELD_DEFS key names → env var aliases via
// a small extraction shim that mirrors the envFallbackMap in configStore.
// We import configStore and expose the map via a test-only export.

// configStore doesn't export envFallbackMap directly (it's inline in getEffective).
// Rather than coupling the test to internal structure, we verify coverage by:
//   1. Asserting that getEffective(derivedKey) returns the env var value when set.
//   2. For each .env key, we derive the expected configStore key (lowercase) and
//      check that it resolves.

const configStore = require('../../services/configStore');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('configStore env coverage', () => {
  const envKeys = parseEnvKeys(ENV_FILE).filter(k => !IGNORED_VARS.has(k));

  // Deduplicate (PINGONE_MFA_POLICY_ID appears twice in file)
  const uniqueKeys = [...new Set(envKeys)];

  it('.env file exists and has at least 30 variables', () => {
    expect(uniqueKeys.length).toBeGreaterThan(30);
  });

  // For each env var, verify that configStore.getEffective resolves it.
  // Strategy: set process.env[VAR] to a unique sentinel, call getEffective with
  // the lowercase key (and common aliases), assert the sentinel is returned.
  uniqueKeys.forEach(envVar => {
    it(`getEffective resolves ${envVar}`, () => {
      const sentinel = `__TEST_${envVar}_${Date.now()}__`;
      const prev = process.env[envVar];
      process.env[envVar] = sentinel;

      // Try both the exact env var name lowercased and some common patterns.
      // configStore normalises keys to lowercase internally.
      const candidates = [
        envVar.toLowerCase(),
        // strip common prefixes to get the bare key
        envVar.replace(/^PINGONE_/, '').toLowerCase(),
        envVar.replace(/^HELIX_/, 'helix_').toLowerCase(),
      ];

      let found = false;
      for (const candidate of candidates) {
        try {
          const val = configStore.getEffective(candidate);
          if (val === sentinel) {
            found = true;
            break;
          }
        } catch (_) { /* key not in map — try next */ }
      }

      // Restore original value
      if (prev === undefined) {
        delete process.env[envVar];
      } else {
        process.env[envVar] = prev;
      }

      expect(found).toBe(true);
    });
  });
});
