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
  // v1 and v2 are both accepted. v2 adds resources.*.mirroredScopes,
  // a top-level `servers` block, and apps.*.{type,grantTypes,isResourceServer}.
  // All v2 additions are optional, so v1 manifests still load unchanged.
  if (!m || (m.version !== 1 && m.version !== 2) || !m.scopes || !m.tools || !m.apps || !m.resources) {
    throw new Error('[scopeTopology] scope-topology.json missing required top-level keys or unsupported version');
  }
  _manifest = m;
  return _manifest;
}

/** Required scopes for a tool. Falls back to ['read'] for unknown tools. */
function toolScopes(toolName) {
  const t = load().tools[toolName];
  return t ? t.requiredScopes.slice() : ['read'];
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

/**
 * All scopes that must exist on a resource server = native scopes the RS owns
 * PLUS scopes mirrored onto it because it is an RFC 8693 exchange-hop audience
 * (ARCHITECTURE-TRUTHS T-10). This is the set bootstrap must provision onto
 * the PingOne resource. Deduped, order: native first then mirrored.
 */
function resourceScopes(resourceName) {
  const r = load().resources[resourceName];
  if (!r) return [];
  const native = r.scopes || [];
  const mirrored = r.mirroredScopes || [];
  return [...new Set([...native, ...mirrored])];
}

/** Just the scopes this RS canonically owns (no mirrored). */
function resourceNativeScopes(resourceName) {
  const r = load().resources[resourceName];
  return r && r.scopes ? r.scopes.slice() : [];
}

/** Just the scopes mirrored onto this RS for exchange hops (v2). [] if none. */
function resourceMirroredScopes(resourceName) {
  const r = load().resources[resourceName];
  return r && r.mirroredScopes ? r.mirroredScopes.slice() : [];
}

/** Resource server's audience (uri). null if not modelled. */
function resourceUri(resourceName) {
  const r = load().resources[resourceName];
  return (r && r.uri) || null;
}

/** Full app entry { grantedScopes, type?, grantTypes?, isResourceServer? } or null. */
function appEntry(appName) {
  return load().apps[appName] || null;
}

/** v2 servers block: { resource, validatesAudience?, gatesOnToolScopes?, description? } or null. */
function serverEntry(serverName) {
  const s = load().servers || {};
  return s[serverName] || null;
}

/** All resource server names modelled in the topology. */
function allResources() {
  return Object.keys(load().resources);
}

/** All app names modelled in the topology. */
function allApps() {
  return Object.keys(load().apps);
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
  resourceNativeScopes,
  resourceMirroredScopes,
  resourceUri,
  appEntry,
  serverEntry,
  allResources,
  allApps,
  allTools,
  scopeMeta,
  _manifest: load,
};
