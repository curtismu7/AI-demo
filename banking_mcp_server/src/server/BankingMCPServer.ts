/**
 * Banking MCP Server
 * WebSocket server implementation for the Banking MCP protocol
 */

import WebSocket from 'ws';
import { createServer, Server as HttpServer } from 'http';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { MCPMessage, MCPResponse } from '../interfaces/mcp';
import { BankingAuthenticationManager } from '../auth/BankingAuthenticationManager';
import { BankingSessionManager } from '../storage/BankingSessionManager';
import { BankingToolProvider } from '../tools/BankingToolProvider';
import { MCPMessageHandler, MessageHandlerContext } from './MCPMessageHandler';
import { HttpMCPTransport } from './HttpMCPTransport';

export interface ServerConfig {
  host: string;
  port: number;
  maxConnections: number;
  sessionTimeout: number;
  enableLogging: boolean;
}

export interface ConnectionInfo {
  id: string;
  ws: WebSocket;
  sessionId?: string;
  agentToken?: string;
  /** Email of the authenticated user, injected via session_init message from the frontend. */
  userEmail?: string;
  connectedAt: Date;
  lastActivity: Date;
  messageCount: number;
  /** SHOULD (spec lifecycle): set to true when client sends notifications/initialized. */
  initialized?: boolean;
}

export interface ServerStats {
  totalConnections: number;
  activeConnections: number;
  totalMessages: number;
  totalErrors: number;
  uptime: number;
  startTime: Date;
}

export class BankingMCPServer extends EventEmitter {
  private server: WebSocket.Server | null = null;
  private httpServer: HttpServer | null = null;
  private connections: Map<string, ConnectionInfo> = new Map();
  private messageHandler: MCPMessageHandler;
  private httpTransport: HttpMCPTransport | null = null;
  private config: ServerConfig;
  private stats: ServerStats;
  private isRunning: boolean = false;

  constructor(
    config: ServerConfig,
    private authManager: BankingAuthenticationManager,
    private sessionManager: BankingSessionManager,
    private toolProvider: BankingToolProvider
  ) {
    super();
    this.config = config;
    this.messageHandler = new MCPMessageHandler(authManager, sessionManager, toolProvider);

    // HTTP Streamable MCP transport (spec 2025-11-25 — Phase D).
    // Enabled unless HTTP_MCP_TRANSPORT_ENABLED is explicitly set to 'false'.
    if (process.env.HTTP_MCP_TRANSPORT_ENABLED !== 'false') {
      const resourceUrl = process.env.MCP_RESOURCE_URL ||
        `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
      const authServerUrl = process.env.PINGONE_AUTHORIZATION_ENDPOINT
        ? process.env.PINGONE_AUTHORIZATION_ENDPOINT.replace('/authorize', '').replace(/\/+$/, '')
        : (process.env.PINGONE_BASE_URL ?? 'https://auth.pingone.com/unknown/as');
      const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean);
      this.httpTransport = new HttpMCPTransport(
        { resourceUrl, authServerUrl, allowedOrigins },
        this.messageHandler,
        sessionManager,
        authManager
      );
    }

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      totalMessages: 0,
      totalErrors: 0,
      uptime: 0,
      startTime: new Date()
    };
  }

  /**
   * Start the WebSocket server
   */
  async startServer(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    try {
      // Create HTTP server for WebSocket upgrade and OAuth callbacks
      this.httpServer = createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });
      
      // Create WebSocket server
      this.server = new WebSocket.Server({
        server: this.httpServer,
        maxPayload: 1024 * 1024, // 1MB max message size
        perMessageDeflate: true
      });

      // Set up server event handlers
      this.setupServerEventHandlers();

      // Start HTTP server
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.listen(this.config.port, this.config.host, (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.isRunning = true;
      this.stats.startTime = new Date();

      if (this.config.enableLogging) {
        console.log(`[BankingMCPServer] Server started on ${this.config.host}:${this.config.port}`);
        if (this.httpTransport) {
          const resourceUrl = process.env.MCP_RESOURCE_URL ||
            `http://${this.config.host === '0.0.0.0' ? 'localhost' : this.config.host}:${this.config.port}`;
          console.log(`[BankingMCPServer] HTTP MCP transport enabled — POST ${resourceUrl}/mcp`);
          console.log(`[BankingMCPServer] RFC 9728 metadata — GET ${resourceUrl}/.well-known/oauth-protected-resource`);
        }
      }

