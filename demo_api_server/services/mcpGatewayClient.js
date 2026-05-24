'use strict';
/**
 * mcpGatewayClient.js — HTTP client for the banking-mcp-gateway.
 *
 * Routes tool calls through the MCP gateway instead of directly to the MCP
 * server. The gateway owns RFC 9728 protected-resource metadata, runs
 * PingOne Authorize policy evaluation, and performs the final RFC 8693
 * token exchange to the upstream MCP server — the BFF-issued token is the
 * bearer here and must already be scoped to the gateway audience.
 *
 * Source of Truth for gateway URL:
 *   configStore key: mcp_gateway_http_url  (persisted to SQLite, survives restarts)
 *   Env var fallback: MCP_GATEWAY_HTTP_URL
 *   Default: https://api.ping.demo:3005
 *
 * TLS validation:
 *   Default: ENABLED (rejectUnauthorized: true). Set MCP_GATEWAY_REJECT_UNAUTHORIZED=0
 *   to opt out for local dev (mkcert self-signed). This flag is forbidden in production.
 *
 * Other env vars:
 *   MCP_GATEWAY_TIMEOUT_MS — per-request timeout in ms (default: 30000)
 */

const crypto = require('node:crypto');
const axios = require('axios');
const https = require('node:https');
const configStore = require('./configStore');

// TLS cert validation is ON by default. Opt out only for local dev.
// Refusing opt-out in production prevents MITM exfil of bearer tokens.
const _allowInsecureTls = process.env.MCP_GATEWAY_REJECT_UNAUTHORIZED === '0';
if (_allowInsecureTls && process.env.NODE_ENV === 'production') {
    // Hard-fail: insecure TLS in production would expose MCP bearer tokens.
    console.error('[FATAL] MCP_GATEWAY_REJECT_UNAUTHORIZED=0 is not permitted in production.');
    process.exit(1);
}
const _httpsAgent = new https.Agent({ rejectUnauthorized: !_allowInsecureTls });

const DEFAULT_TIMEOUT_MS    = 30_000;
// Keep in sync with demo_mcp_gateway and demo_mcp_server package.json#mcpVersion.
const MCP_PROTOCOL_VERSION  = '2025-11-25';

/**
 * Call an MCP tool via the gateway HTTP endpoint.
 *
 * @param {string} gatewayUrl   Base URL of the gateway (no trailing slash)
 * @param {string} bearerToken  Access token scoped to the gateway audience (MCP_GW_RESOURCE_URI)
 * @param {string} tool         MCP tool name (e.g. "get_accounts")
 * @param {object} params       Tool arguments
 * @param {object} [opts]
 * @param {string} [opts.correlationId]  Forwarded as JSON-RPC id for tracing
 * @param {string} [opts.sessionId]      Forwarded as mcp-session-id header if present
 * @returns {Promise<any>}  The JSON-RPC result value
 *
 * @throws {Error} with `.code` and `.httpStatus` for 401/403/5xx
 */
