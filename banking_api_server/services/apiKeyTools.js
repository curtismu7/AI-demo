// banking_api_server/services/apiKeyTools.js
// MUST stay in sync with banking_mcp_gateway/src/router.ts APIKEY_TOOLS.
// api_key-disposition tools: the GATEWAY dispatches these to a backend via
// X-API-Key (Phase 266 Path A / Phase 267). They have NO RFC 8693 delegation
// chain — the BFF must NOT attempt token exchange for them; it forwards the
// plain user token and the gateway swaps to X-API-Key.
const API_KEY_TOOLS = new Set(['show_mortgage']);

function isApiKeyTool(tool) {
  return API_KEY_TOOLS.has(tool);
}

module.exports = { API_KEY_TOOLS, isApiKeyTool };
