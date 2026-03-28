// banking_api_server/routes/mcpInspector.js
/**
 * Authenticated MCP Inspector — demo of discovery (tools/list) and execution (tools/call)
 * via the Backend-for-Frontend (BFF) MCP Host proxy, without exposing raw tokens to the browser.
 */
const express = require('express');
const router = express.Router();
const configStore = require('../services/configStore');
const { resolveMcpAccessTokenWithEvents } = require('../services/agentMcpTokenService');
const {
  MCP_TOOL_SCOPES,
  getMcpServerUrl,
  getSessionBearerForMcp,
  mcpListTools,
  mcpCallTool,
} = require('../services/mcpWebSocketClient');
const { callToolLocal, listLocalInspectorTools } = require('../services/mcpLocalTools');

const MCP_SESSION_NEEDED_MSG =
  'MCP discovery needs a real OAuth access token in your Backend-for-Frontend (BFF) session. If you see this after a cold open, sign out and sign in again. Cookie-only restored sessions cannot call the MCP server.';

/** Stable JSON body for 401s (browser often shows only generic status text). */
function authRequired(res, message = MCP_SESSION_NEEDED_MSG) {
  return res.status(401).json({
    error: 'authentication_required',
    message,
  });
}

/** Discovery uses same token resolution as tools/call (scope from a representative tool). */
async function sessionTokenForDiscovery(req) {
  const { token, userSub } = await resolveMcpAccessTokenWithEvents(req, 'get_my_accounts');
  return { token, userSub };
}

/** True when the MCP WebSocket is expected to be unreachable (align with server.js POST /api/mcp/tool). */
function isMcpUnreachableError(err) {
  if (err && err.useLocal) return true;
  const msg = (err && err.message) || '';
  return (
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENETUNREACH') ||
    msg.includes('timed out') ||
    msg.includes('connect ETIMEDOUT') ||
    (err.code && ['ECONNREFUSED', 'ENETUNREACH', 'ETIMEDOUT'].includes(err.code))
  );
}

// GET /api/mcp/inspector/context — architecture + config hints for the demo UI
router.get('/context', async (req, res) => {
  try {
    await configStore.ensureInitialized();
    const mcpResourceUri = configStore.getEffective('mcp_resource_uri');
    const langchainInspectorUrl =
      process.env.REACT_APP_LANGCHAIN_INSPECTOR_URL || 'http://localhost:8081/inspector/mcp-host';
    const langchainWsPort = process.env.LANGCHAIN_WEBSOCKET_PORT || '8080';

    res.json({
      role: 'mcp_host_proxy',
      description:
        'Banking Backend-for-Frontend (BFF) acts as MCP Host for the browser: session cookie auth, optional RFC 8693 token exchange, then WebSocket JSON-RPC to the MCP server.',
      transport: { clientToBff: 'HTTPS + session cookie', bffToMcp: 'WebSocket JSON-RPC 2.0' },
      mcpProtocolVersion: '2024-11-05',
      mcpServerConfigured: !!getMcpServerUrl(),
      tokenExchangeEnabled: !!mcpResourceUri,
      bankingAgentInspectorUrl: langchainInspectorUrl,
      langchain_chat_websocket_port: langchainWsPort,
      /** Side-by-side demo narrative: two MCP Hosts, one MCP server + one protected Banking API */
      mcpHosts: {
        bff: {
          id: 'bff',
          title: 'MCP Host — Backend-for-Frontend (BFF), browser / React',
          audience: 'End users signing in through the web app.',
          pingOneOAuth:
            'Authorization Code + PKCE → tokens stored in httpOnly server session on the Backend-for-Frontend (BFF). Browser does not hold access tokens for MCP.',
          tokenExchange:
            mcpResourceUri
              ? 'RFC 8693 token exchange before MCP: narrow scopes + MCP audience + act/delegation (configured).'
              : 'Token exchange not configured (MCP_SERVER_RESOURCE_URI empty) — demo may pass session token to MCP as today.',
          mcpClientTransport: 'Backend-for-Frontend (BFF) opens WebSocket JSON-RPC (initialize → tools/list / tools/call).',
          bestForShowing:
            'PingOne + OAuth for humans, session-bound tokens, and why exchange + least privilege protect backends from the browser.',
        },
        langchain: {
          id: 'langchain',
          title: 'MCP Host — LangChain (AI agent)',
          audience: 'Autonomous chat agent and MCP client in Python.',
          pingOneOAuth:
            'Client credentials (ai_agent) for the agent; user context via CIBA / session flows as designed — not the React session cookie.',
          tokenExchange:
            'Target pattern: exchange user/agent context for MCP-scoped tokens (see ARCHITECTURE.md); complements Backend-for-Frontend (BFF) for non-browser actors.',
          mcpClientTransport:
            `WebSocket to MCP with Bearer on connect; chat UI uses separate WebSocket (port ${langchainWsPort}).`,
          bestForShowing:
            'How an AI agent acts as MCP client, uses tools, and still reaches the same MCP server that enforces introspection and scopes.',
          inspectorJsonUrl: langchainInspectorUrl,
        },
        shared: {
          mcpServer:
            'Same banking_mcp_server: initialize, tools/list, tools/call → validates tokens (PingOne introspection), scopes, then Banking REST API.',
          bankingApi:
            'Banking API remains behind Bearer validation + scope checks — not called directly from the browser for MCP tool execution.',
        },
      },
      flow: [
        '1. User authenticates → OAuth tokens stored in httpOnly session on the Backend-for-Frontend (BFF).',
        '2. Discovery: Backend-for-Frontend (BFF) sends initialize + tools/list over WebSocket to MCP server.',
        '3. Execution: LLM or Inspector selects a tool → Backend-for-Frontend (BFF) sends tools/call with delegated token when configured.',
        '4. MCP server introspects token, checks scopes, calls Banking API with Bearer token — backend stays behind MCP + API auth.',
      ],
    });
  } catch (err) {
    console.error('[MCP Inspector] context error:', err.message);
    res.status(500).json({ error: 'inspector_context_failed', message: err.message });
  }
});

