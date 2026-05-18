'use strict';

/**
 * runMcpToolPipeline — pure orchestration of a BFF MCP tool call (ADR-0004).
 * Returns a discriminated Outcome; never touches Express res/req response APIs.
 * Built up path-by-path under characterization tests.
 * @param {object} ctx { tool, params, flowTraceId, startTime, req, deps }
 * @returns {Promise<object>} Outcome { kind:'result'|'block'|'error', httpStatus, body, tokenEvents? }
 */
async function runMcpToolPipeline(ctx) {
  const { tool, params, req, deps } = ctx;
  const { config } = deps;

  // ── PingOne admin tool early-exit ──────────────────────────────────────────
  if (config.pingoneAdminEnabled && config.pingoneAdminTools.has(tool)) {
    deps.emit({ phase: 'mcp_pingone_admin_tool' });
    try {
      const p1UserSub = (req.session?.user?.oauthId || req.session?.user?.id) || null;
      const result = await deps.stdioAdapter.callToolViaStdio(tool, params || {}, '', p1UserSub, req.correlationId);
      deps.emit({ phase: 'mcp_remote_done' });
      return { kind: 'result', httpStatus: 200, body: { result, tokenEvents: [] }, tokenEvents: [] };
    } catch (err) {
      deps.emit({ phase: 'mcp_remote_error' });
      console.error('[PingOne MCP] %s failed: %s', tool, err.message);
      return { kind: 'error', httpStatus: 502, body: { error: 'pingone_mcp_error', message: err.message } };
    }
  }

  throw new Error('runMcpToolPipeline: path not yet implemented');
}

module.exports = { runMcpToolPipeline };
