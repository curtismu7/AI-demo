/**
 * MCP Message Handler
 * Handles MCP protocol messages including handshake, list_tools, and tool_call
 */

import { 
  MCPMessage, 
  MCPResponse, 
  HandshakeMessage, 
  HandshakeResponse,
  ListToolsMessage,
  ListToolsResponse,
  ToolCallMessage,
  ToolCallResponse,
  ServerCapabilities,
  ServerInfo,
  ToolDefinition,
  ToolResult
} from '../interfaces/mcp';
import { BankingAuthenticationManager } from '../auth/BankingAuthenticationManager';
import { BankingSessionManager, BankingSession } from '../storage/BankingSessionManager';
import { BankingToolProvider } from '../tools/BankingToolProvider';
import { AuthenticationError, AuthErrorCodes } from '../interfaces/auth';
import { AuthenticationIntegration } from './AuthenticationIntegration';

export interface MessageHandlerContext {
  connectionId: string;
  agentToken?: string;
  session?: BankingSession;
  /** Authenticated user email, injected from the frontend at connection time. Used for CIBA. */
  userEmail?: string;
  /** Send a non-response notification to the connected client (e.g. CIBA progress). */
  sendNotification?: (notification: object) => void;
}

export class MCPMessageHandler {
  private readonly serverInfo: ServerInfo = {
    name: 'Banking MCP Server',
    version: '1.0.0',
    description: 'Secure banking operations MCP server with PingOne authentication'
  };

  /** SHOULD (spec §lifecycle): default timeout for tool execution calls in ms. */
  private readonly toolCallTimeoutMs: number;
  /** Advertise only features we implement (tools + logging). Prompts/resources omitted per MCP spec honesty. */
  private readonly serverCapabilities: ServerCapabilities = {
    tools: {
      listChanged: false
    },
    logging: {}
  };

  /** Current minimum log level requested by the client via logging/setLevel (RFC 5424 names). */
  private clientLogLevel: string = 'info';

  private authIntegration: AuthenticationIntegration;

  constructor(
    private authManager: BankingAuthenticationManager,
    private sessionManager: BankingSessionManager,
    private toolProvider: BankingToolProvider
  ) {
    this.authIntegration = new AuthenticationIntegration(authManager, sessionManager);
    const raw = process.env.TOOL_CALL_TIMEOUT_MS;
    this.toolCallTimeoutMs = raw && Number.isFinite(+raw) && +raw > 0 ? +raw : 30_000;
  }

