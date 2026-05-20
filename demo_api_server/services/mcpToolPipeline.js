'use strict';

/**
 * runMcpToolPipeline — pure orchestration of a BFF MCP tool call (ADR-0004).
 * Returns a discriminated Outcome; never touches Express res/req response APIs.
 * Built up path-by-path under characterization tests.
 * @param {object} ctx { tool, params, flowTraceId, startTime, req, deps }
 * @returns {Promise<object>} Outcome { kind:'result'|'block'|'error', httpStatus, body, tokenEvents? }
 *
 * `tokenEvents?` (top-level) is the SSE side-channel mirror, NOT a copy of
 * `body`. Rule: present on every `result` and on `block` returns whose wire
 * `body` already carried events; intentionally absent on `error` and on the
 * `mcpNoBearerResponse` / `mcp_scope_denied` passthroughs whose original
 * server.js body sent none. The route shell must read the top-level field for
 * the SSE publish — never derive it from `body` (ADR-0004; verbatim mirror of
 * the pre-extraction wire shape, so it must not be "normalized").
 */
/**
 * Map a local-handler (callToolLocal) result to the correct pipeline Outcome.
 *
 * The local handler signals human-in-the-loop / step-up by RETURNING a result
 * object with `error: 'hitl_required' | 'step_up_required'` (not by throwing).
 * Before this, both local-fallback sites wrapped that as
 * `{ kind:'result', httpStatus:200, body:{ result } }` — so a transfer that
 * needs approval came back HTTP 200 with the signal buried in the tool text,
 * while the simulated-Authorize gate for the same logical outcome returns
 * HTTP 428. Same meaning, two wire shapes. This normalises the local path to
 * the proper 428 with an actionable message + the consent/step-up kind, so
 * callers (UI, agent, tests) get one consistent contract regardless of which
 * internal path produced it (REGRESSION_PLAN §1 — 428 enforcement).
 *
 * Non-HITL results (success, or ordinary tool errors) keep the existing
 * `kind:'result', httpStatus:200` envelope unchanged.
 */
function localResultOutcome(result, tokenEvents, extraBodyFields) {
  const errCode = result && result.error;
  const isHitl = errCode === 'hitl_required';
  const isStepUp = errCode === 'step_up_required';
  if (isHitl || isStepUp) {
    const hitlType = (result.hitl && result.hitl.type)
      || (isStepUp ? 'step_up' : 'consent');
    return {
      kind: 'block',
      httpStatus: 428,
      tokenEvents,
      body: {
        error: isStepUp ? 'mcp_step_up_required' : 'mcp_hitl_required',
        error_description: result.message
          || (isStepUp
            ? 'This transaction requires step-up authentication (MFA). Approve it on the dashboard to continue.'
            : 'This transaction requires human approval. Confirm it on the dashboard to continue.'),
        hitl: { type: hitlType },
        ...(typeof result.hitl_threshold_usd !== 'undefined'
          ? { hitl_threshold_usd: result.hitl_threshold_usd }
          : {}),
        authorize_engine: 'local',
        tokenEvents,
        ...extraBodyFields,
      },
    };
  }
  return {
    kind: 'result',
    httpStatus: 200,
    tokenEvents,
    body: { result, tokenEvents, ...extraBodyFields },
  };
}

/**
 * Detect a HITL / step-up signal embedded in an MCP tool RESULT's content.
 *
 * The gateway→backend path can return `isError:false, success:true` while the
 * tool's `content[0].text` is itself a JSON string like
 * `{"error":"hitl_required","hitl":{"type":"consent"},"amount":100,...}`.
 * Phase 170: ALL transfers require consent — so this is a legitimate gate,
 * but it was reaching the client as HTTP 200 with the signal buried in tool
 * text, while the simulated-Authorize path returns 428 for the same outcome.
 * Returns the parsed HITL object ({ error, hitl, message, hitl_threshold_usd })
 * so the caller can normalise it via localResultOutcome → 428. Returns null
 * when the result is an ordinary success.
 */
