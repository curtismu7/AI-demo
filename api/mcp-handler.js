/**
 * Vercel Serverless Function — MCP Server (HTTP Streamable Transport)
 *
 * Exposes the banking MCP server's HTTP transport as Vercel serverless functions.
 * WebSocket transport is NOT supported (Vercel is request/response only).
 *
 * Routes handled:
 *   POST   /mcp                                  — MCP JSON-RPC endpoint
 *   DELETE  /mcp                                  — Session termination
 *   GET     /mcp                                  — 405 (SSE not supported)
 *   GET     /.well-known/oauth-protected-resource — RFC 9728 metadata
 *   GET     /.well-known/mcp-server               — Public MCP discovery manifest
 *   GET     /mcp/health                           — Health check
 *
 * Environment variables (set in Vercel Dashboard):
 *   PINGONE_BASE_URL, PINGONE_CLIENT_ID, PINGONE_CLIENT_SECRET,
 *   PINGONE_INTROSPECTION_ENDPOINT, PINGONE_AUTHORIZATION_ENDPOINT,
 *   PINGONE_TOKEN_ENDPOINT, BANKING_API_BASE_URL,
 *   MCP_RESOURCE_URL, MCP_ALLOWED_ORIGINS, ENCRYPTION_KEY
 */

// The MCP server is TypeScript, compiled to dist/
// We initialize components lazily to keep cold-start fast
let httpTransport = null;
let initialized = false;

function ensureInitialized() {
  if (initialized) return;

  try {
    const { BankingAuthenticationManager } = require('../banking_mcp_server/dist/auth/BankingAuthenticationManager');
    const { BankingSessionManager } = require('../banking_mcp_server/dist/storage/BankingSessionManager');
    const { BankingToolProvider } = require('../banking_mcp_server/dist/tools/BankingToolProvider');
    const { BankingAPIClient } = require('../banking_mcp_server/dist/banking/BankingAPIClient');
    const { MCPMessageHandler } = require('../banking_mcp_server/dist/server/MCPMessageHandler');
    const { HttpMCPTransport } = require('../banking_mcp_server/dist/server/HttpMCPTransport');

    // PingOne configuration
    const pingoneConfig = {
      baseUrl: process.env.PINGONE_BASE_URL || 'https://auth.pingone.com/unknown/as',
      clientId: process.env.PINGONE_CLIENT_ID || '',
      clientSecret: process.env.PINGONE_CLIENT_SECRET || '',
      introspectionEndpoint: process.env.PINGONE_INTROSPECTION_ENDPOINT || '',
      authorizationEndpoint: process.env.PINGONE_AUTHORIZATION_ENDPOINT || '',
      tokenEndpoint: process.env.PINGONE_TOKEN_ENDPOINT || '',
      // Optional fields the auth manager may look for
      environmentId: (process.env.PINGONE_BASE_URL || '').split('/').filter(Boolean).slice(-2, -1)[0] || '',
    };

    const authManager = new BankingAuthenticationManager(pingoneConfig);

    // Session manager — use temp dir on Vercel (ephemeral, but no disk persistence needed for HTTP transport)
    const sessionManager = new BankingSessionManager(
      '/tmp/mcp-tokens',                               // tokenStoragePath
      process.env.ENCRYPTION_KEY || 'vercel-dev-key-32chars-replace!', // encryptionKey
      3600,                                             // Cache TTL (1 hour)
      60 * 60 * 1000                                    // Cleanup interval
    );

    // Banking API client
    const bankingClient = new BankingAPIClient({
      baseUrl: process.env.BANKING_API_BASE_URL || 'https://bxfinance-demo.vercel.app/api',
      timeout: parseInt(process.env.BANKING_API_TIMEOUT || '25000', 10), // Shorter for Vercel 30s limit
      maxRetries: parseInt(process.env.BANKING_API_MAX_RETRIES || '2', 10),
      circuitBreakerThreshold: 5,
    });

    // Tool provider
    const toolProvider = new BankingToolProvider(bankingClient, authManager, sessionManager);

    // Message handler
    const messageHandler = new MCPMessageHandler(authManager, sessionManager, toolProvider);

    // HTTP transport config
    const resourceUrl = process.env.MCP_RESOURCE_URL || 'https://bxfinance-demo.vercel.app';
    const authServerUrl = (process.env.PINGONE_AUTHORIZATION_ENDPOINT || '')
      .replace('/authorize', '')
      .replace(/\/+$/, '') || pingoneConfig.baseUrl;
    const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS || '')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    httpTransport = new HttpMCPTransport(
      { resourceUrl, authServerUrl, allowedOrigins },
      messageHandler,
      sessionManager,
      authManager
    );

    initialized = true;
    console.log('[mcp-handler] MCP HTTP transport initialized for Vercel');
  } catch (err) {
    console.error('[mcp-handler] Failed to initialize MCP transport:', err.message);
    console.error('[mcp-handler] Stack:', err.stack);
    throw err;
  }
}

/**
 * Vercel serverless handler
 * Converts Vercel req/res to Node HTTP request/response for the MCP transport
 */
module.exports = async function handler(req, res) {
  // Health check — fast path before full initialization
  if (req.url === '/mcp/health' || req.url === '/mcp-server/health') {
    return res.status(200).json({
      status: 'healthy',
      transport: 'http-streamable',
      runtime: 'vercel-serverless',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    ensureInitialized();
  } catch (err) {
    return res.status(503).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'MCP server initialization failed',
        data: { reason: err.message },
      },
    });
  }

  // Map Vercel URL to the pathname the transport expects
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname;

  // Strip Vercel route prefix if present
  // vercel.json routes /mcp-server/* → this handler, so pathname may be /mcp-server/mcp
  if (pathname.startsWith('/mcp-server')) {
    pathname = pathname.replace('/mcp-server', '') || '/';
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Session-Id, MCP-Protocol-Version');
    res.setHeader('Access-Control-Expose-Headers', 'MCP-Session-Id');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  // Delegate to the HTTP transport
  // The transport expects Node http.IncomingMessage + http.ServerResponse
  // Vercel's req/res are compatible (they extend Node's)
  try {
    // Patch req.url to the cleaned pathname (HttpMCPTransport parses it)
    const originalUrl = req.url;
    req.url = pathname + url.search;

    await httpTransport.handleRequest(req, res, pathname);

    // Restore original URL (safety)
    req.url = originalUrl;
  } catch (err) {
    console.error('[mcp-handler] Request handling error:', err.message);

    // Don't double-send headers if transport already responded
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal server error',
        },
      });
    }
  }
};