  /**
   * Route MCP message to appropriate handler. Returns null for notifications (no JSON-RPC response body).
   */
  async handleMessage(message: MCPMessage, context: MessageHandlerContext): Promise<MCPResponse | null> {
    try {
      switch (message.method) {
        case 'initialize':
          return await this.handleHandshake(message as HandshakeMessage, context);

        case 'notifications/initialized':
          console.log('[MCPMessageHandler] Client sent notifications/initialized');
          return null;

        case 'ping':
          return this.handlePing(message);

        case 'tools/list':
          return await this.handleListTools(message as ListToolsMessage, context);

        case 'tools/call':
          return await this.handleToolCall(message as ToolCallMessage, context);

        case 'logging/setLevel':
          return this.handleSetLogLevel(message);

        default:
          if (message.id === undefined || message.id === null) {
            console.warn(`[MCPMessageHandler] Ignoring notification or invalid message without id: ${message.method}`);
            return null;
          }
          return this.createErrorResponse(message.id, -32601, 'Method not found', { method: message.method });
      }
    } catch (error) {
      console.error(`[MCPMessageHandler] Error handling message ${message.method}:`, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (message.id === undefined || message.id === null) {
        return null;
      }
      return this.createErrorResponse(message.id, -32603, `Internal error: ${errorMessage}`);
    }
  }

  /**
   * JSON-RPC ping request — empty result per MCP utilities.
   */
  private handlePing(message: MCPMessage): MCPResponse {
    return {
      id: message.id ?? 'unknown',
      result: {}
    };
  }

  /**
   * logging/setLevel request — client requests a minimum log level for server→client
   * notifications/message events. Stores the level and acknowledges with {}.
   * Valid levels (RFC 5424): debug, info, notice, warning, error, critical, alert, emergency.
   */
  private handleSetLogLevel(message: MCPMessage): MCPResponse {
    const VALID_LEVELS = new Set(['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency']);
    const level = (message as any).params?.level;
    if (!level || !VALID_LEVELS.has(level)) {
      return this.createErrorResponse(
        message.id,
        -32602,
        `Invalid params: level must be one of ${[...VALID_LEVELS].join(', ')}`
      );
    }
    this.clientLogLevel = level;
    console.log(`[MCPMessageHandler] Client requested log level: ${level}`);
    return {
      id: message.id ?? 'unknown',
      result: {}
    };
  }

  /**
   * Handle MCP handshake/initialize message
   */
  async handleHandshake(message: HandshakeMessage, context: MessageHandlerContext): Promise<HandshakeResponse> {
    try {
      const clientVersion = message.params?.protocolVersion;
      if (!clientVersion) {
        return this.createErrorResponse(message.id, -32602, 'Invalid params: missing protocolVersion') as HandshakeResponse;
      }

      if (!message.params.capabilities || typeof message.params.capabilities !== 'object') {
        (message.params as Record<string, unknown>).capabilities = {};
      }

      const negotiatedVersion = this.negotiateProtocolVersion(clientVersion);
      if (!negotiatedVersion) {
        return this.createErrorResponse(message.id, -32602, 'Unsupported protocol version', {
          supportedVersions: ['2025-11-25', '2024-11-05']
        }) as HandshakeResponse;
      }

      // Extract agent token from params if provided (multiple possible locations)
      const agentToken = message.params?.agentToken as string || 
                        (message.params as any)?.agent_token as string ||
                        (message.params as any)?.clientInfo?.agentToken as string;
                        
      console.log(`[MCPMessageHandler] Handshake - looking for agent token in params:`, !!agentToken);
      
      if (agentToken) {
        context.agentToken = agentToken;
        
        // Validate agent token and create session
        try {
          await this.authManager.validateAgentToken(agentToken);
          const session = await this.sessionManager.createSession(agentToken);
          context.session = session;
          
          console.log(`[MCPMessageHandler] Created session ${session.sessionId} for agent token`);
        } catch (error) {
          console.warn(`[MCPMessageHandler] Agent token validation failed:`, error);
          // Continue with handshake but without session - tools will require authentication
        }
      } else {
        console.log(`[MCPMessageHandler] No agent token found in handshake params`);
      }

      return {
        id: message.id ?? 'unknown',
        result: {
          protocolVersion: negotiatedVersion,
          capabilities: this.serverCapabilities,
          serverInfo: this.serverInfo
        }
      };
    } catch (error) {
      console.error('[MCPMessageHandler] Error in handshake:', error);
      return this.createErrorResponse(message.id, -32603, 'Handshake failed') as HandshakeResponse;
    }
  }

  /**
   * Handle tools/list message
   */
  async handleListTools(message: ListToolsMessage, _context: MessageHandlerContext): Promise<ListToolsResponse> {
    try {
      // Get available banking tools
      const bankingTools = this.toolProvider.getAvailableTools();
      
      // Convert to MCP tool definitions
      const mcpTools: ToolDefinition[] = bankingTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        requiresUserAuth: tool.requiresUserAuth,
        requiredScopes: tool.requiredScopes
      }));

