'use strict';
/**
 * GET /api/admin/mcp-gateway/config
 *
 * Returns mock gateway status, current configuration summary, and the
 * generated PingGateway 2025.11.1 mcp.json route file for real deployments.
 *
 * Auth is enforced by authenticateToken middleware in server.js.
 */
const express = require('express');
const http = require('http');
const configStore = require('../services/configStore');
const router = express.Router();

// ---------------------------------------------------------------------------
// Health probe to the mock gateway
// ---------------------------------------------------------------------------
function probeGatewayHealth(gatewayUrl) {
    return new Promise((resolve) => {
        const url = new URL(gatewayUrl.replace(/\/$/, '') + '/health');
        const opts = { hostname: url.hostname, port: parseInt(url.port || '3005', 10), path: url.pathname, method: 'GET', timeout: 3000 };
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve({ running: res.statusCode === 200, response: JSON.parse(data) }); }
                catch { resolve({ running: res.statusCode === 200, response: null }); }
            });
        });
        req.on('error', () => resolve({ running: false, response: null }));
        req.on('timeout', () => { req.destroy(); resolve({ running: false, response: null }); });
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Generate a real PingGateway 2025.11.1 mcp.json route configuration.
//
// Schema matches the official PingGateway MCP TOI (Feb 2026) and public docs:
//   https://docs.pingidentity.com/pinggateway/2025.11/mcp/index.html
//
// Filter pipeline (in order):
//   McpAuditFilter -> UriPathRewriteFilter -> McpProtectionFilter ->
//   McpValidationFilter -> ReverseProxyHandler
// ---------------------------------------------------------------------------
function buildPingGatewayMcpJson(cfg) {
    const pingOneEnvUrl  = cfg.pingOneEnvUrl;      // https://auth.pingone.com/\<envId\>
    const pingOneResId   = cfg.pingOneResourceId;  // PingOne resource client_id (for introspect)
    const gatewayPublic  = cfg.gatewayPublicUrl;   // https://ig.example.com:8443
    const mcpServerUrl   = cfg.upstreamMcpUrl;     // http://localhost:8000
    const mcpScope       = cfg.mcpScope || 'test';

    return {
        name: 'mcp',
        condition: '${find(request.uri.path, \'^/mcp\')}',
        properties: {
            pingOneEnvID:      pingOneEnvUrl,
            pingOneResourceID: pingOneResId,
            gatewayUrl:        gatewayPublic,
            mcpServerUrl:      mcpServerUrl,
        },
        baseURI: '&{mcpServerUrl}',
        heap: [
            {
                name: 'SystemAndEnvSecretStore-1',
                type: 'SystemAndEnvSecretStore',
            },
            {
                name: 'AuditService',
                type: 'AuditService',
                config: {
                    eventHandlers: [{
                        class: 'org.forgerock.audit.handlers.json.JsonAuditEventHandler',
                        config: {
                            name: 'json',
                            logDirectory: '&{ig.instance.dir}/audit',
                            topics: ['access', 'mcp'],
                        },
                    }],
                },
            },
            {
                // Introspects bearer tokens against PingOne /as/introspect.
                // Requires RESOURCE_SECRET_ID env var set to base64 of the
                // PingOne resource client secret (no trailing newline):
                //   printf '%s' "<secret>" | base64
                name: 'rsFilter',
                type: 'OAuth2ResourceServerFilter',
                config: {
                    requireHttps: false,
                    scopes: [mcpScope],
                    accessTokenResolver: {
                        type: 'TokenIntrospectionAccessTokenResolver',
                        config: {
                            endpoint: '&{pingOneEnvID}/as/introspect',
                            providerHandler: {
                                type: 'Chain',
                                config: {
                                    filters: [{
                                        type: 'HttpBasicAuthenticationClientFilter',
                                        config: {
                                            username: '&{pingOneResourceID}',
                                            passwordSecretId: 'resource.secret.id',
                                            secretsProvider: 'SystemAndEnvSecretStore-1',
                                        },
                                    }],
                                    handler: 'ForgeRockClientHandler',
                                },
                            },
                        },
                    },
                },
            },
        ],
        handler: {
            type: 'Chain',
            config: {
                filters: [
                    {
                        type: 'McpAuditFilter',
                        config: { auditService: 'AuditService' },
                    },
                    {
                        // Strip /mcp prefix — MCP server expects requests at /
                        type: 'UriPathRewriteFilter',
                        config: { mappings: { '/mcp': '/' } },
                    },
                    {
                        // Serves /.well-known/oauth-protected-resource (RFC 9728).
                        // Validates token aud against resourceId, adds resource_metadata
                        // to WWW-Authenticate on 401.
                        type: 'McpProtectionFilter',
                        config: {
                            resourceId: '&{gatewayUrl}/mcp',
                            authorizationServerUri: '&{pingOneEnvID}/as',
                            resourceServerFilter: 'rsFilter',
                            supportedScopes: [mcpScope],
                            resourceIdPointer: '/aud/0',
                        },
                    },
                    {
                        // Validates Origin, Accept header, and JSON-RPC 2.0 envelope.
                        // Populates ${contexts.mcp} with protocol version + session id.
                        type: 'McpValidationFilter',
                        config: { acceptedOrigins: '.*' },
                    },
                ],
                handler: {
                    type: 'ReverseProxyHandler',
                    config: { soTimeout: '20 seconds' },
                },
            },
        },
    };
}

