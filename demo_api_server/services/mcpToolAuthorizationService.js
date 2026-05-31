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
const hitlServiceClient = require('./hitlServiceClient');

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
  const mcpEp = configStore.get('authorize_mcp_decision_endpoint_id');
  const hasMcpEndpoint = !!(mcpEp && String(mcpEp).trim());
  const pingoneReady = pingOneAuthorizeService.isMcpDelegationDecisionReady();
  const sim = simulatedAuthorizeService.isSimulatedModeEnabled(configStore);

  return {
    mcpFirstToolGateEnabled: true,
    mcpFirstToolDecisionEndpointConfigured: hasMcpEndpoint,
    mcpFirstToolPingOneReady: pingoneReady,
    mcpFirstToolWouldRunSimulated: sim,
    mcpFirstToolWouldRunLive: !sim && pingoneReady,
    mcpFirstToolLivePendingConfig: !sim && !pingoneReady,
  };
}

/** Map MCP write tool names to transaction types for amount-based policy evaluation. */
const WRITE_TOOL_TYPE_MAP = {
  create_transfer: 'transfer',
  create_deposit: 'deposit',
  create_withdrawal: 'withdrawal',
};

/**
 * Run MCP Authorize gate on every tool call when enabled. Evaluates aud/scope
 * from the token and business rules (e.g. HITL for transfers over threshold).
 *
 * @param {object} opts
 * @param {import('express').Request} opts.req
 * @param {string} opts.tool
 * @param {string|null|undefined} opts.agentToken - MCP access JWT
 * @param {string|null|undefined} opts.userSub - PingOne user id from resolver
 * @param {string} [opts.userAcr] - from session user
 * @param {object} [opts.toolParams] - raw tool params (used for amount on write tools)
 * @param {string} [opts.hitlChallengeId] - On a HITL retry, the challenge id the
 *   agent echoes back. The gate verifies it against the canonical HITL service
 *   (3009) — approved + not-expired + bound to THIS user/agent/tool — and only
 *   then treats the HITL_CONSENT gate as discharged. A missing/invalid/forged id
 *   fails closed (re-challenge), never PERMIT. This is the ONLY place hitlApproved
 *   is derived; it is never accepted as a raw client flag.
 * @returns {Promise<
 *   | { ran: false }
 *   | { ran: true, permit: true, evaluation: object }
 *   | { ran: true, block: { status: number, body: object } }
 *   | { ran: true, simulatedError: Error }
 *   | { ran: true, pingoneError: Error }
 * >}
 */
async function evaluateMcpFirstToolGate({ req, tool, agentToken, userSub, userAcr, toolParams, hitlChallengeId = null }) {
  if (!agentToken || typeof agentToken !== 'string') {
    return { ran: false, reason: 'no_agent_token' };
  }

  if (req.session?.user?.role === 'admin') {
    return { ran: false, reason: 'admin_role_exempt' };
  }

  // Extract amount and transaction type from params for write-tool policy evaluation
  const transactionType = WRITE_TOOL_TYPE_MAP[tool] || null;
  const toolAmount = transactionType && toolParams
    ? parseFloat(toolParams.amount || 0)
    : null;

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

  // ── HITL receipt verification (the ONLY place hitlApproved is derived) ──────
  // On a retry the agent echoes back the challenge id. Verify it against the
  // canonical HITL service (3009): approved + not-expired + bound to THIS
  // user (subjectId) and agent (actClientId) and tool. Only a verified receipt
  // discharges the HITL_CONSENT gate in the engines below. Fail CLOSED — any
  // error, mismatch, or non-approved status leaves hitlApproved=false, so the
  // engine re-challenges (428) rather than PERMITting. Never trust a raw flag.
  let hitlApproved = false;
  if (hitlChallengeId) {
    try {
      const status = await hitlServiceClient.getChallengeStatus(hitlChallengeId);
      const verification = hitlServiceClient.verifyHitlReceipt(
        status,
        subjectId,
        actClientId || undefined,
        tool,
      );
      hitlApproved = verification.ok === true;
      if (!hitlApproved) {
        console.warn(
          `[MCP Authorize] HITL receipt rejected for tool=${tool} reason=${verification.message} — re-challenging`,
        );
      }
    } catch (err) {
      console.warn(
        `[MCP Authorize] HITL receipt verification failed (fail-closed, re-challenge): ${err.message}`,
      );
      hitlApproved = false;
    }
  }

  // EXPECTED audience the BFF passes to the policy. The policy compares this
  // against the bearer token's `aud` to catch step-skipping (an attacker
  // sending an intermediate-step token directly to MCP). The expected aud
  // depends on which exchange flow is active:
  //   Gateway mode (MCP_GATEWAY_HTTP_URL set) → pingone_resource_mcp_gateway_uri (gateway audience)
  //   Single-Exchange (FF off) → mcp_resource_uri (e.g. "mcpserver.ping.demo")
  //   Two-Exchange (FF on)     → pingone_resource_two_exchange_uri (e.g. "final.2x.ping.demo")
  // Both authorization-server implementations (simulated + PingOne) receive
  // the same expected aud and must enforce the same audience-match rule.
  const twoExchangeOn = configStore.getEffective('ff_two_exchange_delegation') !== 'false';
  // useGateway: only true when explicitly configured (env var or persisted SQLite value).
  // Intentionally excludes FIELD_DEFS defaults — a default gateway URL doesn't mean the
  // gateway is deployed, so we must not switch audience resolution based on it.
  const useGateway = !!(process.env.MCP_GATEWAY_HTTP_URL || configStore.get('mcp_gateway_http_url'));
  const mcpResourceUri = useGateway
    ? (configStore.getEffective('pingone_resource_mcp_gateway_uri') || '')
    : twoExchangeOn
      ? (configStore.getEffective('pingone_resource_two_exchange_uri')
          || configStore.getEffective('mcp_resource_uri')
          || '')
      : (configStore.getEffective('mcp_resource_uri') || '');

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
        amount: toolAmount,
        transactionType,
        hitlApproved,
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

      if (r.hitlRequired && hitlApproved) {
        return {
          ran: true,
          block: {
            status: 403,
            body: {
              error: 'mcp_hitl_receipt_rejected',
              error_description:
                'HITL receipt accepted but authorization engine still requires approval — possible policy misconfiguration.',
              authorize_engine: 'simulated',
              decisionContext: 'McpFirstTool',
              decisionId: r.decisionId,
            },
          },
        };
      }

      if (r.hitlRequired) {
        return {
          ran: true,
          block: {
            status: 428,
            body: {
              error: 'mcp_hitl_required',
              error_description:
                'Simulated authorization policy requires human approval before MCP tools (education mode).',
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
              deny_reason: r.raw?.reason || null,
              deny_parameters: r.raw?.parameters || null,
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
      amount: toolAmount,
      transactionType,
      hitlApproved,
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

    if (r.hitlRequired && hitlApproved) {
      return {
        ran: true,
        block: {
          status: 403,
          body: {
            error: 'mcp_hitl_receipt_rejected',
            error_description:
              'HITL receipt accepted but authorization engine still requires approval — possible policy misconfiguration.',
            authorize_engine: 'pingone',
            decisionContext: 'McpFirstTool',
            decisionId: r.decisionId,
          },
        },
      };
    }

    if (r.hitlRequired) {
      return {
        ran: true,
        block: {
          status: 428,
          body: {
            error: 'mcp_hitl_required',
            error_description:
              'PingOne Authorize requires human approval before MCP tools can run.',
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
            deny_reason: r.raw?.reason || null,
            deny_parameters: r.raw?.parameters || null,
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
