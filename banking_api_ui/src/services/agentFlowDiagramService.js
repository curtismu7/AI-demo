// banking_api_ui/src/services/agentFlowDiagramService.js
/**
 * Live state for the Agent → BFF → token exchange → MCP → tool flow diagram.
 * Updated from bankingAgentService (MCP tools) and BankingAgent (inspector tools/list).
 */

/** @typedef {'pending'|'active'|'done'|'error'} FlowStepStatus */

const listeners = new Set();

/** Max rows in the live server timeline (SSE). */
const MAX_SERVER_EVENTS = 40;

/** Human labels for BFF `phase` values (no secrets). */
const PHASE_LABELS = {
  request_accepted: 'BFF accepted MCP tool request',
  resolving_access_token: 'Resolving session token / RFC 8693 exchange',
  access_token_ready: 'Token ready for MCP proxy',
  access_token_error: 'Token resolution failed',
  no_bearer_token_branch: 'No bearer — evaluating local handler path',
  no_bearer_no_user: 'No bearer and no session user',
  local_tool_start: 'Running local tool handler',
  local_tool_done: 'Local handler finished',
  local_tool_error: 'Local handler error',
  authorize_gate_begin: 'PingOne Authorize gate (first tool)',
  authorize_denied: 'Authorize denied or step-up required',
  authorize_permitted: 'Authorize permitted',
  authorize_gate_skipped: 'Authorize gate skipped (already done, admin, or feature off)',
  authorize_simulated_error: 'Simulated authorize error',
  authorize_unavailable: 'PingOne Authorize unavailable',
  authorize_internal_error: 'Authorize gate internal error',
  introspection_begin: 'Session token introspection',
  introspection_skipped_no_session_token: 'Introspection skipped — no session bearer',
  introspection_inactive: 'Introspection: token inactive',
  introspection_active_ok: 'Introspection: token active',
  introspection_error_degraded: 'Introspection error (continuing)',
  introspection_not_configured: 'Introspection not configured',
  mcp_remote_skipped_vercel: 'Remote MCP skipped (serverless default)',
  mcp_remote_begin: 'MCP WebSocket tools/call',
  mcp_remote_done: 'MCP WebSocket call completed',
  mcp_remote_tool_error: 'MCP tool error (not connection)',
  mcp_remote_unreachable: 'MCP server unreachable',
  local_fallback_blocked_no_user: 'Local fallback blocked — no user',
  stream_end: 'Stream closed',
};

/** @type {{ visible: boolean, phase: string, toolName: string|null, steps: Array<{id: string, title: string, detail: string, status: FlowStepStatus}>, serverEvents: Array<{ phase: string, label: string, detail: string, t?: number }>, hint: string|null, updatedAt: number }} */
let state = {
  visible: false,
  phase: 'idle',
  toolName: null,
  steps: [],
  serverEvents: [],
  hint: null,
  updatedAt: 0,
};

function emit() {
  const snap = {
    ...state,
    steps: state.steps.map((s) => ({ ...s })),
    serverEvents: state.serverEvents.map((e) => ({ ...e })),
  };
  listeners.forEach((fn) => {
    try {
      fn(snap);
    } catch (_) {}
  });
}

function scopeSummary(ev) {
  if (!ev?.claims?.scope) return '—';
  const sc = ev.claims.scope;
  const parts = typeof sc === 'string' ? sc.split(/\s+/) : [];
  return parts.length ? `${parts.length} scope(s)` : '—';
}

/**
 * Build terminal steps after /api/mcp/tool returns, using BFF tokenEvents when present.
 * @param {string} toolName
 * @param {object[]|undefined} tokenEvents
 * @param {boolean} ok
 * @param {string|null} errorMessage
 */
