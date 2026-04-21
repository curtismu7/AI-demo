// banking_api_server/routes/mcpToolScopes.js
/**
 * GET /api/mcp/tool-scopes — unauthenticated tool-scope discovery.
 * Returns the canonical list of MCP tools and the OAuth scopes each requires.
 * Used by authorize flows, UI pre-auth components, and tests to determine
 * which scopes to request before calling a given tool.
 */
const express = require('express');
const router = express.Router();
const { listLocalInspectorTools } = require('../services/mcpLocalTools');

router.get('/tool-scopes', (req, res) => {
  try {
    const tools = listLocalInspectorTools();
    const toolScopes = tools.map(t => ({
      name: t.name,
      title: t.title || t.name,
      requiredScopes: t.requiredScopes || [],
      readOnly: t.readOnly ?? true,
    }));
    res.json({ tools: toolScopes });
  } catch (err) {
    console.error('[mcpToolScopes] failed to list tool scopes:', err.message);
    res.status(500).json({ error: 'tool_scope_discovery_failed', message: err.message });
  }
});

module.exports = router;
