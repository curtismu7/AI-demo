/**
 * mcpToolAuthorizationService.js
 *
 * PingOne Authorize (or simulated) on **first MCP tool use** per browser session — see
 * docs/PINGONE_AUTHORIZE_PLAN.md §7. Invoked from POST /api/mcp/tool after MCP access
 * token resolution, before the WebSocket tool call.
 */

'use strict';

const configStore = require('./configStore');
const pingOneAuthorizeService = require('./pingOneAuthorizeService');
const simulatedAuthorizeService = require('./simulatedAuthorizeService');
const { decodeJwtClaims } = require('./agentMcpTokenService');

/**
 * Extract nested actor id from MCP JWT (RFC 8693 multi-hop) when PingOne issues act.act.
 * @param {object|null|undefined} act
 * @returns {string}
 */
function nestedActIdFromClaim(act) {
  if (!act || typeof act !== 'object') return '';
  const inner = act.act;
  if (!inner || typeof inner !== 'object') return '';
  return String(inner.client_id || inner.sub || '');
}

/**
 * Status for admin /api/authorize/evaluation-status (no secrets).
 */
function getMcpFirstToolGateStatus() {
  const flag =
    configStore.get('ff_authorize_mcp_first_tool') === true ||
    configStore.get('ff_authorize_mcp_first_tool') === 'true';
  const mcpEp = configStore.get('authorize_mcp_decision_endpoint_id');
  const hasMcpEndpoint = !!(mcpEp && String(mcpEp).trim());
  const pingoneReady = pingOneAuthorizeService.isMcpDelegationDecisionReady();
  const sim = simulatedAuthorizeService.isSimulatedModeEnabled(configStore);

  return {
    mcpFirstToolGateEnabled: flag,
    mcpFirstToolDecisionEndpointConfigured: hasMcpEndpoint,
    mcpFirstToolPingOneReady: pingoneReady,
    mcpFirstToolWouldRunSimulated: flag && sim,
    mcpFirstToolWouldRunLive: flag && !sim && pingoneReady,
    mcpFirstToolLivePendingConfig: flag && !sim && !pingoneReady,
  };
}

/**
 * Run MCP first-tool Authorize gate when enabled; skip if already satisfied this session or no token.
 *
 * @param {object} opts
 * @param {import('express').Request} opts.req
 * @param {string} opts.tool
 * @param {string|null|undefined} opts.agentToken - MCP access JWT
 * @param {string|null|undefined} opts.userSub - PingOne user id from resolver
 * @param {string} [opts.userAcr] - from session user
 * @returns {Promise<
 *   | { ran: false }
 *   | { ran: true, permit: true, evaluation: object }
 *   | { ran: true, block: { status: number, body: object } }
 *   | { ran: true, simulatedError: Error }
 *   | { ran: true, pingoneError: Error }
 * >}
 */