function buildCompletedSteps(toolName, tokenEvents, ok, errorMessage) {
  const events = Array.isArray(tokenEvents) ? tokenEvents : [];
  const userTok = events.find((e) => e.id === 'user-token');
  const exchanged = events.find((e) => e.id === 'exchanged-token');
  const required = events.find((e) => e.id === 'exchange-required');
  const failed = events.find((e) => e.id === 'exchange-failed');
  const badScopes = events.find((e) => e.id === 'user-scopes-insufficient');

  const subHint = userTok?.claims?.sub
    ? `sub · ${String(userTok.claims.sub).slice(0, 12)}… · ${scopeSummary(userTok)}`
    : 'OAuth access token from your sign-in session';

  const steps = [
    {
      id: 'as',
      title: 'PingOne (Authorization Server)',
      detail: userTok
        ? `User access token — ${subHint}`
        : ok
          ? `User access token in session — ${subHint}`
          : 'Sign-in flow should have stored an OAuth access token in the BFF session',
      status: 'done',
    },
    {
      id: 'agent',
      title: 'Banking Agent (browser)',
      detail: 'Sent JSON tool request to your Backend-for-Frontend',
      status: ok ? 'done' : 'done',
    },
    {
      id: 'bff',
      title: 'BFF — POST /api/mcp/tool',
      detail: (() => {
        if (failed) return `Token exchange failed: ${failed.error || failed.message || 'unknown'}`;
        if (badScopes) return badScopes.explanation || 'User token missing scopes for exchange';
        if (exchanged) {
          const aud = exchanged.audienceNarrowed || exchanged.audActual || 'MCP audience';
          const sc = exchanged.scopeNarrowed || 'narrowed';
          return `RFC 8693 token exchange OK → MCP token (aud: ${aud}, ${sc})`;
        }
        if (required) {
          return 'Token exchange not configured (MCP_RESOURCE_URI) — BFF may use local fallback';
        }
        return 'Validated session; forwarded to MCP proxy (WebSocket)';
      })(),
      status: failed || badScopes ? 'error' : 'done',
    },
    {
      id: 'mcp',
      title: 'MCP Server',
      detail: ok
        ? 'Introspected token, checked scopes, called Banking REST API with Bearer token'
        : errorMessage || 'Upstream or policy error',
      status: ok ? 'done' : 'error',
    },
    {
      id: 'tool',
      title: `MCP tool — ${toolName}`,
      detail: ok ? 'tools/call completed' : errorMessage || 'Tool call failed',
      status: ok ? 'done' : 'error',
    },
  ];

  return steps;
}