// ---------------------------------------------------------------------------
// admin.json snippet — merge into PingGateway admin.json.
// streamingEnabled: true is required for MCP SSE transport.
// ---------------------------------------------------------------------------
function buildAdminJsonSnippet() {
    return {
        _comment: 'Merge into PingGateway admin.json — streamingEnabled required for MCP SSE transport',
        adminConnector: { host: 'localhost', port: 8085 },
        connectors: [
            { port: 8080 },
            { port: 8443, tls: 'ServerTlsOptions-1' },
        ],
        streamingEnabled: true,
    };
}

// ---------------------------------------------------------------------------
// GET /api/admin/mcp-gateway/config
// ---------------------------------------------------------------------------
router.get('/config', async (req, res) => {
  try {
    const defaultGatewayUrl = `http://localhost:3005`;
    const gatewayUrl     = process.env.MCP_GATEWAY_HTTP_URL || defaultGatewayUrl;
    const gatewayEnabled = !!process.env.MCP_GATEWAY_HTTP_URL;
    const devBypass      = process.env.MCP_GW_DEV_BYPASS === 'true';

    const { running, response: healthResponse } = await probeGatewayHealth(gatewayUrl);

    const envId  = configStore.getEffective('pingone_environment_id') || '<PingOne Environment ID>';
    const region = configStore.getEffective('pingone_region') || 'com';

    const cfg = {
        // Mock gateway fields
        gatewayResourceUri:    process.env.MCP_GW_RESOURCE_URI     || configStore.getEffective('pingone_resource_mcp_gateway_uri') || '',
        upstreamMcpUrl:        process.env.MCP_OLB_WS_URL           || configStore.getEffective('mcp_server_url') || 'http://localhost:8000',
        mcpOlbResourceUri:     process.env.MCP_OLB_RESOURCE_URI    || '',
        mcpInvestWsUrl:        process.env.MCP_INVEST_WS_URL        || '',
        mcpInvestResourceUri:  process.env.MCP_INVEST_RESOURCE_URI  || '',
        hitlServiceUrl:        process.env.HITL_SERVICE_URL         || '',
        pingAuthorizeEndpoint: process.env.PINGAUTHORIZE_ENDPOINT   || '',
        pingAuthorizeWorkerId: process.env.PINGAUTHORIZE_WORKER_ID  || '',

        // Real PingGateway 2025.11.1 mcp.json fields
        pingOneEnvUrl:    `https://auth.pingone.${region}/${envId}`,
        pingOneResourceId: process.env.MCP_GW_CLIENT_ID             || '<PingOne test resource ID>',
        gatewayPublicUrl:  process.env.MCP_GW_RESOURCE_URI
            ? process.env.MCP_GW_RESOURCE_URI.replace(/\/mcp$/, '')
            : 'https://ig.example.com:8443',
        mcpScope: 'test',
    };

    res.json({
        mcpMode: configStore.get('mcp_use_pingone_server') === 'true' ? 'pingone' : 'custom',
        mock: {
            enabled: gatewayEnabled,
            running,
            devBypass,
            url: gatewayUrl,
            health: healthResponse,
        },
        config: cfg,
        envVars: {
            required: {
                MCP_GW_RESOURCE_URI:     process.env.MCP_GW_RESOURCE_URI     ? '••••' : 'NOT SET',
                MCP_GW_CLIENT_ID:        process.env.MCP_GW_CLIENT_ID        ? '••••' : 'NOT SET',
                MCP_GW_CLIENT_SECRET:    process.env.MCP_GW_CLIENT_SECRET    ? '••••' : 'NOT SET',
                PINGONE_TOKEN_ENDPOINT:  process.env.PINGONE_TOKEN_ENDPOINT   ? '••••' : 'NOT SET',
                MCP_OLB_RESOURCE_URI:    process.env.MCP_OLB_RESOURCE_URI    ? '••••' : 'NOT SET',
                MCP_INVEST_RESOURCE_URI: process.env.MCP_INVEST_RESOURCE_URI  ? '••••' : 'NOT SET',
            },
            optional: {
                MCP_GATEWAY_HTTP_URL:    process.env.MCP_GATEWAY_HTTP_URL    || '(not set — gateway routing disabled)',
                MCP_GW_DEV_BYPASS:       process.env.MCP_GW_DEV_BYPASS       || 'false',
                PINGAUTHORIZE_ENDPOINT:  process.env.PINGAUTHORIZE_ENDPOINT   || '(not set — permit-all)',
                PINGAUTHORIZE_WORKER_ID: process.env.PINGAUTHORIZE_WORKER_ID  || '(not set)',
                RESOURCE_SECRET_ID:      process.env.RESOURCE_SECRET_ID       ? '••••' : '(not set — required for real PingGateway)',
            },
        },
        // Drop into $HOME/.openig/config/routes/mcp.json
        pingGatewayJson: buildPingGatewayMcpJson(cfg),
        // Merge into PingGateway admin.json (streamingEnabled required for SSE)
        pingGatewayAdminJson: buildAdminJsonSnippet(),
    });
  } catch (err) {
    console.error('[mcpGatewayConfig] GET /config error:', err.message);
    res.status(500).json({ error: 'gateway_config_error', message: err.message });
  }
});