      return {
        id: message.id ?? 'unknown',
        result: {
          tools: mcpTools,
          nextCursor: message.params?.cursor ? undefined : undefined // No pagination for now
        }
      };
    } catch (error) {
      console.error('[MCPMessageHandler] Error listing tools:', error);
      return this.createErrorResponse(message.id, -32603, 'Failed to list tools') as ListToolsResponse;
    }
  }

  /**
   * Handle tools/call message
   */
  async handleToolCall(message: ToolCallMessage, context: MessageHandlerContext): Promise<ToolCallResponse> {
    console.log(`[MCPMessageHandler] *** TOOL CALL RECEIVED *** Tool: ${message.params.name}, Args:`, message.params.arguments);
    try {
      const toolName = message.params.name;
      const toolArguments = message.params.arguments || {};
      
      console.log(`[MCPMessageHandler] Processing tool call for: "${toolName}"`);
      console.log(`[MCPMessageHandler] Available tools:`, this.toolProvider.getAvailableTools().map(t => t.name));

      // Check if agent token is provided in the tool call params (fallback)
      const agentTokenFromCall = toolArguments.agent_token as string || 
                                toolArguments.agentToken as string ||
                                (message.params as any)?.agentToken as string;
                                
      console.log(`[MCPMessageHandler] Looking for agent token in tool call - found:`, !!agentTokenFromCall);
      console.log(`[MCPMessageHandler] Tool call params:`, message.params);
      
      if (agentTokenFromCall && !context.agentToken) {
        console.log(`[MCPMessageHandler] Agent token found in tool call parameters`);
        context.agentToken = agentTokenFromCall;
        
        // Try to get or create session for this agent token
        try {
          let session = await this.sessionManager.getSessionByAgentToken(agentTokenFromCall);
          if (!session) {
            await this.authManager.validateAgentToken(agentTokenFromCall);
            session = await this.sessionManager.createSession(agentTokenFromCall);
            console.log(`[MCPMessageHandler] Created session ${session.sessionId} for agent token from tool call`);
          }
          context.session = session;
        } catch (error) {
          console.warn(`[MCPMessageHandler] Failed to create session from tool call agent token:`, error);
        }
      }

      // Special handling for authorization code
      if (toolName === 'handle_authorization' || toolArguments.authorization_code) {
        return await this.handleAuthorizationCode(message, context);
      }

      // Auth failure is a protocol error (-32001), not a tool execution error — reject before
      // checking tool validity so the client can obtain a token then retry.
      if (!context.agentToken && !context.session) {
        return this.authIntegration.createAuthenticationErrorResponse(
          String(message.id ?? 'unknown'),
          'Authentication required'
        ) as ToolCallResponse;
      }

      // Get tool definition to check required scopes.
      // Unknown tool name is a tool execution error (isError: true), not a protocol error,
      // so the LLM can self-correct and retry with a valid name. (MCP spec input validation MUST)
      const availableTools = this.toolProvider.getAvailableTools() || [];
      const tool = availableTools.find(t => t.name === toolName);
      if (!tool) {
        console.warn(`[MCPMessageHandler] Unknown tool requested: "${toolName}"`);
        return {
          id: message.id ?? 'unknown',
          result: {
            content: [{
              type: 'text',
              text: `Unknown tool: "${toolName}". Available tools: ${availableTools.map(t => t.name).join(', ')}`,
              success: false,
              error: `Unknown tool: "${toolName}"`
            }],
            isError: true
          }
        };
      }
      const requiredScopes = tool.requiredScopes;

      // Validate authentication using integration service
      console.log(`[MCPMessageHandler] Validating authentication for scopes:`, requiredScopes);
      console.log(`[MCPMessageHandler] Session exists:`, !!context.session);
      console.log(`[MCPMessageHandler] Agent token exists:`, !!context.agentToken);
      
      const authResult = await this.authIntegration.validateToolAuthentication(
        context.session,
        context.agentToken,
        requiredScopes
      );

      console.log(`[MCPMessageHandler] Auth result:`, {
        success: authResult.success,
        error: authResult.error,
        hasAuthChallenge: !!authResult.authChallenge
      });

      if (!authResult.success) {
        if (authResult.authChallenge) {
          // --- CIBA: out-of-band approval (email or push per PingOne) when user email is available ---
          const userEmail = context.userEmail
            || (context.session ? this.sessionManager.getSessionEmail(context.session.sessionId) : undefined);
          const cibaEnabled = process.env.CIBA_ENABLED === 'true';

          if (cibaEnabled && userEmail && context.session) {
            try {
              const requiredScope = requiredScopes.join(' ') || authResult.authChallenge.scope;
              console.log(`[MCPMessageHandler] CIBA flow: initiating for ${userEmail.replace(/(.{2}).*@/, '$1***@')}`);

              const cibaChallenge = await this.authIntegration.initiateCIBAAuth(
                userEmail,
                requiredScope,
                context.session.sessionId
              );

              // Inform the user via a non-blocking notification on the WebSocket
              if (context.sendNotification) {
                context.sendNotification({
                  type: 'ciba_pending',
                  auth_req_id: cibaChallenge.auth_req_id,
                  message: cibaChallenge.message,
                  expires_in: cibaChallenge.expires_in,
                });
              }

              // Block this coroutine (not the event loop) until the user approves
              const userTokens = await this.authIntegration.waitForCIBAApproval(
                context.session.sessionId,
                cibaChallenge.auth_req_id
              );

              // Store the newly issued tokens in the session
              await this.sessionManager.associateUserTokens(context.session.sessionId, userTokens);

              // Re-fetch the updated session so the tool runs with valid tokens
              const refreshedSession = await this.sessionManager.getSession(context.session.sessionId);
              if (refreshedSession) context.session = refreshedSession;

              console.log(`[MCPMessageHandler] CIBA approved — re-executing tool '${toolName}' with new tokens`);
              // Fall through — tool execution continues below

            } catch (cibaErr) {
              const cibaErrMsg = cibaErr instanceof Error ? cibaErr.message : String(cibaErr);
              console.warn(`[MCPMessageHandler] CIBA failed for tool '${toolName}': ${cibaErrMsg}`);
              // Fall back to redirect challenge
              console.log(`[MCPMessageHandler] Falling back to redirect challenge`);
              const challengeResponse = this.authIntegration.createAuthorizationChallengeResponse(String(message.id ?? 'unknown'), authResult.authChallenge);
              return challengeResponse;
            }

          } else {
            // No email or CIBA disabled — return the standard redirect challenge
            console.log(`[MCPMessageHandler] Returning authorization challenge (CIBA not available)`);
            const challengeResponse = this.authIntegration.createAuthorizationChallengeResponse(String(message.id ?? 'unknown'), authResult.authChallenge);
            console.log(`[MCPMessageHandler] Authorization challenge response:`, JSON.stringify(challengeResponse, null, 2));
            return challengeResponse;
          }
        } else {
          console.log(`[MCPMessageHandler] Returning authentication error:`, authResult.error);
          const errorResponse = this.authIntegration.createAuthenticationErrorResponse(String(message.id ?? 'unknown'), authResult.error || 'Authentication failed') as ToolCallResponse;
          console.log(`[MCPMessageHandler] Authentication error response:`, JSON.stringify(errorResponse, null, 2));
          return errorResponse;
        }
      }

      // Update context with validated session
      context.session = authResult.session;

      // Update session activity
      if (context.session) {
        await this.sessionManager.updateSessionActivity(context.session.sessionId, 'tool_call');
      }

      // Execute the tool with a per-request timeout (SHOULD per MCP spec §lifecycle/timeouts)
      const timeoutMs = this.toolCallTimeoutMs;
      const toolResult = await Promise.race([
        this.toolProvider.executeTool(toolName, toolArguments, context.session!, context.agentToken),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`)), timeoutMs)
        )
      ]);

      // Convert tool result to MCP format
      const mcpContent: ToolResult[] = [{
        type: 'text',
        text: toolResult.text,
        success: toolResult.success,
        error: toolResult.error,
        authChallenge: toolResult.authChallenge
      }];

      return {
        id: message.id ?? 'unknown',
        result: {
          content: mcpContent,
          isError: !toolResult.success
        }
      };

    } catch (error) {
      console.error(`[MCPMessageHandler] Error executing tool call:`, error);
      
      if (error instanceof AuthenticationError) {
        return this.authIntegration.createAuthenticationErrorResponse(String(message.id ?? 'unknown'), error.message) as ToolCallResponse;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Timeout is a tool execution error (isError: true), not a protocol error.
      // Returning isError: true lets the LLM self-correct and retry. (MCP spec §lifecycle/timeouts SHOULD)
      if (errorMessage.includes('timed out after')) {
        return {
          id: message.id ?? 'unknown',
          result: {
            content: [{ type: 'text', text: errorMessage, success: false, error: errorMessage }],
            isError: true,
          }
        } as ToolCallResponse;
      }

      return this.createErrorResponse(message.id, -32603, `Tool execution failed: ${errorMessage}`) as ToolCallResponse;
    }
  }

  /**
   * Handle authorization code from user (special tool call)
   */
  async handleAuthorizationCode(
    message: ToolCallMessage, 
    context: MessageHandlerContext
  ): Promise<ToolCallResponse> {
    try {
      // Ensure we have a session
      if (!context.session) {
        if (context.agentToken) {
          const authResult = await this.authIntegration.validateAgentAuthentication(context.agentToken);
          if (!authResult.success) {
            return this.authIntegration.createAuthenticationErrorResponse(String(message.id ?? 'unknown'), authResult.error || 'Agent authentication failed') as ToolCallResponse;
          }
          context.session = authResult.session;
        } else {
          return this.authIntegration.createAuthenticationErrorResponse(String(message.id ?? 'unknown'), 'Session required for authorization') as ToolCallResponse;
        }
      }

      const authCode = message.params.arguments?.authorization_code as string;
      const state = message.params.arguments?.state as string;

      if (!authCode || !state) {
        return this.createErrorResponse(message.id, -32602, 'Missing authorization_code or state parameter') as ToolCallResponse;
      }

      // Handle authorization code exchange through integration service
      const authResult = await this.authIntegration.handleAuthorizationCodeExchange(
        context.session!.sessionId,
        authCode,
        state
      );

      if (authResult.success) {
        // Update context with new session data
        context.session = authResult.session;

        const mcpContent: ToolResult[] = [{
          type: 'text',
          text: 'Authorization successful! You can now use banking tools.',
          success: true
        }];

        return {
          id: message.id ?? 'unknown',
          result: {
            content: mcpContent,
            isError: false
          }
        };
      } else {
        const mcpContent: ToolResult[] = [{
          type: 'text',
          text: `Authorization failed: ${authResult.error}`,
          success: false,
          error: authResult.error
        }];

        return {
          id: message.id ?? 'unknown',
          result: {
            content: mcpContent,
            isError: true
          }
        };
      }

    } catch (error) {
      console.error('[MCPMessageHandler] Error handling authorization code:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(message.id, -32603, `Authorization failed: ${errorMessage}`) as ToolCallResponse;
    }
  }

  /**
   * Associate session with connection context
   */
  async associateSession(context: MessageHandlerContext, agentToken: string): Promise<void> {
    try {
      await this.authManager.validateAgentToken(agentToken);

      // Get or create session
      let session = await this.sessionManager.getSessionByAgentToken(agentToken);
      if (!session) {
        session = await this.sessionManager.createSession(agentToken);
      }

      context.session = session;
      context.agentToken = agentToken;

      console.log(`[MCPMessageHandler] Associated session ${session.sessionId} with connection ${context.connectionId}`);
    } catch (error) {
      console.error(`[MCPMessageHandler] Failed to associate session:`, error);
      throw new AuthenticationError('Session association failed', AuthErrorCodes.INVALID_AGENT_TOKEN);
    }
  }

  /**
   * Validate session and check authorization
   */
  async validateSessionAuth(context: MessageHandlerContext, requiredScopes: string[] = []): Promise<{
    isValid: boolean;
    requiresUserAuth: boolean;
    error?: string;
  }> {
    if (!context.session) {
      return {
        isValid: false,
        requiresUserAuth: false,
        error: 'No session found'
      };
    }

    // Validate session
    const validation = await this.sessionManager.validateSession(context.session.sessionId);
    
    if (!validation.isValid) {
      return {
        isValid: false,
        requiresUserAuth: false,
        error: validation.error
      };
    }

    // Check if user authorization is required for the requested scopes
    if (requiredScopes.length > 0 && validation.requiresUserAuth) {
      return {
        isValid: true,
        requiresUserAuth: true,
        error: 'User authorization required'
      };
    }

    return {
      isValid: true,
      requiresUserAuth: false
    };
  }

  /**
   * Create standard error response
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
   * Get server information
   */
  getServerInfo(): ServerInfo {
    return { ...this.serverInfo };
  }

  /**
   * Handle authorization code exchange (called from HTTP callback)
   */
  async handleAuthorizationCodeExchange(authorizationCode: string, state: string): Promise<{
    success: boolean;
    error?: string;
    sessionId?: string;
  }> {
    try {
      console.log(`[MCPMessageHandler] Handling authorization code exchange for state: ${state}`);
      
      // First validate the state to get the session ID
      const authRequest = this.authManager.validateAuthorizationState(state);
      if (!authRequest) {
        return {
          success: false,
          error: 'Invalid or expired authorization state'
        };
      }

      console.log(`[MCPMessageHandler] Found authorization request for session: ${authRequest.sessionId}`);
      
      const result = await this.authIntegration.handleAuthorizationCodeExchange(
        authRequest.sessionId,
        authorizationCode,
        state
      );

      if (result.success && result.session) {
        return {
          success: true,
          sessionId: result.session.sessionId
        };
      } else {
        return {
          success: false,
          error: result.error || 'Authorization code exchange failed'
        };
      }

    } catch (error) {
      console.error('[MCPMessageHandler] Error in authorization code exchange:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get server capabilities
   */
  getServerCapabilities(): ServerCapabilities {
    return { ...this.serverCapabilities };
  }

  /**
   * Pick negotiated MCP protocol version (same as client when supported, else downgrade to 2024-11-05).
   */
  private negotiateProtocolVersion(clientVersion: string): string | null {
    const v = clientVersion.trim();
    if (v === '2025-11-25' || v.startsWith('2025-11-25')) {
      return '2025-11-25';
    }
    if (v.startsWith('2024-')) {
      return '2024-11-05';
    }
    return null;
  }
}