'use strict';

const { verticalManifest } = require('./verticalManifest');

/**
 * Single seam between shared NL/agent code and per-vertical plugins.
 *
 * Each helper takes the active vertical id and a `legacy` callback. When the
 * active vertical has a plugin, the helper returns the plugin's value and the
 * legacy callback is NOT invoked. When there is no plugin, the helper invokes
 * `legacy` and returns its result. This module never produces banking/default
 * content itself — the only fallback is the caller's own legacy path, used
 * solely while a vertical has not yet shipped its index.js.
 */

function resolvePlugin(activeId) {
  if (!activeId) return null;
  return verticalManifest.plugins.get(activeId);
}

function hasPlugin(activeId) {
  return resolvePlugin(activeId) !== null;
}

function heuristicsFor(activeId, legacy) {
  const p = resolvePlugin(activeId);
  return p ? p.getHeuristics() : legacy();
}

function systemPromptFor(activeId, ctx, legacy) {
  const p = resolvePlugin(activeId);
  return p ? p.getSystemPrompt(ctx) : legacy(ctx);
}

function toolSchemasFor(activeId, legacy) {
  const p = resolvePlugin(activeId);
  if (!p) return legacy();
  return p.getTools().map((t) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || { type: 'object', properties: {} },
  }));
}

function executeToolFor(activeId, name, params, ctx, legacy) {
  const p = resolvePlugin(activeId);
  return p ? p.executeTool(name, params, ctx) : legacy(name, params, ctx);
}

function authzFor(activeId, legacy) {
  const p = resolvePlugin(activeId);
  return p ? p.getAuthz() : legacy();
}

module.exports = {
  resolvePlugin, hasPlugin,
  heuristicsFor, systemPromptFor, toolSchemasFor, executeToolFor, authzFor,
};