// GET /api/mcp/inspector/tools — live tools/list from MCP server, or local catalog when no MCP bearer / MCP down
router.get('/tools', async (req, res) => {
  const effectiveUserId = req.session?.user?.id || req.user?.id || null;
  const mcpUrl = getMcpServerUrl();
  const isLocalDefault = mcpUrl === 'ws://localhost:8080' && !process.env.MCP_SERVER_URL;

  const respondLocalCatalog = (reason) => {
    return res.json({
      timingsMs: { roundTrip: 0 },
      tools: listLocalInspectorTools(),
      nextCursor: undefined,
      _source: 'local_catalog',
      _localCatalogReason: reason,
    });
  };

  try {
    await configStore.ensureInitialized();

    if (!getSessionBearerForMcp(req)) {
      return respondLocalCatalog('no_mcp_bearer_cookie_only_or_missing_token');
    }

    let agentToken;
    let userSub;
    try {
      ({ token: agentToken, userSub } = await sessionTokenForDiscovery(req));
    } catch (err) {
      return res.status(502).json({ error: 'token_resolution_failed', message: err.message });
    }
    if (!agentToken) {
      return respondLocalCatalog('token_resolution_yielded_null');
    }

    if (isLocalDefault && process.env.VERCEL) {
      return respondLocalCatalog('MCP_SERVER_URL not set on Vercel; localhost MCP unreachable');
    }

    const started = Date.now();
    try {
      const result = await mcpListTools(agentToken, userSub);
      const durationMs = Date.now() - started;
      return res.json({
        timingsMs: { roundTrip: durationMs },
        tools: result.tools || [],
        nextCursor: result.nextCursor,
        _source: 'mcp_server',
      });
    } catch (err) {
      if (isMcpUnreachableError(err) && effectiveUserId) {
        console.warn('[MCP Inspector] tools/list MCP unreachable, using local catalog:', err.message);
        return respondLocalCatalog(`mcp_unreachable: ${err.message}`);
      }
      throw err;
    }
  } catch (err) {
    console.error('[MCP Inspector] tools/list error:', err.message);
    res.status(502).json({ error: 'mcp_discovery_failed', message: err.message });
  }
});

// POST /api/mcp/inspector/invoke — tools/call with inspector metadata (demo); local handler when no MCP bearer or MCP down
router.post('/invoke', express.json(), async (req, res) => {
  const { tool, params } = req.body || {};
  if (!tool || typeof tool !== 'string') {
    return res.status(400).json({ error: 'tool name is required' });
  }

  const effectiveUserId = req.session?.user?.id || req.user?.id || null;
  const mcpUrl = getMcpServerUrl();
  const isLocalDefault = mcpUrl === 'ws://localhost:8080' && !process.env.MCP_SERVER_URL;

  const respondLocalInvoke = async () => {
    if (!effectiveUserId) {
      return authRequired(res);
    }
    const started = Date.now();
    const result = await callToolLocal(tool, params || {}, effectiveUserId);
    const durationMs = Date.now() - started;
    return res.json({
      result,
      _localFallback: true,
      inspector: {
        tool,
        durationMs,
        phases: ['local handler (in-process, no MCP WebSocket)'],
        tokenExchangeApplied: false,
        requiredScopesHint: MCP_TOOL_SCOPES[tool] || ['banking:read'],
      },
    });
  };

  try {
    await configStore.ensureInitialized();

    if (!getSessionBearerForMcp(req)) {
      return await respondLocalInvoke();
    }

    let agentToken;
    let userSub;
    try {
      ({ token: agentToken, userSub } = await resolveMcpAccessTokenWithEvents(req, tool));
    } catch (err) {
      const status = err.httpStatus || 502;
      return res.status(status).json({
        error: err.code || 'token_resolution_failed',
        message: err.message,
        tokenEvents: err.tokenEvents || [],
      });
    }
    if (!agentToken) {
      return await respondLocalInvoke();
    }

    if (isLocalDefault && process.env.VERCEL) {
      return await respondLocalInvoke();
    }

    const started = Date.now();
    try {
      const result = await mcpCallTool(tool, params || {}, agentToken, userSub);
      const durationMs = Date.now() - started;

      return res.json({
        result,
        inspector: {
          tool,
          durationMs,
          phases: ['initialize (WebSocket)', 'tools/call'],
          tokenExchangeApplied: !!configStore.getEffective('mcp_resource_uri'),
          requiredScopesHint: MCP_TOOL_SCOPES[tool] || ['banking:read'],
        },
      });
    } catch (err) {
      if (isMcpUnreachableError(err) && effectiveUserId) {
        console.warn(`[MCP Inspector] invoke ${tool} — MCP unreachable, local handler:`, err.message);
        return await respondLocalInvoke();
      }
      throw err;
    }
  } catch (err) {
    console.error(`[MCP Inspector] invoke ${tool}:`, err.message);
    res.status(502).json({ error: 'mcp_invoke_failed', message: err.message });
  }
});

module.exports = router;