function hitlSignalInResultContent(result) {
  const content = result && Array.isArray(result.content) ? result.content : null;
  if (!content) return null;
  for (const c of content) {
    if (!c || typeof c.text !== 'string') continue;
    const txt = c.text.trim();
    if (txt[0] !== '{' || !/hitl_required|step_up_required/.test(txt)) continue;
    try {
      const parsed = JSON.parse(txt);
      if (parsed && (parsed.error === 'hitl_required' || parsed.error === 'step_up_required')) {
        return parsed;
      }
    } catch { /* not JSON — ignore */ }
  }
  return null;
}

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

  const flowTraceId = ctx.flowTraceId;
  const startTime = ctx.startTime;
    let mcpAccessToken; // RFC 8693 §3.2: MCP-scoped access token (result of exchange)
    let userSub = null;
    let tokenEvents = [];
    try {
        deps.emit({
            phase: 'resolving_access_token'
        });
        // BFF performs the single canonical RFC 8693 exchange (user subject +
        // agent actor -> MCP-gateway-audienced token); the gateway and MCP
        // server re-exchange downstream. The mcpWriteToken session cache is
        // bypassed so every tool call produces the complete token chain.
        const resolved = await deps.resolveMcpAccessTokenWithEvents(req, tool);
        mcpAccessToken = resolved.token;
        tokenEvents = resolved.tokenEvents;
        userSub = resolved.userSub || null;
        const tratContextHeader = resolved.tratContextHeader || null;
        // Publish token events to SSE hub for real-time Token Chain display
        deps.publishTokenEventsToSse(flowTraceId, tokenEvents);
        const evs = tokenEvents || [];
        deps.emit({
            phase: 'access_token_ready',
            hasUserToken: evs.some((e) => e && e.id === 'user-token'),
            exchanged: evs.some((e) => e && e.id === 'exchanged-token'),
            exchangeRequired: evs.some((e) => e && e.id === 'exchange-required'),
        });
    } catch (err) {
        console.error(`[MCP Proxy] Token resolution failed for tool ${tool}:`, err.message);
        deps.emit({
            phase: 'access_token_error',
            code: err.code || 'token_exchange_failed'
        });

        // When the exchange fails because the subject token lacks the required scopes
        // (e.g. ENDUSER_AUDIENCE login path only carries agent:invoke, not
        // write), PingOne returns 400 "At least one scope must be granted".
        // In that case, fall back to the local tool handler so the operation still
        // completes — the UI receives _exchangeFailed:true so it can show a soft
        // informational message instead of an error toast.
        //
        // PingOne also returns 401 for token-exchange policy rejections such as
        // "Request denied: Unsupported authentication method" — this happens when the
        // exchanger client (admin OAuth app) is a PKCE Web app whose token-exchange
        // grant or auth method is not configured correctly in PingOne.  These are
        // server-side config errors, not invalid user tokens, so local fallback is safe.
        // We distinguish PingOne-origin 401s from session-guard 401s via err.pingoneError
        // (only set when the 401 response body was parsed from the PingOne token endpoint).
        // missing_exchange_scopes: the user's access token doesn't carry the required scopes.
        // Return a structured 403 so the UI can display an actionable config-fix modal.
        // Do NOT fall back to local tool execution — that would hide the misconfiguration.
        if (err.code === 'missing_exchange_scopes') {
            const events = err.tokenEvents && err.tokenEvents.length ? err.tokenEvents : [];
            deps.publishTokenEventsToSse(flowTraceId, events);
            return { kind: 'block', httpStatus: 403, tokenEvents: events, body: {
                error: 'missing_exchange_scopes',
                message: err.message,
                missingScopes: err.missingScopes || [],
                userScopes: err.userScopes || '',
                requiredScopes: err.requiredScopes || '',
                tokenEvents: events,
            } };
        }

        const sessionUser = req.session ?.user;
        const isExchangeScopeError =
            err.httpStatus === 400 ||
            err.code === 'token_exchange_failed' ||
            (err.httpStatus === 401 && Boolean(err.pingoneError));
        console.error(
            '[MCP Fallback:DEBUG] tool=%s httpStatus=%s errCode=%s pingoneError=%s ' +
            'sessionUser.id=%s sessionUser.oauthId=%s isExchangeScopeError=%s',
            tool,
            err.httpStatus ?? '(none)',
            err.code ?? '(none)',
            err.pingoneError ?? '(none)',
            sessionUser ?.id ?? '(missing — fallback will NOT fire)',
            sessionUser ?.oauthId ?? '(none)',
            isExchangeScopeError
        );
        if (sessionUser ?.id && isExchangeScopeError) {
            const fallbackEvents = err.tokenEvents && err.tokenEvents.length ? err.tokenEvents : [];
            deps.publishTokenEventsToSse(flowTraceId, fallbackEvents);
            const effectiveUserId = sessionUser.oauthId || sessionUser.id;
            console.log(
                '[MCP Local] %s — exchange failed (%s), falling back to local handler. effectiveUserId=%s',
                tool, err.code ?? err.httpStatus, effectiveUserId
            );
            try {
                deps.emit({
                    phase: 'local_tool_start',
                    path: 'exchange_failed_fallback'
                });
                const result = await deps.callToolLocal(tool, params || {}, effectiveUserId, req);
                deps.emit({
                    phase: 'local_tool_done',
                    path: 'exchange_failed_fallback'
                });
                console.log('[MCP Local] %s — local fallback result keys=%s resultError=%s',
                    tool,
                    result ? Object.keys(result).join(',') : '(null)',
                    result ?.error ?? '(none)'
                );
                const _efDuration = Date.now() - startTime;
                deps.publishMcpResultToSse(flowTraceId, { tool, result, durationMs: _efDuration, isDelegated: false, userId: effectiveUserId });
                deps.recordMcpToolCall({ userId: effectiveUserId, toolName: tool, success: !result?.error, duration: _efDuration, resultSummary: result?.error ? `${tool} failed` : `${tool} completed` });
                return localResultOutcome(result, fallbackEvents, {
                    _localFallback: true,
                    _exchangeFailed: true,
                });
            } catch (localErr) {
                console.error(
                    '[MCP Local] %s — callToolLocal THREW after exchange failure: %s stack=%s',
                    tool, localErr.message, localErr.stack
                );
                // Fall through to original error response
            }
        }

        // TOKEN_INACTIVE — user's PingOne session expired; signal UI to re-authenticate
        if (err.code === 'TOKEN_INACTIVE') {
            const events = err.tokenEvents && err.tokenEvents.length ? err.tokenEvents : [];
            deps.publishTokenEventsToSse(flowTraceId, events);
            return { kind: 'error', httpStatus: 401, body: { error: 'Session expired', need_auth: true, agentInitRequired: true, tokenEvents: events } };
        }

        const status = err.httpStatus || 502;
        const events = err.tokenEvents && err.tokenEvents.length ? err.tokenEvents : [];
        deps.publishTokenEventsToSse(flowTraceId, events);
        const errCode = err.error || err.code;  // RFCCompliantError uses .error, not .code
        const requiresLogin = false; // actor_token_invalid is a server config issue; user session expiry is caught by middleware before this
        return { kind: 'error', httpStatus: status, body: {
            error: errCode || 'token_exchange_failed',
            message: err.message,
            tokenEvents: events,
            ...(requiresLogin && { requiresLogin: true }),
        } };
    }

    if (!mcpAccessToken) {
        deps.emit({
            phase: 'no_bearer_token_branch'
        });
        // No bearer token (cookie-only or degraded session) — use local handler if session user present.
        // This lets the banking agent work for basic operations even without a fully-hydrated Redis session.
        const sessionUser = req.session ?.user;
        if (sessionUser ?.id) {
            console.log(`[MCP Local] ${tool} — no bearer token (cookie-only session), using local handler`);
            try {
                deps.emit({
                    phase: 'local_tool_start',
                    path: 'no_bearer'
                });
                // Use oauthId (PingOne sub/UUID) when available — accounts are stored under the UUID
                // not the local sequential dataStore id, matching what authenticateToken sets on req.user.id.
                const effectiveUserId = sessionUser.oauthId || sessionUser.id;
                const result = await deps.callToolLocal(tool, params || {}, effectiveUserId, req);
                deps.emit({
                    phase: 'local_tool_done',
                    path: 'no_bearer'
                });
                deps.publishTokenEventsToSse(flowTraceId, tokenEvents);
                return localResultOutcome(result, tokenEvents, { _localFallback: true });
            } catch (localErr) {
                console.error(`[MCP Local] Error calling ${tool}:`, localErr.message);
                deps.emit({
                    phase: 'local_tool_error',
                    path: 'no_bearer'
                });
                deps.publishTokenEventsToSse(flowTraceId, tokenEvents);
                return { kind: 'error', httpStatus: 502, body: {
                    error: 'mcp_error',
                    message: localErr.message,
                    tokenEvents
                } };
            }
        }
        deps.emit({
            phase: 'no_bearer_no_user'
        });
        const r = deps.mcpNoBearerResponse(req, tokenEvents);
        deps.publishTokenEventsToSse(flowTraceId, tokenEvents);
        return { kind: 'block', httpStatus: r.status, body: r.body };
    }

    // PingOne Authorize (or simulated) on every MCP tool call — docs/PINGONE_AUTHORIZE_PLAN.md §7
    /** @type {object|undefined} */
    let mcpAuthorizeEvaluationThisRequest;
    try {
        deps.emit({
            phase: 'authorize_gate_begin'
        });
        const mcpAuthz = await deps.evaluateMcpFirstToolGate({
            req,
            tool,
            agentToken: mcpAccessToken, // RFC 8693: pass as agentToken for backward compat
            userSub,
            userAcr: req.session ?.user ?.acr,
            toolParams: params,
        });
        if (mcpAuthz.ran && mcpAuthz.block) {
            deps.emit({
                phase: 'authorize_denied',
                status: mcpAuthz.block.status
            });
            // HITL: create pending decision so the agent UI can poll and approve/deny
            let hitlTaskId = null;
            if (mcpAuthz.block.body.error === 'mcp_hitl_required') {
                deps.emit({ phase: 'authorize_denied_hitl', challenge_type: 'hitl' });
                const hitl = deps.createPendingDecision(
                    userSub,
                    {
                        tool,
                        decisionId: mcpAuthz.block.body.decisionId,
                        decisionContext: mcpAuthz.block.body.decisionContext,
                        reason: mcpAuthz.block.body.error_description,
                    },
                );
                hitlTaskId = hitl.taskId;
            }
            return { kind: 'block', httpStatus: mcpAuthz.block.status, tokenEvents, body: {
                ...mcpAuthz.block.body,
                ...(hitlTaskId ? { taskId: hitlTaskId } : {}),
                tokenEvents,
                mcpAuthorizeEvaluation: {
                    decisionContext: mcpAuthz.block.body.decisionContext,
                    decisionId: mcpAuthz.block.body.decisionId,
                },
            } };
        }
        if (mcpAuthz.ran && mcpAuthz.simulatedError) {
            deps.emit({
                phase: 'authorize_simulated_error'
            });
            console.error(`[MCP Authorize][Simulated] unexpected error: ${mcpAuthz.simulatedError.message}`);
            return { kind: 'error', httpStatus: 500, body: {
                error: 'mcp_authorize_error',
                error_description: 'Simulated MCP authorization evaluation failed unexpectedly.',
                tokenEvents,
            } };
        }
        if (mcpAuthz.ran && mcpAuthz.pingoneError) {
            deps.emit({
                phase: 'authorize_unavailable'
            });
            console.error(`[MCP Authorize] PingOne error — failing closed: ${mcpAuthz.pingoneError.message}`);
            return { kind: 'error', httpStatus: 503, body: {
                error: 'mcp_authorize_unavailable',
                error_description: 'PingOne Authorize is unavailable for MCP tool access.',
                tokenEvents,
            } };
        }
        if (mcpAuthz.ran && mcpAuthz.permit) {
            deps.emit({
                phase: 'authorize_permitted'
            });
            mcpAuthorizeEvaluationThisRequest = mcpAuthz.evaluation;
            deps.appEventLog('authorize', 'info',
                `Authorize gate permitted — ${tool}`,
                { tag: 'authorize/gate-permitted', metadata: { tool } });
        }
        if (!mcpAuthz.ran) {
            deps.emit({
                phase: 'authorize_gate_skipped',
                reason: mcpAuthz.reason,
            });
            deps.appEventLog('authorize', 'info',
                `Authorize gate skipped — ${mcpAuthz.reason || 'unknown'}`,
                { tag: 'authorize/gate-skipped', metadata: { reason: mcpAuthz.reason } });
        }
    } catch (mcpAuthzErr) {
        deps.emit({
            phase: 'authorize_internal_error'
        });
        console.error('[MCP Authorize] Unexpected error in gate:', mcpAuthzErr.message);
        return { kind: 'error', httpStatus: 500, body: {
            error: 'mcp_authorize_internal',
            message: mcpAuthzErr.message,
            tokenEvents,
        } };
    }

    // Introspect session token for zero-trust validation (RFC 7662)
    const sessionAccessToken = deps.getSessionAccessToken(req);
    const introspectionConfigured = deps.config.introspectionConfigured;
    if (introspectionConfigured) {
        deps.emit({
            phase: 'introspection_begin'
        });
        if (!sessionAccessToken || sessionAccessToken === '_cookie_session') {
            deps.emit({
                phase: 'introspection_skipped_no_session_token'
            });
            const r = deps.mcpNoBearerResponse(req, tokenEvents);
            return { kind: 'block', httpStatus: r.status, body: r.body };
        }
        try {
            const introspectionResult = await deps.introspectToken(sessionAccessToken);
            if (!introspectionResult.active) {
                deps.emit({
                    phase: 'introspection_inactive'
                });
                tokenEvents.push(deps.buildTokenEvent(
                    'session-token-introspection',
                    'Session Token — PingOne Introspection (RFC 7662)',
                    'failed',
                    null,
                    'PingOne returned active=false for the session token. The tool call cannot proceed with an inactive session.',
                    {
                        rfc: 'RFC 7662',
                        introspectionResult: {
                            active: false,
                            sub: introspectionResult.sub,
                            scope: introspectionResult.scope,
                            exp: introspectionResult.exp,
                        },
                    }
                ));
                console.warn(`[MCP Proxy] Session token introspection failed: token inactive for tool ${tool}`);
                return { kind: 'error', httpStatus: 401, body: {
                    error: 'token_inactive',
                    need_auth: true,
                    agentInitRequired: true,
                    message: 'Session token is no longer active. Please sign in again.',
                    tokenEvents,
                } };
            }
            deps.emit({
                phase: 'introspection_active_ok'
            });
            tokenEvents.push(deps.buildTokenEvent(
                'session-token-introspection',
                'Session Token — PingOne Introspection (RFC 7662)',
                'active',
                // Pass claims so the UI Claims tab shows real PingOne data
                {
                    header: null,
                    claims: {
                        sub:    introspectionResult.sub   || null,
                        active: true,
                        scope:  introspectionResult.scope || null,
                        exp:    introspectionResult.exp   || null,
                        aud:    introspectionResult.aud   || null,
                        client_id: introspectionResult.client_id || null,
                    },
                },
                `PingOne confirmed the session token is active. sub=${introspectionResult.sub || '—'} scope="${introspectionResult.scope || ''}"`,
                {
                    rfc: 'RFC 7662',
                    introspectionResult: {
                        active: true,
                        sub: introspectionResult.sub,
                        scope: introspectionResult.scope,
                        exp: introspectionResult.exp,
                    },
                }
            ));
        } catch (err) {
            deps.emit({
                phase: 'introspection_error_degraded'
            });
            tokenEvents.push(deps.buildTokenEvent(
                'session-token-introspection',
                'Session Token — PingOne Introspection (RFC 7662)',
                'degraded',
                null,
                `Introspection endpoint error — continuing in degraded mode. ${err.message}`,
                { rfc: 'RFC 7662' }
            ));
            console.error(`[MCP Proxy] Session token introspection error for tool ${tool}:`, err.message);
            // Continue on introspection failure (graceful degradation) but log the error
        }
    } else {
        deps.emit({
            phase: 'introspection_not_configured'
        });
        tokenEvents.push(deps.buildTokenEvent(
            'session-token-introspection',
            'Session Token — PingOne Introspection (RFC 7662)',
            'skipped',
            null,
            'PINGONE_INTROSPECTION_ENDPOINT is not configured. Session token liveness is not verified on this tool call.',
            { rfc: 'RFC 7662' }
        ));
    }

    // ── Try remote MCP server first; fall back to local handler if unreachable ──
    // When MCP_GATEWAY_HTTP_URL is set, route through the banking-mcp-gateway (Phase 243).
    // The gateway owns RFC 9728 metadata, runs PingOne Authorize policy evaluation, and
    // performs RFC 8693 token exchange to the upstream MCP server — the mcpAccessToken
    // must already be scoped to the gateway audience (MCP_GW_RESOURCE_URI).
    // Graceful fallback: if MCP_GATEWAY_HTTP_URL is not set, use the previous direct path.
    const gatewayHttpUrl = deps.config.gatewayHttpUrl;
    const useGateway = deps.config.useGateway;
    const mcpUrl = deps.config.mcpUrl;
    const isLocalDefault = mcpUrl === 'ws://localhost:8080' && !deps.config.mcpServerUrlEnv;
    const useHttp2 = deps.config.useHttp2;

    try {
        deps.emit({
            phase: 'mcp_remote_begin'
        });
        deps.appEventLog('mcp', 'info', `MCP tool call → ${tool}`, { tag: 'mcp/tool', metadata: { tool, gatewayUrl: useGateway ? gatewayHttpUrl : mcpUrl, via: useGateway ? 'gateway' : 'direct' } });
        let result;
        let gwAuditTrail = null;
        if (useGateway) {
            ({ result, gwAuditTrail } = await deps.callToolViaGateway(gatewayHttpUrl, mcpAccessToken, tool, params || {}, { correlationId: req.correlationId, tratContextHeader }));
        } else if (useHttp2) {
            const h2Session = deps.http2Bridge.createHttp2Session(mcpUrl, mcpAccessToken);
            result = await deps.http2Bridge.forwardToolCall(h2Session, tool, params || {}, mcpAccessToken, userSub, req.correlationId);
        } else {
            result = await deps.mcpCallTool(tool, params || {}, mcpAccessToken, userSub, req.correlationId);
        }
        deps.appEventLog('mcp', 'info', `MCP tool done ← ${tool} (${Date.now() - startTime}ms)`, { tag: 'mcp/tool', metadata: { tool, durationMs: Date.now() - startTime } });

        // Build token events from gateway audit trail if present (Phase 259)
        if (gwAuditTrail) {
            if (gwAuditTrail.introspection) {
                const introspRes = gwAuditTrail.introspection;
                const status = introspRes.skipped ? 'skipped' : (introspRes.active ? 'valid' : 'revoked');
                const desc = introspRes.skipped
                    ? 'Gateway introspection skipped (endpoint not configured)'
                    : (introspRes.active ? 'Token verified active at gateway' : 'Token is revoked or no longer active');
                tokenEvents.push(deps.buildTokenEvent(
                    'gw-introspection',
                    'Gateway — RFC 7662 Introspection',
                    status,
                    null,
                    desc,
                    { rfc: 'RFC 7662', sub: introspRes.sub, exp: introspRes.exp }
                ));
            }
            if (gwAuditTrail.authorize) {
                const authzRes = gwAuditTrail.authorize;
                const decision = authzRes.decision; // PERMIT, DENY, INDETERMINATE
                const status = decision === 'PERMIT' ? 'permit' : (decision === 'INDETERMINATE' ? 'indeterminate' : 'deny');
                const desc = `PingOne Authorize policy evaluation: ${decision}${authzRes.reason ? ` (${authzRes.reason})` : ''}`;
                tokenEvents.push(deps.buildTokenEvent(
                    'gw-authorize',
                    'Gateway — PingOne Authorize Decision',
                    status,
                    null,
                    desc,
                    { decision }
                ));
            }
            if (gwAuditTrail.mtls) {
                const mtlsRes = gwAuditTrail.mtls;
                const status = mtlsRes.enabled ? 'active' : 'skipped';
                const desc = mtlsRes.enabled
                    ? `Gateway → MCP server mTLS verified. Client cert subject: ${mtlsRes.subject || 'banking-mcp-gateway'}`
                    : 'mTLS not enforced between gateway and MCP server (MCP_MTLS_ENABLED=false). Set MCP_MTLS_ENABLED=true to enforce.';
                tokenEvents.push(deps.buildTokenEvent(
                    'gw-mtls',
                    'Gateway → MCP Server mTLS',
                    status,
                    null,
                    desc,
                    { mtlsEnabled: mtlsRes.enabled, subject: mtlsRes.subject }
                ));
            }
        }

        // Log the actual MCP result so it's queryable via /api/app-events
        if (result) {
          const resultMeta = {
            tool,
            durationMs: Date.now() - startTime,
            hasContent: !!result.content,
            contentLength: result.content ? JSON.stringify(result.content).length : 0,
            contentType: result.isError ? 'error' : 'success'
          };
          deps.appEventLog('mcp', 'info', `MCP result: ${tool} → ${result.isError ? 'error' : 'success'} (${resultMeta.contentLength} bytes)`, { tag: 'mcp/result', metadata: resultMeta });
        }

        // Publish MCP result via SSE so Token Chain MCP Results tab updates immediately
        const _durationMs = Date.now() - startTime;
        deps.publishMcpResultToSse(flowTraceId, { tool, result, durationMs: _durationMs, isDelegated: !!mcpAccessToken, userId: userSub });
        // Also record in local audit store (covers BFF-proxied calls)
        deps.recordMcpToolCall({ userId: userSub || 'unknown', toolName: tool, success: !result?.isError, duration: _durationMs, resultSummary: result?.isError ? `${tool} failed` : `${tool} completed`, isDelegated: !!mcpAccessToken });

        deps.emit({
            phase: 'mcp_remote_done'
        });

        // Detect auth challenge from MCP server — fall back to local handler
        // instead of surfacing the redirect challenge to the client. The BFF
        // already has the user's session so local execution is preferred.
        const mcpContent = result?.content;
        const hasAuthChallenge = Array.isArray(mcpContent)
            && mcpContent.some(c => c && c.authChallenge);
        if (hasAuthChallenge) {
            deps.emit({ phase: 'mcp_auth_challenge_intercepted' });
            console.log(`[MCP Proxy] ${tool} — MCP server returned auth challenge, using local fallback`);
            const sessionUser = req.session?.user;
            if (sessionUser?.id) {
                try {
                    const effectiveUserId = sessionUser.oauthId || sessionUser.id;
                    deps.emit({ phase: 'local_tool_start', path: 'auth_challenge_fallback' });
                    const localResult = await deps.callToolLocal(tool, params || {}, effectiveUserId, req);
                    deps.emit({ phase: 'local_tool_done', path: 'auth_challenge_fallback' });
                    const _acDuration = Date.now() - startTime;
                    deps.publishMcpResultToSse(flowTraceId, { tool, result: localResult, durationMs: _acDuration, isDelegated: false, userId: effectiveUserId });
                    deps.recordMcpToolCall({ userId: effectiveUserId, toolName: tool, success: !localResult?.error, duration: _acDuration, resultSummary: localResult?.error ? `${tool} failed` : `${tool} completed` });
                    return localResultOutcome(localResult, tokenEvents, { _localFallback: true });
                } catch (localErr) {
                    console.error(`[MCP Local] ${tool} — auth-challenge fallback failed:`, localErr.message);
                    deps.emit({ phase: 'local_tool_error', path: 'auth_challenge_fallback' });
                }
            }
        }

        // Get active LLM model for logging and client display
        const langchainConfig = req.session?.langchain_config || {};
        const activeProvider = langchainConfig.provider || 'helix';
        const activeModel = langchainConfig.model || 'gpt-4o-mini';
        console.log(`[/api/mcp/tool] ${tool} — using LLM: ${activeProvider}/${activeModel}`);

        // A successful gateway/backend tool result whose CONTENT is a
        // hitl_required / step_up_required signal must surface as HTTP 428
        // (consistent with the simulated-Authorize gate and the local-handler
        // path), not HTTP 200 with the signal buried in tool text
        // (REGRESSION_PLAN §1 — 428 enforcement; Phase 170 all-transfers-consent).
        const contentHitl = hitlSignalInResultContent(result);
        if (contentHitl) {
            deps.emit({ phase: 'mcp_result_hitl_required' });
            return localResultOutcome(contentHitl, tokenEvents, { _hitlFromResultContent: true });
        }

        const out = {
            result,
            tokenEvents,
            activeModel,
            activeProvider
        };
        if (mcpAuthorizeEvaluationThisRequest) {
            out.mcpAuthorizeEvaluation = mcpAuthorizeEvaluationThisRequest;
        }

        // Stream response when using HTTP/2 transport (client detects via Content-Type)
        if (useHttp2) {
            return { kind: 'result', httpStatus: 200, stream: true, tokenEvents, body: { result, tokenEvents } };
        }
        return { kind: 'result', httpStatus: 200, tokenEvents, body: out };
    } catch (err) {
        // Scope denial: MCP server returned -32005 (valid token, wrong scope).
        // Return 403 — do NOT fall back to the local tool handler.
        if (err.code === 'mcp_insufficient_scope') {
            const d = err.mcpErrorData || {};
            console.warn(`[/api/mcp/tool] Scope denied for tool '${tool}': missing [${(d.missingScopes || []).join(', ')}]`);
            return { kind: 'block', httpStatus: 403, body: {
                error: 'mcp_scope_denied',
                tool,
                requiredScopes: d.requiredScopes || [],
                missingScopes: d.missingScopes || [],
                availableScopes: d.availableScopes || [],
            } };
        }

        // Gateway policy denial — propagate structured error to the UI for educational display.
        // Do NOT fall back to the local handler: the gateway denied for a policy reason
        // (audience mismatch, expired token, origin restriction) that local execution cannot bypass.
        if (err.code === 'gateway_policy_denied' || err.code === 'gateway_auth_failed') {
            console.warn(`[/api/mcp/tool] Gateway denied tool '${tool}': ${err.gatewayErrorCode || err.code} — ${err.message}`);
            deps.emit({ phase: 'gateway_policy_denied', gatewayErrorCode: err.gatewayErrorCode });

            // HTTP 428 Precondition Required: step-up auth needed (INDETERMINATE decision)
            if (err.gatewayErrorCode === 'hitl_required') {
                deps.emit({ phase: 'gateway_step_up_required' });
                return { kind: 'block', httpStatus: 428, tokenEvents, body: {
                    error: 'step_up_required',
                    tool,
                    message: 'Transaction requires additional authentication (step-up MFA)',
                    tokenEvents,
                } };
            }

            return { kind: 'block', httpStatus: 403, tokenEvents, body: {
                error: 'gateway_policy_denied',
                tool,
                gatewayErrorCode: err.gatewayErrorCode || err.code,
                message: err.message,
                tokenEvents,
            } };
        }

        const isConnErr =
            err.useLocal ||
            err.message.includes('ECONNREFUSED') ||
            err.message.includes('ENETUNREACH') ||
            err.message.includes('timed out') ||
            err.message.includes('connect ETIMEDOUT') ||
            (err.code && ['ECONNREFUSED', 'ENETUNREACH', 'ETIMEDOUT'].includes(err.code));

        if (!isConnErr) {
            deps.emit({
                phase: 'mcp_remote_tool_error'
            });
            console.error(`[MCP Proxy] Error calling ${tool}:`, err.message);
            return { kind: 'error', httpStatus: 502, body: {
                error: 'mcp_error',
                message: err.message,
                tokenEvents
            } };
        }

        deps.emit({
            phase: 'mcp_remote_unreachable'
        });
        // ── Local fallback ──────────────────────────────────────────────────────
        const sessionUser = req.session ?.user;
        if (!sessionUser ?.id) {
            deps.emit({
                phase: 'local_fallback_blocked_no_user'
            });
            const r = deps.mcpNoBearerResponse(req, tokenEvents);
            return { kind: 'block', httpStatus: r.status, body: r.body };
        }

        console.log(`[MCP Local] ${tool} — MCP server unreachable (${mcpUrl}), using local handler`);
        try {
            deps.emit({
                phase: 'local_tool_start',
                path: 'remote_fallback'
            });
            // Use oauthId (PingOne sub/UUID) — accounts are keyed by UUID (same as authenticateToken / REST routes).
            const effectiveUserId = sessionUser.oauthId || sessionUser.id;
            const result = await deps.callToolLocal(tool, params || {}, effectiveUserId, req);
            deps.emit({
                phase: 'local_tool_done',
                path: 'remote_fallback'
            });
            const _rfDuration = Date.now() - startTime;
            deps.publishMcpResultToSse(flowTraceId, { tool, result, durationMs: _rfDuration, isDelegated: false, userId: effectiveUserId });
            deps.recordMcpToolCall({ userId: effectiveUserId, toolName: tool, success: !result?.error, duration: _rfDuration, resultSummary: result?.error ? `${tool} failed` : `${tool} completed` });
            return { kind: 'result', httpStatus: 200, tokenEvents, body: {
                result,
                tokenEvents,
                _localFallback: true
            } };
        } catch (localErr) {
            deps.emit({
                phase: 'local_tool_error',
                path: 'remote_fallback'
            });
            console.error(`[MCP Local] Error calling ${tool}:`, localErr.message);
            return { kind: 'error', httpStatus: 502, body: {
                error: 'mcp_error',
                message: localErr.message,
                tokenEvents
            } };
        }
    }
}

module.exports = { runMcpToolPipeline };
