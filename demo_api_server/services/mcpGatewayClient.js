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
 * Other env vars:
 *   MCP_GATEWAY_TIMEOUT_MS — per-request timeout in ms (default: 30000)
 */

const axios = require('axios');
const https = require('node:https');
const configStore = require('./configStore');

// mkcert TLS cert covers api.ping.demo — rejectUnauthorized off for local dev.
// Set MCP_GATEWAY_REJECT_UNAUTHORIZED=1 to enforce cert validation in prod.
const _gatewayRejectUnauthorized = process.env.MCP_GATEWAY_REJECT_UNAUTHORIZED === '1';
const _devHttpsAgent = new https.Agent({ rejectUnauthorized: _gatewayRejectUnauthorized });

// Fallback used only when configStore has no value and env var is unset.
const DEFAULT_GATEWAY_URL = 'https://api.ping.demo:3005';
const DEFAULT_TIMEOUT_MS  = 30_000;
const MCP_PROTOCOL_VERSION = '2025-11-25';

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
        id:      opts.correlationId || Date.now(),
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

    const timeoutMs = parseInt(process.env.MCP_GATEWAY_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS;

    let response;
    try {
        response = await axios.post(url, body, {
            headers,
            timeout: timeoutMs,
            // Handle error status codes ourselves so we can emit structured errors
            validateStatus: () => true,
            // Allow self-signed certs if a deployment puts the gateway behind HTTPS
            httpsAgent: _devHttpsAgent,
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
        // Attach the gateway's response body so the BFF can surface the policy reason to the UI.
        const body403 = response.data || {};
        console.error('[mcpGatewayClient] 403 full response body:', JSON.stringify(body403));
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
 * SoT: configStore key 'mcp_gateway_http_url' (persisted to SQLite).
 * Fallback chain: configStore → MCP_GATEWAY_HTTP_URL env → DEFAULT_GATEWAY_URL.
 */
function getMcpGatewayHttpUrl() {
    const stored = configStore.getEffective('mcp_gateway_http_url');
    return (stored || DEFAULT_GATEWAY_URL).replace(/\/$/, '');
}

module.exports = { callToolViaGateway, getMcpGatewayHttpUrl };