export const agentFlowDiagram = {
  subscribe(fn) {
    listeners.add(fn);
    try {
      fn({
        ...state,
        steps: state.steps.map((s) => ({ ...s })),
        serverEvents: state.serverEvents.map((e) => ({ ...e })),
      });
    } catch (_) {}
    return () => listeners.delete(fn);
  },

  getState() {
    return {
      ...state,
      steps: state.steps.map((s) => ({ ...s })),
      serverEvents: state.serverEvents.map((e) => ({ ...e })),
    };
  },

  /**
   * Apply one SSE payload from GET /api/mcp/tool/events (BFF `phase` milestones).
   * @param {object} payload
   */
  applyServerEvent(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.phase === 'stream_end') {
      state.updatedAt = Date.now();
      emit();
      return;
    }
    const label = PHASE_LABELS[payload.phase] || String(payload.phase);
    const bits = [];
    if (payload.tool && payload.tool !== state.toolName) bits.push(`tool · ${payload.tool}`);
    if (payload.code) bits.push(`code · ${payload.code}`);
    if (payload.status != null) bits.push(`HTTP ${payload.status}`);
    if (payload.path) bits.push(`path · ${payload.path}`);
    if (payload.hasUserToken != null) bits.push(payload.hasUserToken ? 'user token' : 'no user token');
    if (payload.exchanged != null) bits.push(payload.exchanged ? 'exchanged' : 'not exchanged');
    if (payload.exchangeRequired) bits.push('exchange required');
    const detail = bits.length ? bits.join(' · ') : '—';
    const row = {
      phase: String(payload.phase),
      label,
      detail,
      t: typeof payload.t === 'number' ? payload.t : undefined,
    };
    state.serverEvents = [...state.serverEvents, row].slice(-MAX_SERVER_EVENTS);
    state.updatedAt = Date.now();
    emit();
  },

  open() {
    state.visible = true;
    state.hint = null;
    state.updatedAt = Date.now();
    emit();
  },

  close() {
    state.visible = false;
    state.updatedAt = Date.now();
    emit();
  },

  reset() {
    state.phase = 'idle';
    state.toolName = null;
    state.steps = [];
    state.serverEvents = [];
    state.hint = 'Run a banking action in the agent to see each hop update live.';
    state.updatedAt = Date.now();
    emit();
  },

  /**
   * @param {string} toolName MCP tool name e.g. get_my_accounts
   */
  startMcpToolCall(toolName) {
    state.visible = true;
    state.phase = 'running';
    state.toolName = toolName;
    state.hint = null;
    state.serverEvents = [];
    state.steps = [
      {
        id: 'as',
        title: 'PingOne (Authorization Server)',
        detail: 'User token should already be in the BFF session from sign-in',
        status: 'done',
      },
      {
        id: 'agent',
        title: 'Banking Agent',
        detail: 'Calling Backend-for-Frontend…',
        status: 'active',
      },
      {
        id: 'bff',
        title: 'BFF — POST /api/mcp/tool',
        detail: 'Resolving OAuth token, optional RFC 8693 exchange, opening MCP WebSocket',
        status: 'pending',
      },
      {
        id: 'mcp',
        title: 'MCP Server',
        detail: 'tools/call → introspection → Banking API',
        status: 'pending',
      },
      {
        id: 'tool',
        title: `Tool — ${toolName}`,
        detail: 'In progress…',
        status: 'pending',
      },
    ];
    state.updatedAt = Date.now();
    emit();
  },

  /**
   * @param {{ toolName: string, tokenEvents?: object[], ok: boolean, errorMessage?: string|null }} p
   */
  completeMcpToolCall({ toolName, tokenEvents, ok, errorMessage = null }) {
    state.phase = ok ? 'done' : 'error';
    state.toolName = toolName;
    state.steps = buildCompletedSteps(toolName, tokenEvents, ok, errorMessage);
    state.updatedAt = Date.now();
    emit();
  },

  /** MCP inspector tools/list (different route — no token exchange on BFF for same shape). */
  startInspectorToolsList() {
    state.visible = true;
    state.phase = 'running';
    state.toolName = 'tools/list';
    state.hint = null;
    state.steps = [
      {
        id: 'as',
        title: 'PingOne (Authorization Server)',
        detail: 'Session token used for discovery',
        status: 'done',
      },
      {
        id: 'agent',
        title: 'Banking Agent',
        detail: 'GET /api/mcp/inspector/tools',
        status: 'active',
      },
      {
        id: 'bff',
        title: 'BFF — MCP Host proxy',
        detail: 'tools/list over WebSocket to MCP server',
        status: 'pending',
      },
      {
        id: 'mcp',
        title: 'MCP Server',
        detail: 'Returns registered banking tools',
        status: 'pending',
      },
    ];
    state.updatedAt = Date.now();
    emit();
  },

  /**
   * @param {{ ok: boolean, source?: string, errorMessage?: string|null }} p
   */
  completeInspectorToolsList({ ok, source = 'mcp_server', errorMessage = null }) {
    state.phase = ok ? 'done' : 'error';
    state.toolName = 'tools/list';
    state.steps = [
      {
        id: 'as',
        title: 'PingOne (Authorization Server)',
        detail: 'Bearer from session for MCP handshake',
        status: 'done',
      },
      {
        id: 'agent',
        title: 'Banking Agent',
        detail: 'Requested live tool catalog',
        status: 'done',
      },
      {
        id: 'bff',
        title: 'BFF — MCP Inspector',
        detail: ok ? `Discovery OK (${source})` : errorMessage || 'Discovery failed',
        status: ok ? 'done' : 'error',
      },
      {
        id: 'mcp',
        title: 'MCP Server',
        detail: ok ? 'tools/list JSON-RPC completed' : errorMessage || 'Unreachable or error',
        status: ok ? 'done' : 'error',
      },
    ];
    state.updatedAt = Date.now();
    emit();
  },
};