      this.emit('serverStarted', {
        host: this.config.host,
        port: this.config.port,
        timestamp: new Date()
      });

    } catch (error) {
      await this.cleanup();
      throw new Error(`Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop the WebSocket server
   */
  async stopServer(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Close all active connections
      for (const [connectionId] of this.connections.entries()) {
        await this.closeConnection(connectionId, 1001, 'Server shutting down');
      }

      // Close WebSocket server
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server!.close(() => {
            resolve();
          });
        });
      }

      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer!.close(() => {
            resolve();
          });
        });
      }

      await this.cleanup();

      if (this.config.enableLogging) {
        console.log('[BankingMCPServer] Server stopped');
      }

      this.emit('serverStopped', {
        timestamp: new Date(),
        uptime: Date.now() - this.stats.startTime.getTime()
      });

    } catch (error) {
      console.error('[BankingMCPServer] Error stopping server:', error);
      throw error;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  async handleConnection(ws: WebSocket, request: any): Promise<void> {
    const connectionId = uuidv4();
    const connectionInfo: ConnectionInfo = {
      id: connectionId,
      ws,
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0
    };

    try {
      // Check connection limits
      if (this.connections.size >= this.config.maxConnections) {
        ws.close(1013, 'Server at maximum capacity');
        return;
      }

      // Zero-trust: extract agent token from Authorization header if present (preferred over params)
      const authHeader = (request?.headers?.authorization || request?.headers?.Authorization) as string | undefined;
      if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        const bearerToken = authHeader.slice(7).trim();
        if (bearerToken) {
          connectionInfo.agentToken = bearerToken;
          console.log(`[BankingMCPServer] Agent token pre-authorized via Authorization header for connection ${connectionId}`);
        }
      }

      // Store connection
      this.connections.set(connectionId, connectionInfo);
      this.stats.totalConnections++;
      this.stats.activeConnections++;

      if (this.config.enableLogging) {
        console.log(`[BankingMCPServer] New connection: ${connectionId} (${this.stats.activeConnections} active)`);
      }

      // Set up connection event handlers
      this.setupConnectionEventHandlers(connectionId, ws);

      this.emit('connectionOpened', {
        connectionId,
        timestamp: new Date(),
        activeConnections: this.stats.activeConnections
      });

    } catch (error) {
      console.error(`[BankingMCPServer] Error handling connection ${connectionId}:`, error);
      await this.closeConnection(connectionId, 1011, 'Internal server error');
    }
  }

  /**
   * Process incoming MCP message
   */
  async processMessage(connectionId: string, rawMessage: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      // Update connection activity
      connection.lastActivity = new Date();
      connection.messageCount++;
      this.stats.totalMessages++;

      // Parse message
      let message: MCPMessage;
      try {
        message = JSON.parse(rawMessage);
      } catch (error) {
        await this.sendError(connectionId, 'parse_error', -32700, 'Parse error: Invalid JSON');
        return;
      }

      // Handle frontend session_init (non-MCP) — captures userEmail for CIBA.
      // This is injected by App.js before the MCP handshake.
      if ((message as any).type === 'session_init') {
        const email = (message as any).userEmail as string | undefined;
        if (email && typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          connection.userEmail = email;
          // Also persist to session if one already exists
          if (connection.sessionId) {
            this.sessionManager.setSessionEmail(connection.sessionId, email);
          }
          console.log(`[BankingMCPServer] session_init: stored email for connection ${connectionId}`);
        }
        // No response expected for session_init
        return;
      }

      // Validate message structure
      if (!this.isValidMCPMessage(message)) {
        const messageId = (message as any)?.id ?? 'unknown';
        await this.sendError(connectionId, messageId, -32600, 'Invalid Request: Missing required fields');
        return;
      }

      if (this.config.enableLogging) {
        console.log(`[BankingMCPServer] Processing message from ${connectionId}: ${message.method}`);
      }

      // Route message to appropriate handler
      const response = await this.routeMessage(connectionId, message);
      
      // Only send response for requests (JSON-RPC notifications have no id)
      if (response !== null && response !== undefined && message.id !== undefined && message.id !== null) {
        await this.sendResponse(connectionId, response);
      }

      this.emit('messageProcessed', {
        connectionId,
        method: message.method,
        messageId: message.id,
        timestamp: new Date()
      });

    } catch (error) {
      console.error(`[BankingMCPServer] Error processing message from ${connectionId}:`, error);
      this.stats.totalErrors++;
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.sendError(connectionId, 'unknown', -32603, `Internal error: ${errorMessage}`);

      this.emit('messageError', {
        connectionId,
        error: errorMessage,
        timestamp: new Date()
      });
    }
  }

  /**
   * Close a specific connection
   */
  async closeConnection(connectionId: string, code: number = 1000, reason: string = 'Normal closure'): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      // Close WebSocket if still open
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close(code, reason);
      }

      // Clean up connection data
      this.connections.delete(connectionId);
      this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);

      if (this.config.enableLogging) {
        console.log(`[BankingMCPServer] Connection closed: ${connectionId} (${this.stats.activeConnections} active)`);
      }

      this.emit('connectionClosed', {
        connectionId,
        code,
        reason,
        timestamp: new Date(),
        activeConnections: this.stats.activeConnections
      });

    } catch (error) {
      console.error(`[BankingMCPServer] Error closing connection ${connectionId}:`, error);
    }
  }

  /**
   * Get server statistics
   */
  getServerStats(): ServerStats {
    return {
      ...this.stats,
      uptime: this.isRunning ? Date.now() - this.stats.startTime.getTime() : 0,
      activeConnections: this.connections.size
    };
  }

  /**
   * Get connection information
   */
  getConnectionInfo(connectionId: string): ConnectionInfo | null {
    return this.connections.get(connectionId) || null;
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values());
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the actual port the server is listening on
   */
  getActualPort(): number | null {
    if (!this.httpServer || !this.isRunning) {
      return null;
    }
    
    const address = this.httpServer.address();
    if (address && typeof address === 'object') {
      return address.port;
    }
    
    return null;
  }

  /**
   * Set up server-level event handlers
   */
  private setupServerEventHandlers(): void {
    if (!this.server) {
      return;
    }

    this.server.on('connection', async (ws: WebSocket, request: any) => {
      await this.handleConnection(ws, request);
    });

    this.server.on('error', (error: Error) => {
      console.error('[BankingMCPServer] Server error:', error);
      this.emit('serverError', { error: error.message, timestamp: new Date() });
    });

    this.server.on('close', () => {
      if (this.config.enableLogging) {
        console.log('[BankingMCPServer] Server closed');
      }
    });
  }

  /**
   * Set up connection-specific event handlers
   */
  private setupConnectionEventHandlers(connectionId: string, ws: WebSocket): void {
    ws.on('message', async (data: WebSocket.Data) => {
      try {
        const message = data.toString();
        await this.processMessage(connectionId, message);
      } catch (error) {
        console.error(`[BankingMCPServer] Error handling message from ${connectionId}:`, error);
        await this.closeConnection(connectionId, 1011, 'Message processing error');
      }
    });

    ws.on('close', async (code: number, reason: Buffer) => {
      await this.closeConnection(connectionId, code, reason.toString());
    });

    ws.on('error', async (error: Error) => {
      console.error(`[BankingMCPServer] Connection error for ${connectionId}:`, error);
      await this.closeConnection(connectionId, 1011, 'Connection error');
    });

    ws.on('pong', () => {
      // Update last activity on pong response
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.lastActivity = new Date();
      }
    });
  }

  /**
   * Route message to appropriate handler
   */
  private async routeMessage(connectionId: string, message: MCPMessage): Promise<MCPResponse | null> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      if (message.id === undefined || message.id === null) {
        return null;
      }
      return this.createErrorResponse(message.id, -32603, 'Connection not found');
    }

    // SHOULD (spec lifecycle): intercept notifications/initialized to set per-connection flag.
    // This is handled here (not delegated) so we can track state on ConnectionInfo.
    if (message.method === 'notifications/initialized') {
      connection.initialized = true;
      if (this.config.enableLogging) {
        console.log(`[BankingMCPServer] Connection ${connectionId}: lifecycle ready (notifications/initialized received)`);
      }
      return null;
    }

    // SHOULD (spec lifecycle): reject tool/prompt/resource requests that arrive before the client
    // has completed the initialization handshake (initialize → notifications/initialized).
    // ping is always allowed; initialize is the first step.
    if (!connection.initialized &&
        message.method !== 'initialize' &&
        message.method !== 'ping') {
      if (message.id !== undefined && message.id !== null) {
        console.warn(`[BankingMCPServer] Premature request ${message.method} from ${connectionId} (notifications/initialized not yet received)`);
        return this.createErrorResponse(
          message.id,
          -32600,
          'Session not initialized — send notifications/initialized before making requests'
        );
      }
      return null; // ignore premature notifications silently
    }

    // Create message handler context
    const context: MessageHandlerContext = {
      connectionId,
      agentToken: connection.agentToken,
      session: connection.sessionId ? (await this.sessionManager.getSession(connection.sessionId)) || undefined : undefined,
      userEmail: connection.userEmail,
      sendNotification: (notification: object) => {
        if (connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.send(JSON.stringify(notification));
        }
      },
    };

    // Route to message handler
    const response = await this.messageHandler.handleMessage(message, context);

    // Update connection with session info if it was created during message handling
    if (context.session && !connection.sessionId) {
      connection.sessionId = context.session.sessionId;
      connection.agentToken = context.agentToken;
      // Persist deferred email if we just created the session
      if (connection.userEmail) {
        this.sessionManager.setSessionEmail(context.session.sessionId, connection.userEmail);
      }
    }

    return response;
  }

  /**
   * Send response to connection
   */
  private async sendResponse(connectionId: string, response: MCPResponse): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const responseData = JSON.stringify(response);
      
      // Log the response being sent back to client
      console.log(`[BankingMCPServer] Sending response to ${connectionId}:`, JSON.stringify(response, null, 2));
      
      connection.ws.send(responseData);
    } catch (error) {
      console.error(`[BankingMCPServer] Error sending response to ${connectionId}:`, error);
      await this.closeConnection(connectionId, 1011, 'Send error');
    }
  }

  /**
   * Send error response to connection
   */
  private async sendError(connectionId: string, messageId: string | number | null, code: number, message: string, data?: any): Promise<void> {
    const errorResponse: MCPResponse = {
      id: messageId ?? 'unknown',
      error: {
        code,
        message,
        data
      }
    };

    await this.sendResponse(connectionId, errorResponse);
  }

  /**
   * Validate MCP message structure
   */
  private isValidMCPMessage(message: any): message is MCPMessage {
    if (typeof message !== 'object' || message === null || typeof message.method !== 'string') {
      return false;
    }
    // JSON-RPC: request id MUST NOT be null; notifications MUST NOT include id (use notifications/* methods)
    if (message.id === null) {
      return false;
    }
    if (message.id === undefined) {
      return typeof message.method === 'string' && message.method.startsWith('notifications/');
    }
    return typeof message.id === 'string' || typeof message.id === 'number';
  }

  /**
   * Create error response
   */
  private createErrorResponse(id: string | number | null | undefined, code: number, message: string, data?: any): MCPResponse {
    return {
      id: id ?? 'unknown',
      error: {
        code,
        message,
        data
      }
    };
  }

  /**
   * Handle HTTP requests (OAuth callbacks)
   */
  private async handleHttpRequest(req: any, res: any): Promise<void> {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Spec-compliant HTTP MCP transport routes (RFC 9728 metadata + POST /mcp)
    if (this.httpTransport &&
        (pathname === '/.well-known/oauth-protected-resource' ||
         pathname === '/mcp')) {
      await this.httpTransport.handleRequest(req, res, pathname);
      return;
    }

    if (pathname === '/.well-known/mcp-server') {
      await this.handleWellKnownMcpServer(req, res);
    } else if (pathname === '/auth/callback') {
      await this.handleOAuthCallback(req, res, url);
    } else if (pathname === '/auth/status') {
      await this.handleAuthStatus(req, res, url);
    } else {
      // Default response for other paths
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }

  /**
   * RFC 9728 / MCP discovery — /.well-known/mcp-server
   */
  private async handleWellKnownMcpServer(_req: any, res: any): Promise<void> {
    const { BankingToolRegistry } = await import('../tools/BankingToolRegistry');
    const tools = BankingToolRegistry.getAllTools().map(t => ({
      name: t.name,
      description: t.description,
      requiresUserAuth: t.requiresUserAuth,
      requiredScopes: t.requiredScopes,
    }));
    const manifest = {
      name: 'Banking MCP Server',
      version: '1.0.0',
      description: 'Secure banking operations MCP server with PingOne authentication',
      protocolVersion: '2024-11-05',
      tools,
      auth: {
        type: 'oauth2',
        authorizationUrl: process.env.PINGONE_AUTH_URL
          ? `${process.env.PINGONE_AUTH_URL}/authorize`
          : undefined,
        tokenUrl: process.env.PINGONE_AUTH_URL
          ? `${process.env.PINGONE_AUTH_URL}/token`
          : undefined,
        scopes: [
          'banking:accounts:read',
          'banking:transactions:read',
          'banking:transactions:write',
          'banking:sensitive:read',
        ],
      },
    };
    const body = JSON.stringify(manifest, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  }

  /**
   * Handle OAuth authorization callback
   */
  private async handleOAuthCallback(req: any, res: any, url: URL): Promise<void> {
    try {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        console.error(`[BankingMCPServer] OAuth error: ${error}`);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body>
              <h2>Authorization Failed</h2>
              <p>Error: ${error}</p>
              <p>You can close this window and try again.</p>
            </body>
          </html>
        `);
        return;
      }

      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body>
              <h2>Invalid Request</h2>
              <p>Missing authorization code or state parameter.</p>
            </body>
          </html>
        `);
        return;
      }

      console.log(`[BankingMCPServer] Received OAuth callback - code: ${code.substring(0, 10)}..., state: ${state}`);

      // Exchange authorization code for user tokens
      const result = await this.messageHandler.handleAuthorizationCodeExchange(code, state);

      if (result.success) {
        console.log(`[BankingMCPServer] OAuth authorization successful for session: ${result.sessionId}`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!doctype html>
<meta charset="utf-8">
<script>
/***
 * Replace ORIGIN with your web app's exact origin, e.g. "https://agent.example"
 * Replace SESSION_ID with the opaque session your UI knows (same value you used in \`state\`)
 */
(function () {
  var msg = { type: "auth_complete", session: "${result.sessionId}" };
  try {
    // Notify the opener (your AI agent web app)
    window.opener && window.opener.postMessage(msg, "*");
  } catch (e) {}
  // Close the popup regardless
  window.close();
})();
</script>
<p>You're signed in. You can close this window.</p>`);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body>
              <h2>Authorization Failed</h2>
              <p>Error: ${result.error}</p>
              <p>You can close this window and try again.</p>
            </body>
          </html>
        `);
      }

    } catch (error) {
      console.error('[BankingMCPServer] Error handling OAuth callback:', error);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body>
            <h2>Server Error</h2>
            <p>An error occurred while processing your authorization.</p>
          </body>
        </html>
      `);
    }
  }

  /**
   * Handle auth status check
   */
  private async handleAuthStatus(req: any, res: any, url: URL): Promise<void> {
    try {
      const sessionId = url.searchParams.get('sessionId');
      
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing sessionId parameter' }));
        return;
      }

      const session = await this.sessionManager.getSession(sessionId);
      const hasUserTokens = session?.userTokens ? true : false;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sessionId,
        hasUserTokens,
        authorized: hasUserTokens
      }));

    } catch (error) {
      console.error('[BankingMCPServer] Error checking auth status:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * Clean up server resources
   */
  private async cleanup(): Promise<void> {
    this.isRunning = false;
    this.connections.clear();
    this.server = null;
    this.httpServer = null;
    this.stats.activeConnections = 0;
  }
}