async function callToolViaGateway(gatewayUrl, bearerToken, tool, params = {}, opts = {}) {
    const base = (gatewayUrl || getMcpGatewayHttpUrl()).replace(/\/$/, '');
    const url  = `${base}/mcp`;

    const body = {
        jsonrpc: '2.0',
        id:      opts.correlationId || crypto.randomUUID(),
        method:  'tools/call',
        params:  { name: tool, arguments: params },
    };

    const headers = {
        'Authorization':        `Bearer ${bearerToken}`,
        'Content-Type':         'application/json',
        'Accept':               'application/json',
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    };
    if (opts.sessionId) {
        headers['mcp-session-id'] = opts.sessionId;
    }
    if (opts.tratContextHeader) {
        headers['X-TraT-Context'] = opts.tratContextHeader;
    }

    const rawTimeout = parseInt(
        configStore.getEffective('mcp_gateway_timeout_ms') || process.env.MCP_GATEWAY_TIMEOUT_MS || '',
        10
    );
    const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_TIMEOUT_MS;

    let response;
    try {
        response = await axios.post(url, body, {
            headers,
            timeout: timeoutMs,
            // Handle error status codes ourselves so we can emit structured errors
            validateStatus: () => true,
            httpsAgent: _httpsAgent,
        });
    } catch (axErr) {
        console.error(
            '[mcpGatewayClient] axios error: code=%s message=%s url=%s',
            axErr.code, axErr.message, axErr.config?.url
        );
        throw axErr;
    }

    const status = response.status;

    if (status === 401) {
        throw Object.assign(
            new Error('Gateway authentication failed — token may be missing or expired'),
            { code: 'gateway_auth_failed', httpStatus: 401 },
        );
    }

    if (status === 403) {
        // Log only structured error fields — not the full body which may echo
        // parts of the Authorization header in some gateway implementations.
        const body403 = response.data || {};
        console.warn(
            '[mcpGatewayClient] 403 policy denied: error=%s message=%s',
            body403.error || 'forbidden',
            body403.message || '(no message)'
        );
        throw Object.assign(
            new Error(body403.message || 'Gateway policy denied the tool call'),
            {
                code: 'gateway_policy_denied',
                httpStatus: 403,
                gatewayErrorCode: body403.error || 'forbidden',
                gatewayMessage: body403.message || '',
            },
        );
    }

    // Redirects from a misconfigured gateway (e.g. 302 → login page) are not
    // transparent here — surface them as explicit errors rather than falling
    // through to JSON parsing an HTML body.
    if (status >= 300 && status < 400) {
        throw Object.assign(
            new Error(`Gateway returned unexpected redirect (HTTP ${status})`),
            { code: 'gateway_redirect_error', httpStatus: status },
        );
    }

    if (status >= 500) {
        throw Object.assign(
            new Error(`Gateway upstream error (HTTP ${status})`),
            { code: 'gateway_upstream_error', httpStatus: status },
        );
    }

    if (status >= 400) {
        throw Object.assign(
            new Error(`Gateway returned HTTP ${status}`),
            { code: 'gateway_client_error', httpStatus: status },
        );
    }

    // Extract audit trail header if present (set by gateway on all responses)
    let gwAuditTrail = null;
    const auditHeader = response.headers['x-gw-audit-trail'];
    if (auditHeader) {
        try {
            gwAuditTrail = JSON.parse(auditHeader);
        } catch (err) {
            console.warn('[mcpGatewayClient] Could not parse X-Gw-Audit-Trail header:', err.message);
        }
    }

    // JSON-RPC error envelope in a 200 response (e.g. gateway api_key dispatch
    // failed to reach the backend). Surface as a structured error so callers
    // get a meaningful message rather than an opaque { error: {...} } object.
    if (response.data?.error != null && response.data?.result === undefined) {
        const rpcErr = response.data.error;
        const msg = (typeof rpcErr === 'object' ? rpcErr.message : String(rpcErr)) || 'MCP tool call failed';
        throw Object.assign(
            new Error(msg),
            { code: 'mcp_tool_error', httpStatus: 200, rpcCode: typeof rpcErr === 'object' ? rpcErr.code : undefined },
        );
    }

    // JSON-RPC responses: prefer .result, fall through to full body for
    // non-standard / direct responses from the upstream MCP server.
    const result = response.data?.result ?? response.data;

    return { result, gwAuditTrail };
}

/**
 * Resolve the configured gateway base URL.
 * SoT: configStore key 'mcp_gateway_http_url' (persisted to SQLite/LMDB).
 * Fallback: MCP_GATEWAY_HTTP_URL env var.
 * Throws if neither is set — an unconfigured gateway must fail explicitly,
 * not silently use a stale default that produces a confusing connection error.
 */
function getMcpGatewayHttpUrl() {
    const url = configStore.getEffective('mcp_gateway_http_url');
    if (!url) {
        throw new Error(
            'MCP gateway URL not configured. ' +
            'Set mcp_gateway_http_url via /config or set MCP_GATEWAY_HTTP_URL in .env.'
        );
    }
    return url.replace(/\/$/, '');
}

module.exports = { callToolViaGateway, getMcpGatewayHttpUrl };
