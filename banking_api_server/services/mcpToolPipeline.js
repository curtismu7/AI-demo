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
        // (e.g. ENDUSER_AUDIENCE login path only carries banking:agent:invoke, not
        // banking:write), PingOne returns 400 "At least one scope must be granted".
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
                return { kind: 'result', httpStatus: 200, tokenEvents: fallbackEvents, body: {
                    result,
                    tokenEvents: fallbackEvents,
                    _localFallback: true,
                    _exchangeFailed: true
                } };
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
                return { kind: 'result', httpStatus: 200, tokenEvents, body: {
                    result,
                    tokenEvents,
                    _localFallback: true
                } };
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

  ctx._mcpAccessToken = mcpAccessToken;
  ctx._userSub = userSub;
  ctx._tokenEvents = tokenEvents;
  throw new Error('runMcpToolPipeline: authorize phase not yet implemented');
}

module.exports = { runMcpToolPipeline };
