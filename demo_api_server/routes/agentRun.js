/**
 * POST /api/agent/run
 *
 * AG-UI (Step 2) — BFF proxy for the agent SSE stream.
 *
 * Responsibilities:
 *  1. Session auth gate (user must have a valid session token)
 *  2. Fetch available tools via agentGatewayClient (same as /api/agent/init)
 *  3. Build initialTokenEvents from session (via agentMcpTokenService preview)
 *  4. Forward to agent service POST /run with BFF_INTERNAL_SECRET
 *  5. Pipe the SSE stream back to the browser verbatim
 *
 * The BFF never sends raw tokens to the browser. Token custody rule preserved:
 * - Agent service receives a bffToolUrl (Step 3 wires this) for tool execution
 * - Token events in STATE_SNAPSHOT contain only decoded claims, never raw JWTs
 *
 * Feature flag: ff_agui_enabled (configStore). Falls back to 404 if disabled.
 */

'use strict';

const express = require('express');
const http = require('http');
const configStore = require('../services/configStore');
const { verticalManifest } = require('../services/verticalManifest');
const verticalDispatch = require('../services/verticalDispatch');
const { agentSessionMiddleware } = require('../middleware/agentSessionMiddleware');

const router = express.Router();
router.use(agentSessionMiddleware);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// LangChain agent runs three listeners: uvicorn :8888 (AG-UI /run SSE),
// websockets :8889 (legacy chat WS), health :8890. Proxy /run to :8888 — the
// previous 8889 routing hit the WebSocket port and silently failed because
// raw HTTP requests are closed by the websockets handler.
const FRAMEWORK_PORTS = {
  langchain:     8888,
  openai_agents: 8891,
  mastra:        8892,
  pydantic_ai:   8893,
};

function resolveAgentTarget() {
  const framework = configStore.getEffective('llm_framework') || 'langchain';
  const port = FRAMEWORK_PORTS[framework] ?? FRAMEWORK_PORTS.langchain;
  return {
    hostname: process.env.AGENT_SERVICE_HOST || '127.0.0.1',
    port,
  };
}

function getInternalSecret() {
  return process.env.BFF_INTERNAL_SECRET || 'dev-shared-secret-change-me';
}

// When the active vertical ships a plugin, external runtimes must see the
// vertical's own tool schemas (e.g. book_appointment), not the banking catalog.
function resolveAgentRunTools(currentTools, activeId) {
  return verticalDispatch.hasPlugin(activeId)
    ? verticalDispatch.toolSchemasFor(activeId, () => currentTools)
    : currentTools;
}

// ---------------------------------------------------------------------------
// POST /api/agent/run
// ---------------------------------------------------------------------------

