/**
 * @file mcpToolPipeline.characterization.test.js
 *
 * Characterization tests for runMcpToolPipeline (ADR-0004). These pin the
 * EXACT Outcome kind/httpStatus/body for every exit path of the former
 * POST /api/mcp/tool handler. They are written BEFORE the extraction and must
 * stay GREEN after it — that is the proof the move changed no behavior.
 * Do NOT "improve" an assertion to match new code; a diff here is a regression.
 */
'use strict';

const { runMcpToolPipeline } = require('../../services/mcpToolPipeline');

// Minimal dep factory — every collaborator is a jest.fn() the test overrides.
function makeDeps(over = {}) {
  return {
    resolveMcpAccessTokenWithEvents: jest.fn(async () => ({ token: 't', tokenEvents: [], userSub: 'u1' })),
    evaluateMcpFirstToolGate: jest.fn(async () => ({ ran: true, permit: true, evaluation: { decision: 'PERMIT' } })),
    introspectToken: jest.fn(async () => ({ active: true, sub: 'u1', scope: 'banking:read', exp: 9999999999 })),
    callToolLocal: jest.fn(async () => ({ content: [{ text: 'local-ok' }] })),
    mcpCallTool: jest.fn(async () => ({ content: [{ text: 'remote-ok' }] })),
    callToolViaGateway: jest.fn(async () => ({ result: { content: [{ text: 'gw-ok' }] }, gwAuditTrail: null })),
    http2Bridge: { createHttp2Session: jest.fn(() => ({})), forwardToolCall: jest.fn(async () => ({ content: [] })) },
    buildTokenEvent: jest.fn((id, label, status) => ({ id, label, status })),
    mcpNoBearerResponse: jest.fn(() => ({ status: 401, body: { error: 'no_bearer' } })),
    stdioAdapter: { callToolViaStdio: jest.fn(async () => ({ content: [{ text: 'p1-ok' }] })) },
    recordMcpToolCall: jest.fn(),
    publishMcpResultToSse: jest.fn(),
    publishTokenEventsToSse: jest.fn(),
    emit: jest.fn(),
    config: {
      introspectionConfigured: false,
      useGateway: false,
      gatewayHttpUrl: '',
      mcpUrl: 'ws://localhost:8080',
      useHttp2: false,
      pingoneAdminEnabled: false,
      pingoneAdminTools: new Set(['list_applications']),
    },
    ...over,
  };
}

function makeCtx(over = {}) {
  return {
    tool: 'get_my_accounts',
    params: {},
    flowTraceId: '',
    startTime: Date.now(),
    req: { session: { user: { id: '1', oauthId: 'u1' } }, correlationId: 'c1' },
    deps: makeDeps(over.deps || {}),
    ...over,
  };
}

describe('runMcpToolPipeline — characterization (ADR-0004, zero behavior change)', () => {
  test('PingOne admin tool early-exit returns result with empty tokenEvents (no token exchange)', async () => {
    const deps = makeDeps({ config: { ...makeDeps().config, pingoneAdminEnabled: true } });
    const ctx = makeCtx({ tool: 'list_applications', deps });

    const outcome = await runMcpToolPipeline(ctx);

    expect(outcome.kind).toBe('result');
    expect(outcome.httpStatus).toBe(200);
    expect(outcome.body).toEqual({ result: { content: [{ text: 'p1-ok' }] }, tokenEvents: [] });
    expect(deps.stdioAdapter.callToolViaStdio).toHaveBeenCalledWith('list_applications', {}, '', 'u1', 'c1');
    expect(deps.resolveMcpAccessTokenWithEvents).not.toHaveBeenCalled(); // bypasses exchange
  });
});