async function evaluateMcpFirstToolGate({ req, tool, agentToken, userSub, userAcr }) {
  const flag =
    configStore.get('ff_authorize_mcp_first_tool') === true ||
    configStore.get('ff_authorize_mcp_first_tool') === 'true';

  if (!flag) {
    return { ran: false };
  }

  if (!agentToken || typeof agentToken !== 'string') {
    return { ran: false };
  }

  if (req.session?.mcpFirstToolAuthorizeDone) {
    return { ran: false };
  }

  if (req.session?.user?.role === 'admin') {
    return { ran: false };
  }

  const USE_SIMULATED = simulatedAuthorizeService.isSimulatedModeEnabled(configStore);
  const FAIL_OPEN = configStore.get('ff_authorize_fail_open') !== 'false';

  // PAZ Trust Framework parameter map (see docs/PINGONE_AUTHORIZE_PLAN.md §MCP Delegation):
  // JWT aud                              → TokenAudience
  // JWT act.client_id || act.sub         → ActClientId     (RFC 8693 §4.1 canonical: act.sub)
  // JWT act.act.client_id || act.act.sub → NestedActClientId
  // configStore mcp_resource_uri         → McpResourceUri
  const decoded = decodeJwtClaims(agentToken);
  const claims = decoded?.claims || {};
  const subjectId = userSub || claims.sub || '';
  const tokenAudience = claims.aud != null ? (Array.isArray(claims.aud) ? claims.aud.join(' ') : String(claims.aud)) : '';
  // RFC 8693 §4.1: act.sub is the canonical actor identifier.
  // act.client_id is PingOne-specific; fall back to act.sub when absent.
  const actClientId = claims.act && typeof claims.act === 'object'
    ? String(claims.act.client_id || claims.act.sub || '')
    : '';
  const nestedActClientId = nestedActIdFromClaim(claims.act);
  const mcpResourceUri = configStore.getEffective('mcp_resource_uri') || '';

  try {
    if (USE_SIMULATED) {
      const r = await simulatedAuthorizeService.evaluateMcpFirstTool({
        userId: subjectId,
        toolName: tool,
        tokenAudience,
        actClientId,
        nestedActClientId,
        mcpResourceUri,
        acr: userAcr,
      });

      if (r.stepUpRequired) {
        return {
          ran: true,
          block: {
            status: 428,
            body: {
              error: 'mcp_step_up_required',
              error_description:
                'Simulated authorization policy requires step-up before MCP tools (education mode).',
              authorize_engine: 'simulated',
              decisionContext: 'McpFirstTool',
              decisionId: r.decisionId,
            },
          },
        };
      }

      if (r.decision === 'DENY') {
        return {
          ran: true,
          block: {
            status: 403,
            body: {
              error: 'mcp_authorization_denied',
              error_description:
                'MCP tool access was denied by the simulated authorization policy (education mode).',
              authorize_engine: 'simulated',
              decisionContext: 'McpFirstTool',
              decisionId: r.decisionId,
            },
          },
        };
      }

      return {
        ran: true,
        permit: true,
        evaluation: {
          engine: 'simulated',
          decision: r.decision,
          path: r.path,
          decisionId: r.decisionId,
          decisionContext: 'McpFirstTool',
        },
      };
    }

    if (!pingOneAuthorizeService.isMcpDelegationDecisionReady()) {
      console.warn(
        '[MCP Authorize] ff_authorize_mcp_first_tool is on but authorize_mcp_decision_endpoint_id ' +
          '(or worker credentials) is missing — skipping live PingOne MCP gate. Configure a dedicated ' +
          'decision endpoint or enable Simulated Authorize.',
      );
      return { ran: false };
    }

    const r = await pingOneAuthorizeService.evaluateMcpToolDelegation({
      userId: subjectId,
      toolName: tool,
      tokenAudience,
      actClientId,
      nestedActClientId,
      mcpResourceUri,
      acr: userAcr,
    });

    if (r.stepUpRequired) {
      return {
        ran: true,
        block: {
          status: 428,
          body: {
            error: 'mcp_step_up_required',
            error_description:
              'PingOne Authorize requires additional authentication before MCP tools can run.',
            authorize_engine: 'pingone',
            decisionContext: 'McpFirstTool',
            decisionId: r.decisionId,
          },
        },
      };
    }

    if (r.decision === 'DENY') {
      return {
        ran: true,
        block: {
          status: 403,
          body: {
            error: 'mcp_authorization_denied',
            error_description: 'PingOne Authorize denied MCP tool access for this session.',
            authorize_engine: 'pingone',
            decisionContext: 'McpFirstTool',
            decisionId: r.decisionId,
          },
        },
      };
    }

    return {
      ran: true,
      permit: true,
      evaluation: {
        engine: 'pingone',
        decision: r.decision,
        path: r.path,
        decisionId: r.decisionId,
        decisionContext: 'McpFirstTool',
      },
    };
  } catch (err) {
    if (USE_SIMULATED) {
      return { ran: true, simulatedError: err };
    }
    if (FAIL_OPEN) {
      console.warn(`[MCP Authorize] PingOne error — fail open (ff_authorize_fail_open): ${err.message}`);
      return { ran: false };
    }
    return { ran: true, pingoneError: err };
  }
}

module.exports = {
  evaluateMcpFirstToolGate,
  getMcpFirstToolGateStatus,
  nestedActIdFromClaim,
};