router.post('/run', async (req, res) => {
  // Feature flag check
  const aguiEnabled = configStore.getEffective('ff_agui_enabled');
  if (aguiEnabled !== 'true' && aguiEnabled !== true) {
    return res.status(404).json({ error: 'AG-UI not enabled. Set ff_agui_enabled=true in config.' });
  }

  const { userId, accessToken, tokenEvents: sessionTokenEvents } = req.agentContext || {};
  if (!userId || !accessToken) {
    return res.status(401).json({ error: 'Session expired', agentInitRequired: true, need_auth: true });
  }

  // Parse request body
  const { threadId, runId, messages, resume } = req.body || {};
  if (!threadId || !runId || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'threadId, runId, and messages are required' });
  }

  // ---------------------------------------------------------------------------
  // Step A: resolve initial token events from session preview
  // ---------------------------------------------------------------------------
  let initialTokenEvents = [];
  try {
    const { buildSessionPreviewTokenEvents } = require('../services/agentMcpTokenService');
    const preview = await buildSessionPreviewTokenEvents(req);
    initialTokenEvents = preview.tokenEvents || [];
  } catch (err) {
    // Non-fatal: proceed without token events rather than blocking the agent
    console.error('[agentRun] Token preview failed:', err.message);
    initialTokenEvents = sessionTokenEvents || [];
  }

  // ---------------------------------------------------------------------------
  // Step B: resolve available tools
  // ---------------------------------------------------------------------------
  let tools = [];
  try {
    let ccTokenResult;
    try {
      const agentCCTokenService = require('../services/agentCCTokenService');
      ccTokenResult = await agentCCTokenService.getAgentCCToken(req);
    } catch (ccErr) {
      console.warn('[agentRun] CC token failed, using local tool catalog:', ccErr.message);
    }

    const agentGatewayClient = require('../services/agentGatewayClient');
    let toolsResult;
    if (ccTokenResult) {
      try {
        toolsResult = await agentGatewayClient.getAvailableTools(req, ccTokenResult.access_token);
      } catch (toolsErr) {
        console.warn('[agentRun] Gateway tools failed, falling back to local catalog:', toolsErr.message);
        toolsResult = { tools: agentGatewayClient.getLocalToolsCatalog(), tokenEvents: [] };
        // Append any token events from the failed tools request
        initialTokenEvents = [...initialTokenEvents, ...(toolsErr.tokenEvents || [])];
      }
    } else {
      toolsResult = { tools: agentGatewayClient.getLocalToolsCatalog(), tokenEvents: [] };
    }

    // Map to ReasonToolSchema shape { name, description, inputSchema }
    tools = (toolsResult.tools || []).map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    }));

    tools = resolveAgentRunTools(tools, verticalManifest.resolver.activeId());

    // Merge any token events from tools/list
    initialTokenEvents = [...initialTokenEvents, ...(toolsResult.tokenEvents || [])];
  } catch (err) {
    console.error('[agentRun] Tool resolution error:', err.message);
    // Non-fatal: run with no tools
  }

  // ---------------------------------------------------------------------------
  // Step C: resolve LLM provider config
  // ---------------------------------------------------------------------------
  const provider = configStore.getEffective('llm_provider') || process.env.AGENT_PROVIDER || 'anthropic';
  const model = configStore.getEffective('llm_model') || process.env.AGENT_MODEL || undefined;

  // bffToolUrl — URL the agent service uses to call back into the BFF for tool
  // execution with RFC 8693 token exchange (Step 8).
  //
  // Resolution order (cloud-safe):
  //   1. BFF_INTERNAL_TOOL_URL  — explicit override (e.g. Railway internal URL)
  //   2. BFF_BASE_URL           — BFF's own public origin (set on Vercel/Railway)
  //   3. Loopback fallback      — local dev without mkcert/HTTPS
  //
  // The /internal/agent-tool endpoint is gated by BFF_INTERNAL_SECRET regardless
  // of which origin is used — the secret is the security boundary, not the host.
  // Warn when BFF_BASE_URL is set without BFF_INTERNAL_TOOL_URL.
  // On platforms like Vercel, /internal/* is not rewritten to the BFF handler,
  // so BFF_BASE_URL alone is not sufficient — BFF_INTERNAL_TOOL_URL must be set
  // to the internal/private network address of the BFF.
  if (process.env.BFF_BASE_URL && !process.env.BFF_INTERNAL_TOOL_URL) {
    console.warn(
      '[agentRun] BFF_BASE_URL is set but BFF_INTERNAL_TOOL_URL is not. ' +
      'If /internal/* is not routed on your platform (e.g. Vercel), ' +
      'tool execution will fail. Set BFF_INTERNAL_TOOL_URL to the internal BFF URL.',
    );
  }
  const bffBase =
    process.env.BFF_INTERNAL_TOOL_URL ||
    (process.env.BFF_BASE_URL ? process.env.BFF_BASE_URL.replace(/\/$/, '') : null) ||
    `http://127.0.0.1:${process.env.BFF_PORT || process.env.PORT || 3001}`;
  const bffToolUrl = `${bffBase}/internal/agent-tool`;
  const sessionId = req.session && req.session.id;

  // ---------------------------------------------------------------------------
  // Step D: build the RunAgentInput payload
  // ---------------------------------------------------------------------------
  // Forward the active vertical's systemPromptFlavor to the agent service.
  // The agent (LangChain / OpenAI Agents / Mastra / Pydantic AI) injects it
  // into the first turn so the LLM replies in the active vertical's voice
  // (e.g. CareConnect uses "appointments / coverage / records" instead of
  // banking terminology). Without this forwarding the agent falls back to a
  // generic banking persona regardless of which vertical the user selected.
  // null when no active vertical resolves so the agent keeps its default.
  let verticalFlavor = null;
  try {
    const activeId = verticalManifest.resolver.activeId();
    if (activeId) {
      const resolved = verticalManifest.resolver.resolve(activeId);
      verticalFlavor = resolved && resolved.agent && resolved.agent.systemPromptFlavor
        ? resolved.agent.systemPromptFlavor
        : null;
    }
  } catch (_) {
    /* best-effort — never block /run on a manifest read */
  }

  const agentPayload = {
    threadId,
    runId,
    messages,
    tools,
    vertical_flavor: verticalFlavor,
    context: {
      bffToolUrl,
      sessionId,
      initialTokenEvents,
      provider,
      model,
    },
    ...(resume ? { resume } : {}),
  };

  // ---------------------------------------------------------------------------
  // Step E: set SSE headers and proxy stream from agent service
  // ---------------------------------------------------------------------------
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const { hostname: agentHost, port: agentPort } = resolveAgentTarget();
  const agentPath = '/run';

  const bodyStr = JSON.stringify(agentPayload);

  const options = {
    hostname: agentHost,
    port: agentPort,
    path: agentPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      'x-internal-gateway-secret': getInternalSecret(),
    },
  };

  // Abort on browser disconnect
  let agentReq;
  req.on('close', () => {
    if (agentReq) agentReq.destroy();
  });

  agentReq = http.request(options, (agentRes) => {
    // Non-200 from agent service — emit RUN_ERROR rather than piping raw JSON as SSE
    if (agentRes.statusCode !== 200) {
      let body = '';
      agentRes.on('data', (c) => { body += c; });
      agentRes.on('end', () => {
        console.error('[agentRun] Agent service returned HTTP', agentRes.statusCode, body.slice(0, 200));
        try {
          res.write('data: ' + JSON.stringify({
            type: 'RUN_ERROR',
            message: 'Agent service returned HTTP ' + agentRes.statusCode + ': ' + body.slice(0, 200),
            code: 'AGENT_HTTP_ERROR',
          }) + '\n\n');
        } catch (_) {}
        res.end();
      });
      return;
    }
    // Pipe SSE stream verbatim to browser
    agentRes.on('data', (chunk) => {
      res.write(chunk);
    });
    agentRes.on('end', () => {
      res.end();
    });
    agentRes.on('error', (err) => {
      console.error('[agentRun] Agent service stream error:', err.message);
      // Emit a RUN_ERROR event so the client knows something went wrong
      try {
        res.write('data: ' + JSON.stringify({
          type: 'RUN_ERROR',
          message: 'Agent service stream error: ' + err.message,
          code: 'STREAM_ERROR',
        }) + '\n\n');
      } catch (_) {}
      res.end();
    });
  });

  agentReq.on('error', (err) => {
    console.error('[agentRun] Agent service connection error:', err.message);
    try {
      res.write('data: ' + JSON.stringify({
        type: 'RUN_ERROR',
        message: 'Cannot reach agent service: ' + err.message,
        code: 'AGENT_UNREACHABLE',
      }) + '\n\n');
    } catch (_) {}
    res.end();
  });

  agentReq.write(bodyStr);
  agentReq.end();
});

module.exports = router;
// Exported for the framework-routing test so it asserts against the actual
// constants instead of a re-declared copy that can silently drift.
module.exports.FRAMEWORK_PORTS = FRAMEWORK_PORTS;
module.exports.__test = { resolveAgentRunTools };
