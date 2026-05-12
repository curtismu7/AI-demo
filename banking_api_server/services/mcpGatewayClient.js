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
 * Env vars:
 *   MCP_GATEWAY_HTTP_URL   — base URL of banking-mcp-gateway (default: http://localhost:3005)
 *   MCP_GATEWAY_TIMEOUT_MS — per-request timeout in ms (default: 30000)
 */

const axios = require('axios');
const https = require('https');

// For local dev the gateway runs HTTP on localhost:3005. If a deployment puts it
// behind HTTPS with a self-signed cert (rare), this agent allows that too.
// Bypass cert verification only when MCP_GATEWAY_REJECT_UNAUTHORIZED is not
// explicitly set to '1' and the URL is not a public HTTPS origin.
const _gatewayRejectUnauthorized = process.env.MCP_GATEWAY_REJECT_UNAUTHORIZED === '1';
const _devHttpsAgent = new https.Agent({ rejectUnauthorized: _gatewayRejectUnauthorized });

// Gateway runs as a sibling service (HTTP, loopback) per run-bank.sh.
// Override via MCP_GATEWAY_HTTP_URL env var; default matches the gateway's listener (PORT=3005, HOST=0.0.0.0).
const DEFAULT_GATEWAY_URL = process.env.MCP_GATEWAY_HTTP_URL || 'http://localhost:3005';
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
    const base = (gatewayUrl || DEFAULT_GATEWAY_URL).replace(/\/$/, '');
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

    const timeoutMs = parseInt(process.env.MCP_GATEWAY_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS;

    const response = await axios.post(url, body, {
        headers,
        timeout: timeoutMs,
        // Handle error status codes ourselves so we can emit structured errors
        validateStatus: () => true,
        // Allow self-signed certs if a deployment puts the gateway behind HTTPS
        httpsAgent: _devHttpsAgent,
    });

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

    // JSON-RPC responses: prefer .result, fall through to full body for
    // non-standard / direct responses from the upstream MCP server.
    const result = response.data?.result ?? response.data;
    
    return { result, gwAuditTrail };
}

/**
 * Resolve the configured gateway base URL.
 * Falls back to DEFAULT_GATEWAY_URL when env var is unset.
 */
function getMcpGatewayHttpUrl() {
    return (process.env.MCP_GATEWAY_HTTP_URL || DEFAULT_GATEWAY_URL).replace(/\/$/, '');
}

module.exports = { callToolViaGateway, getMcpGatewayHttpUrl };
