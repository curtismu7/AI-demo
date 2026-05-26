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
const { agentSessionMiddleware } = require('../middleware/agentSessionMiddleware');

const router = express.Router();
router.use(agentSessionMiddleware);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAgentServiceTarget() {
  return {
    hostname: process.env.AGENT_SERVICE_HOST || '127.0.0.1',
    port: parseInt(process.env.AGENT_SERVICE_PORT || '3006', 10),
  };
}

function getInternalSecret() {
  return process.env.BFF_INTERNAL_SECRET || 'dev-shared-secret-change-me';
}

// ---------------------------------------------------------------------------
// POST /api/agent/run
// ---------------------------------------------------------------------------

router.post('/run', async (req, res) => {
  // Feature flag check
  const aguiEnabled = configStore.getEffective('ff_agui_enabled');
  if (aguiEnabled === 'false' || aguiEnabled === false) {
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

  // bffToolUrl is wired in Step 3 (when BFF tool execution endpoint exists)
  // For now it's undefined so agent service uses stub results
  const bffToolUrl = undefined; // TODO Step 3: set to internal BFF tool endpoint

  // ---------------------------------------------------------------------------
  // Step D: build the RunAgentInput payload
  // ---------------------------------------------------------------------------
  const agentPayload = {
    threadId,
    runId,
    messages,
    tools,
    context: {
      bffToolUrl,
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

  const { hostname: agentHost, port: agentPort } = getAgentServiceTarget();
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
