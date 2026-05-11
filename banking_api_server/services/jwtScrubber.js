'use strict';
/**
 * scrubRawJwts — defense-in-depth response-body walker
 *
 * Walks any value tree and replaces any string that matches the JWT shape
 * (three base64url segments separated by dots, starting with "eyJ")
 * with '[REDACTED_JWT]'. Used by Phase 266 routes that handle id_token-derived
 * data, to ensure a raw JWT can never leak even if a future code change
 * accidentally includes one.
 *
 * Per CLAUDE.md "Token custody rule": tokens never reach the browser.
 */
const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Recursively walks a value tree and redacts any JWT-shaped strings.
 *
 * @param {*} value — any JSON-serializable value
 * @returns {*} the same structure with JWT strings replaced by '[REDACTED_JWT]'
 */
function scrubRawJwts(value) {
  if (value == null) return value;
  if (typeof value === 'string') return JWT_RE.test(value) ? '[REDACTED_JWT]' : value;
  if (Array.isArray(value)) return value.map(scrubRawJwts);
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = scrubRawJwts(value[k]);
    return out;
  }
  return value;
}

module.exports = { scrubRawJwts };
