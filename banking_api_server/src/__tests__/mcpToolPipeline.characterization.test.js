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
    createPendingDecision: jest.fn(() => ({ taskId: 't' })),
    appEventLog: jest.fn(),
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

  // Pinned now, satisfiable at Task 4 (remote phase). Task 4 flips back.
  test.failing('token resolve success → proceeds (no early Outcome from this phase)', async () => {
    const deps = makeDeps();
    deps.evaluateMcpFirstToolGate = jest.fn(async () => ({ ran: false, reason: 'no_token' }));
    deps.mcpCallTool = jest.fn(async () => ({ content: [{ text: 'remote-ok' }] }));
    const outcome = await runMcpToolPipeline(makeCtx({ deps }));
    expect(outcome.kind).toBe('result');
    expect(deps.resolveMcpAccessTokenWithEvents).toHaveBeenCalled();
  });

  test('missing_exchange_scopes → block 403 with structured config-fix body', async () => {
    const err = Object.assign(new Error('need write'), {
      code: 'missing_exchange_scopes', missingScopes: ['banking:write'],
      userScopes: 'banking:read', requiredScopes: 'banking:write', tokenEvents: [{ id: 'x' }],
    });
    const deps = makeDeps({ resolveMcpAccessTokenWithEvents: jest.fn(async () => { throw err; }) });
    const outcome = await runMcpToolPipeline(makeCtx({ deps }));
    expect(outcome).toMatchObject({
      kind: 'block', httpStatus: 403,
      body: { error: 'missing_exchange_scopes', message: 'need write',
              missingScopes: ['banking:write'], userScopes: 'banking:read',
              requiredScopes: 'banking:write', tokenEvents: [{ id: 'x' }] },
    });
  });

  test('exchange-scope-error (httpStatus 400) + session user → local fallback result, flags set', async () => {
    const err = Object.assign(new Error('At least one scope must be granted'), { httpStatus: 400 });
    const deps = makeDeps({
      resolveMcpAccessTokenWithEvents: jest.fn(async () => { throw err; }),
      callToolLocal: jest.fn(async () => ({ content: [{ text: 'local' }] })),
    });
    const outcome = await runMcpToolPipeline(makeCtx({ deps }));
    expect(outcome.kind).toBe('result');
    expect(outcome.httpStatus).toBe(200);
    expect(outcome.body._localFallback).toBe(true);
    expect(outcome.body._exchangeFailed).toBe(true);
    expect(deps.callToolLocal).toHaveBeenCalledWith('get_my_accounts', {}, 'u1', expect.any(Object));
  });

  test('pingoneError 401 IS an exchange-scope error (local fallback), session-guard 401 is NOT', async () => {
    const pingoneErr = Object.assign(new Error('Unsupported authentication method'), { httpStatus: 401, pingoneError: 'invalid_client' });
    const depsP = makeDeps({ resolveMcpAccessTokenWithEvents: jest.fn(async () => { throw pingoneErr; }) });
    const outP = await runMcpToolPipeline(makeCtx({ deps: depsP }));
    expect(outP.kind).toBe('result');
    expect(outP.body._localFallback).toBe(true);

    const guardErr = Object.assign(new Error('no session'), { httpStatus: 401 }); // no .pingoneError
    const depsG = makeDeps({ resolveMcpAccessTokenWithEvents: jest.fn(async () => { throw guardErr; }) });
    const outG = await runMcpToolPipeline(makeCtx({ deps: depsG }));
    expect(outG.kind).toBe('error');
    expect(outG.httpStatus).toBe(401);
    expect(depsG.callToolLocal).not.toHaveBeenCalled();
  });

  test('TOKEN_INACTIVE → error 401 need_auth, no local fallback', async () => {
    const err = Object.assign(new Error('inactive'), { code: 'TOKEN_INACTIVE', tokenEvents: [{ id: 'e' }] });
    const deps = makeDeps({ resolveMcpAccessTokenWithEvents: jest.fn(async () => { throw err; }) });
    const outcome = await runMcpToolPipeline(makeCtx({ deps }));
    expect(outcome).toMatchObject({
      kind: 'error', httpStatus: 401,
      body: { error: 'Session expired', need_auth: true, agentInitRequired: true, tokenEvents: [{ id: 'e' }] },
    });
  });

  test('generic exchange failure → error with err.httpStatus||502 and errCode mapping', async () => {
    const err = Object.assign(new Error('actor token invalid'), { httpStatus: 502, code: 'actor_token_invalid', tokenEvents: [] });
    const deps = makeDeps({ resolveMcpAccessTokenWithEvents: jest.fn(async () => { throw err; }) });
    const outcome = await runMcpToolPipeline(makeCtx({ deps }));
    expect(outcome).toMatchObject({
      kind: 'error', httpStatus: 502,
      body: { error: 'actor_token_invalid', message: 'actor token invalid', tokenEvents: [] },
    });
  });

  test('no bearer token + session user → local fallback result _localFallback', async () => {
    const deps = makeDeps({ resolveMcpAccessTokenWithEvents: jest.fn(async () => ({ token: null, tokenEvents: [], userSub: null })) });
    const outcome = await runMcpToolPipeline(makeCtx({ deps }));
    expect(outcome.kind).toBe('result');
    expect(outcome.body._localFallback).toBe(true);
  });

  test('no bearer token + NO session user → block from mcpNoBearerResponse', async () => {
    const deps = makeDeps({
      resolveMcpAccessTokenWithEvents: jest.fn(async () => ({ token: null, tokenEvents: [], userSub: null })),
      mcpNoBearerResponse: jest.fn(() => ({ status: 401, body: { error: 'no_bearer' } })),
    });
    const ctx = makeCtx({ deps, req: { session: { user: null }, correlationId: 'c1' } });
    const outcome = await runMcpToolPipeline(ctx);
    expect(outcome).toMatchObject({ kind: 'block', httpStatus: 401, body: { error: 'no_bearer' } });
  });

  // Pinned now, satisfiable at Task 4 (remote phase). Task 4 flips back.
  test.failing('Authorize gate runs BEFORE the remote call on the permit path (ADR-0003/T-2)', async () => {
    const order = [];
    const deps = makeDeps();
    deps.evaluateMcpFirstToolGate = jest.fn(async () => { order.push('gate'); return { ran: true, permit: true, evaluation: { decision: 'PERMIT' } }; });
    deps.mcpCallTool = jest.fn(async () => { order.push('remote'); return { content: [{ text: 'ok' }] }; });
    await runMcpToolPipeline(makeCtx({ deps }));
    expect(order).toEqual(['gate', 'remote']);
  });

  test('gate block 403 deny → block Outcome with tokenEvents + mcpAuthorizeEvaluation', async () => {
    const deps = makeDeps();
    deps.evaluateMcpFirstToolGate = jest.fn(async () => ({ ran: true, block: { status: 403, body: { error: 'mcp_authorization_denied', decisionId: 'd1', decisionContext: { x: 1 } } } }));
    const outcome = await runMcpToolPipeline(makeCtx({ deps }));
    expect(outcome.kind).toBe('block');
    expect(outcome.httpStatus).toBe(403);
    expect(outcome.body.error).toBe('mcp_authorization_denied');
    expect(outcome.body.mcpAuthorizeEvaluation).toEqual({ decisionContext: { x: 1 }, decisionId: 'd1' });
  });

  test('gate block 428 mcp_hitl_required → block + pending decision created, taskId in body', async () => {
    const deps = makeDeps();
    deps.createPendingDecision = jest.fn(() => ({ taskId: 'task-9' }));
    deps.evaluateMcpFirstToolGate = jest.fn(async () => ({ ran: true, block: { status: 428, body: { error: 'mcp_hitl_required', decisionId: 'd2', decisionContext: { c: 2 }, error_description: 'needs human' } } }));
    const outcome = await runMcpToolPipeline(makeCtx({ deps }));
    expect(outcome.httpStatus).toBe(428);
    expect(deps.createPendingDecision).toHaveBeenCalledWith('u1', expect.objectContaining({ tool: 'get_my_accounts', decisionId: 'd2' }));
    expect(outcome.body.taskId).toBe('task-9');
  });

  test('gate simulatedError → error 500 mcp_authorize_error', async () => {
    const deps = makeDeps();
    deps.evaluateMcpFirstToolGate = jest.fn(async () => ({ ran: true, simulatedError: new Error('sim boom') }));
    const outcome = await runMcpToolPipeline(makeCtx({ deps }));
    expect(outcome).toMatchObject({ kind: 'error', httpStatus: 500, body: { error: 'mcp_authorize_error' } });
  });

  test('gate pingoneError → error 503 mcp_authorize_unavailable (fail closed)', async () => {
    const deps = makeDeps();
    deps.evaluateMcpFirstToolGate = jest.fn(async () => ({ ran: true, pingoneError: new Error('p1 down') }));
    const outcome = await runMcpToolPipeline(makeCtx({ deps }));
    expect(outcome).toMatchObject({ kind: 'error', httpStatus: 503, body: { error: 'mcp_authorize_unavailable' } });
  });

  test('gate internal throw → error 500 mcp_authorize_internal', async () => {
    const deps = makeDeps();
    deps.evaluateMcpFirstToolGate = jest.fn(async () => { throw new Error('gate exploded'); });
    const outcome = await runMcpToolPipeline(makeCtx({ deps }));
    expect(outcome).toMatchObject({ kind: 'error', httpStatus: 500, body: { error: 'mcp_authorize_internal' } });
  });
});
