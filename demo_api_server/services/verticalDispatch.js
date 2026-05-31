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

function toolSchemasFor(activeId, ctx, legacy) {
  const p = resolvePlugin(activeId);
  if (!p) return legacy();

  let tools = p.getTools().map((t) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || { type: 'object', properties: {} },
  }));

  // Merge admin overlay tools if user is admin
  if (ctx && ctx.isAdmin) {
    const adminOverlay = resolvePlugin('admin');
    if (adminOverlay) {
      const adminTools = adminOverlay.getTools().map((t) => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      }));
      tools = [...tools, ...adminTools];
    }
  }

  return tools;
}

async function executeToolFor(activeId, name, params, ctx, legacy) {
  const p = resolvePlugin(activeId);
  if (!p) return legacy(name, params, ctx);

  // First try the vertical's tools
  try {
    return await p.executeTool(name, params, ctx);
  } catch (e) {
    // If tool not found in vertical and user is admin, try admin overlay
    if (ctx?.isAdmin) {
      const adminOverlay = resolvePlugin('admin');
      if (adminOverlay) {
        try {
          return await adminOverlay.executeTool(name, params, ctx);
        } catch (adminErr) {
          return { result: { error: `tool "${name}" failed: ${adminErr.message}` }, render: 'text' };
        }
      }
    }
    return { result: { error: `tool "${name}" failed: ${e.message}` }, render: 'text' };
  }
}

function authzFor(activeId, ctx, legacy) {
  const p = resolvePlugin(activeId);
  let authz = p ? p.getAuthz() : legacy();

  // Merge admin overlay authz rules if user is admin
  if (ctx && ctx.isAdmin) {
    const adminOverlay = resolvePlugin('admin');
    if (adminOverlay) {
      authz = { ...authz, ...adminOverlay.getAuthz() };
    }
  }

  return authz;
}

module.exports = {
  resolvePlugin, hasPlugin,
  heuristicsFor, systemPromptFor, toolSchemasFor, executeToolFor, authzFor,
};