// ---------------------------------------------------------------------------
// POST /api/admin/mcp-gateway/config — push config to the running mock gateway
// ---------------------------------------------------------------------------
router.post('/config', async (req, res) => {
    const gatewayUrl = process.env.MCP_GATEWAY_HTTP_URL || 'http://localhost:3005';

    const allowed = [
        'gatewayResourceUri', 'mcpOlbWsUrl', 'mcpInvestWsUrl',
        'mcpOlbResourceUri', 'mcpInvestResourceUri',
        'pingAuthorizeEndpoint', 'pingAuthorizeWorkerId',
        'hitlServiceUrl', 'devBypass',
    ];

    const updates = {};
    for (const key of allowed) {
        if (key in (req.body || {})) {
            updates[key] = req.body[key];
        }
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
    }

    try {
        const target = new URL('/admin/config', gatewayUrl);
        const body = JSON.stringify(updates);

        const response = await new Promise((resolve, reject) => {
            const http = require('http');
            const opts = {
                hostname: target.hostname,
                port: parseInt(target.port || '3005', 10),
                path: target.pathname,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
                timeout: 5000,
            };
            const req2 = http.request(opts, (r) => {
                let data = '';
                r.on('data', (c) => { data += c; });
                r.on('end', () => {
                    try { resolve({ status: r.statusCode, body: JSON.parse(data) }); }
                    catch { resolve({ status: r.statusCode, body: data }); }
                });
            });
            req2.on('error', reject);
            req2.on('timeout', () => { req2.destroy(); reject(new Error('Gateway config push timed out')); });
            req2.write(body);
            req2.end();
        });

        if (response.status !== 200) {
            return res.status(502).json({ error: 'Gateway returned error', detail: response.body });
        }
        res.json({ ok: true, pushed: updates, gatewayConfig: response.body.config });
    } catch (err) {
        res.status(502).json({ error: 'Could not reach mock gateway', detail: err.message });
    }
});

module.exports = router;
