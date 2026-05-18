'use strict';

/**
 * scopeTopology.js — BFF accessor for the repo-root scope-topology.json SSOT.
 * Loaded + schema-validated once at first require. Throws on invalid manifest
 * so a malformed topology fails fast at service boot, never silently.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');
const MANIFEST_PATH = path.join(ROOT, 'scope-topology.json');

let _manifest = null;

function load() {
  if (_manifest) return _manifest;
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const m = JSON.parse(raw);
  if (!m || m.version !== 1 || !m.scopes || !m.tools || !m.apps || !m.resources) {
    throw new Error('[scopeTopology] scope-topology.json missing required top-level keys');
  }
  _manifest = m;
  return _manifest;
}

/** Required scopes for a tool. Falls back to ['banking:read'] for unknown tools. */
function toolScopes(toolName) {
  const t = load().tools[toolName];
  return t ? t.requiredScopes.slice() : ['banking:read'];
}

/** Tool surface class: 'gateway' | 'exchange-only' | 'legacy-alias' | undefined. */
function toolSurface(toolName) {
  const t = load().tools[toolName];
  return t ? t.surface : undefined;
}

/** challengeType for a tool ('step_up' | 'consent'); defaults to 'consent'. */
function toolChallengeType(toolName) {
  const t = load().tools[toolName];
  return (t && t.challengeType) || 'consent';
}

function appGrantedScopes(appName) {
  const a = load().apps[appName];
  return a ? a.grantedScopes.slice() : [];
}

function resourceScopes(resourceName) {
  const r = load().resources[resourceName];
  return r ? r.scopes.slice() : [];
}

function allTools() {
  return Object.keys(load().tools);
}

function scopeMeta(scope) {
  return load().scopes[scope] || null;
}

module.exports = {
  toolScopes,
  toolSurface,
  toolChallengeType,
  appGrantedScopes,
  resourceScopes,
  allTools,
  scopeMeta,
  _manifest: load,
};
