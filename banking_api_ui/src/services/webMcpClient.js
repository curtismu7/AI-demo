// banking_api_ui/src/services/webMcpClient.js
/**
 * Browser-side MCP client service.
 *
 * Communicates with the existing MCP server through the BFF proxy.
 * The BFF handles WebSocket transport to the MCP server — the browser
 * uses HTTP + SSE which is the practical browser pattern.
 *
 * Endpoints used (all pre-existing in BFF):
 *   GET  /api/mcp/inspector/tools         → tool catalog
 *   POST /api/mcp/tool                    → call a tool
 *   GET  /api/mcp/tool/events?trace=<id>  → SSE stream of pipeline phases
 */

/**
 * Fetch the list of available MCP tools from the BFF.
 * @returns {Promise<{ tools: Array<{ name: string, description: string, inputSchema: object }> }>}
 */
export async function listMcpTools() {
  const res = await fetch('/api/mcp/inspector/tools', {
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`listMcpTools failed: ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

/**
 * Call an MCP tool via the BFF proxy.
 * @param {string} toolName   - registered tool name
 * @param {object} params     - tool input parameters
 * @param {string} flowTraceId - UUID linking POST and SSE stream
 * @returns {Promise<object>}  - tool result JSON
 */
export async function callMcpTool(toolName, params, flowTraceId) {
  const res = await fetch('/api/mcp/tool', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: toolName, params, flowTraceId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`callMcpTool failed: ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

/**
 * Open an SSE stream for a tool call's pipeline phases.
 * Mirrors the pattern from mcpFlowSseClient.js — the BFF pushes events
 * over its WebSocket connection to the MCP server and relays them as SSE.
 *
 * @param {string} traceId        - UUID matching the flowTraceId on POST
 * @param {(data: object) => void} onEvent - called for each parsed SSE message
 * @returns {() => void} disconnect (idempotent)
 */
export function openMcpToolStream(traceId, onEvent) {
  if (!traceId || typeof onEvent !== 'function') {
    return () => {};
  }
  const url = `/api/mcp/tool/events?trace=${encodeURIComponent(traceId)}`;
  let es;
  try {
    es = new EventSource(url);
  } catch (_) {
    return () => {};
  }

  const handleMessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      onEvent(data);
      if (data && data.phase === 'stream_end' && es) {
        es.close();
      }
    } catch (_) {
      /* ignore malformed chunks */
    }
  };

  es.addEventListener('message', handleMessage);
  es.onerror = () => {
    try { es.close(); } catch (_) {}
  };

  return () => {
    try { es.close(); } catch (_) {}
  };
}
