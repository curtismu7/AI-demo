/**
 * Banking Tool Provider
 * Implements banking-specific tools that call the banking API server with proper authorization
 */

import { BankingAPIClient } from '../banking/BankingAPIClient';
import type { HttpTraceEntry } from '../banking/BankingAPIClient';
import { BankingAuthenticationManager } from '../auth/BankingAuthenticationManager';
import { BankingSessionManager } from '../storage/BankingSessionManager';
import { BankingToolRegistry, BankingToolDefinition } from './BankingToolRegistry';
import { BankingToolValidator } from './BankingToolValidator';
import { AuthorizationChallengeHandler, AuthorizationChallenge } from './AuthorizationChallengeHandler';
import { ToolResult, AuthorizationRequest } from '../interfaces/mcp';
import { Session, AuthErrorCodes, AuthenticationError } from '../interfaces/auth';
import { BankingAPIError } from '../interfaces/banking';
import { TokenExchangeService } from '../auth/TokenExchangeService';
import { TokenExchangeRequest } from '../interfaces/tokenExchange';
import { AuditLogger, UserTokenInfo, ExchangedTokenInfo, TokenChainExecutionResult } from '../utils/AuditLogger';
import { Logger, createDefaultLoggerConfig } from '../utils/Logger';
import { tokenCache } from '../services/tokenCacheService';
import { getScopesForTool, filterToolsByScope } from './toolScopeMap';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Module-level JWKS key set — cached for process lifetime (jose handles key rotation)
let _jwksKeySet: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwksKeySet(): ReturnType<typeof createRemoteJWKSet> | null {
  if (_jwksKeySet) return _jwksKeySet;
  const jwksUri =
    process.env.PINGONE_JWKS_URI ||
    (process.env.PINGONE_ISSUER ? `${process.env.PINGONE_ISSUER}/jwks` : null) ||
    (process.env.PINGONE_BASE_URL ? `${process.env.PINGONE_BASE_URL}/jwks` : null);
  if (!jwksUri) return null;
  try {
    _jwksKeySet = createRemoteJWKSet(new URL(jwksUri));
    return _jwksKeySet;
  } catch {
    return null;
  }
}

export interface ToolExecutionContext {
  session: Session;
  toolName: string;
  params: Record<string, any>;
}

export interface BankingToolResult extends ToolResult {
  type: 'text';
  text: string;
  success?: boolean;
  error?: string;
  authChallenge?: AuthorizationRequest;
  originalRequest?: Record<string, any>;  // DEPRECATED — no longer populated; use httpTrace for debugging
  httpTrace?: HttpTraceEntry[];           // Actual HTTP calls made to the banking API
}

/** Maximum number of distinct sessions tracked in chainIndexBySession before FIFO eviction. */
const MAX_SESSION_CHAIN_ENTRIES = 1_000;

/** HITL consent-gate threshold in USD. Configurable via HITL_THRESHOLD_USD env var. */
const HITL_THRESHOLD_USD = Number(process.env.HITL_THRESHOLD_USD ?? 500);

export class BankingToolProvider {
  private authChallengeHandler: AuthorizationChallengeHandler;
  private auditLogger: AuditLogger;
  private logger: Logger;
  private chainIndexBySession: Map<string, number> = new Map();  // Track call count per session

  constructor(
    private apiClient: BankingAPIClient,
    private authManager: BankingAuthenticationManager,
    private sessionManager: BankingSessionManager,
    private tokenExchangeService?: TokenExchangeService
  ) {
    this.logger = Logger.getInstance(createDefaultLoggerConfig());
    this.authChallengeHandler = new AuthorizationChallengeHandler(authManager, sessionManager);
    this.auditLogger = AuditLogger.getInstance(this.logger);
  }

  /**
   * Increment and return chain index for session (per-session call count).
   * Evicts the oldest session entry when the map reaches MAX_SESSION_CHAIN_ENTRIES
   * to prevent unbounded growth in long-running processes.
   */
  private incrementChainIndex(sessionId: string): number {
    const current = this.chainIndexBySession.get(sessionId) || 0;
    const next = current + 1;

    if (!this.chainIndexBySession.has(sessionId) && this.chainIndexBySession.size >= MAX_SESSION_CHAIN_ENTRIES) {
      const oldestKey = this.chainIndexBySession.keys().next().value as string | undefined;
      if (oldestKey !== undefined) this.chainIndexBySession.delete(oldestKey);
    }

    this.chainIndexBySession.set(sessionId, next);
    return next;
  }

  /**
   * Remove the chain-index entry for a session when it ends.
   * Callers (e.g. BankingSessionManager) should invoke this on session teardown.
   */
  clearSessionChainIndex(sessionId: string): void {
    this.chainIndexBySession.delete(sessionId);
  }

  /**
   * Execute a banking tool
   */
  async executeTool(
    toolName: string,
    params: Record<string, any>,
    session: Session,
    agentToken?: string
  ): Promise<BankingToolResult> {
    const startTime = Date.now();
    const sessionId = session.sessionId;

    this.logger.info(`[BankingToolProvider] Starting tool execution: ${toolName} (session: ${sessionId})`);
    this.logger.debug(`[BankingToolProvider] Tool parameters:`, { params: JSON.stringify(params, null, 2) });

    try {
      // Validate tool exists
      const tool = BankingToolRegistry.getTool(toolName);
      if (!tool) {
        this.logger.warn(`[BankingToolProvider] Unknown tool requested: ${toolName}`);
        return this.createErrorResult(`Unknown tool: ${toolName}`, params);
      }

      this.logger.info(`[BankingToolProvider] Tool found: ${tool.name}, required scopes: [${tool.requiredScopes.join(', ')}]`);

      // Validate parameters
      const paramValidation = BankingToolValidator.validateToolParams(toolName, params);
      if (!paramValidation.isValid) {
        this.logger.warn(`[BankingToolProvider] Parameter validation failed for ${toolName}:`, paramValidation.errors);
        return this.createErrorResult(`Invalid parameters: ${paramValidation.errors.join(', ')}`, params);
      }

      this.logger.debug(`[BankingToolProvider] Parameters validated successfully for ${toolName}`);

      // Check user authorization using the challenge handler (only for tools that require user auth).
      // When agentToken is provided, the agent is already authorized via the BFF token exchange
      // pipeline -- skip session-based challenge detection.
      if (tool.requiresUserAuth && tool.requiredScopes.length > 0 && !agentToken) {
        this.logger.debug(`[BankingToolProvider] Checking authorization for scopes: [${tool.requiredScopes.join(', ')}]`);
        const challengeResult = await this.authChallengeHandler.detectAuthorizationChallenge(
          session,
          tool.requiredScopes
        );

        if (challengeResult.challengeNeeded) {
          this.logger.info(`[BankingToolProvider] Authorization challenge required for ${toolName}`);
          return this.createAuthChallengeResult(challengeResult.challenge!);
        }

        this.logger.debug(`[BankingToolProvider] Authorization check passed for ${toolName}`);

        // Re-fetch the session in case tokens were refreshed during the challenge check
        const refreshedSession = await this.sessionManager.getSession(session.sessionId);
        if (refreshedSession) {
          session = refreshedSession;
        }
      } else {
        this.logger.debug(`[BankingToolProvider] Tool ${toolName} does not require user authorization, skipping auth check`);
      }

      // Execute the specific tool
      const sanitizedParams = paramValidation.sanitizedParams!;
      const context: ToolExecutionContext = {
        session,
        toolName,
        params: sanitizedParams
      };

      this.logger.debug(`[BankingToolProvider] Executing tool handler: ${tool.handler}`);
      this.apiClient.startTrace();
      const result = await this.executeSpecificTool(tool, context, agentToken);
      result.httpTrace = this.apiClient.stopTrace();

      const executionTime = Date.now() - startTime;
      this.logger.info(`[BankingToolProvider] Tool execution completed: ${toolName} (${executionTime}ms) - Success: ${result.success}`);

      // Log token chain audit event (D-03, D-04)
      try {
        const chainIndex = this.incrementChainIndex(session.sessionId);
        
        // Extract user token info from session
        let userToken = session.userTokens;
        if (Array.isArray(userToken)) {
          userToken = userToken[0];
        }

        // Decode real sub from the token payload; fall back to 'unknown' for opaque tokens.
        const userTokenClaims = userToken ? this.decodeJwtPayload(userToken.accessToken) : null;
        const userSub = typeof userTokenClaims?.sub === 'string' ? userTokenClaims.sub : 'unknown';

        const userTokenInfo: UserTokenInfo = userToken
          ? {
              sub: userSub,
              scope: userToken.scope?.split(' ') || [],
              issuedAt: new Date(userToken.issuedAt).toISOString(),
              expiresAt: new Date(new Date(userToken.issuedAt).getTime() + (userToken.expiresIn || 3600) * 1000).toISOString(),
              tokenId: userSub
            }
          : {
              sub: 'unknown',
              scope: [],
              issuedAt: new Date().toISOString(),
              expiresAt: undefined,
              tokenId: 'unknown'
            };

        // Extract exchanged token info if agent token was used (RFC 8693 delegation)
        const exchangedTokenInfo: ExchangedTokenInfo | null = agentToken
          ? {
              sub: 'mcp-agent',  // MCP server as delegated subject
              act: {
                iss: 'pingone',
                sub: userSub  // Original actor resolved from session token
              },
              scope: tool.requiredScopes || [],
              issuedAt: new Date().toISOString(),
              expiresAt: undefined,
              tokenId: 'exchange'
            }
          : null;

        // Construct tool result summary (non-sensitive, stable regardless of tool output shape)
        const toolResultSummary = result.success ? `${toolName} completed` : `${toolName} failed`;

        // Log to AuditLogger
        await this.auditLogger.logTokenChain(
          toolName,
          chainIndex,
          userTokenInfo,
          exchangedTokenInfo,
          {
            sessionId: session.sessionId,
            userId: undefined,  // Would need to be extracted from token claims
            ipAddress: undefined,  // Could be extracted from request context if available
            userAgent: undefined
          },
          'completed',  // toolExecutionStatus
          {
            success: result.success || false,
            errorCode: result.error ? 'TOOL_ERROR' : undefined,
            duration: executionTime,
            toolResultSummary,
            toolResultJson: result.success ? {
              text: result.text,
              isError: !!result.error
            } : undefined
          }
        );
      } catch (auditError) {
        // Don't let audit failure block tool result
        this.logger.warn(`[BankingToolProvider] Failed to log token chain: ${auditError instanceof Error ? auditError.message : String(auditError)}`);
      }

      return result;

    } catch (error) {
      // Collect any HTTP trace entries captured before the exception
      const errorTrace = this.apiClient.stopTrace();
      const executionTime = Date.now() - startTime;
      this.logger.error(`[BankingToolProvider] Error executing tool ${toolName} (${executionTime}ms):`, {}, error instanceof Error ? error : undefined);

      const attachTrace = (r: BankingToolResult): BankingToolResult => {
        if (errorTrace.length > 0) r.httpTrace = errorTrace;
        return r;
      };

      if (error instanceof AuthenticationError) {
        this.logger.warn(`[BankingToolProvider] Authentication error for ${toolName}: ${error.message}`);
        if (error.code === AuthErrorCodes.USER_AUTHORIZATION_REQUIRED && error.authorizationUrl) {
          // Generate a proper authorization challenge
          const challenge = await this.authChallengeHandler.generateAuthorizationChallenge(
            session.sessionId,
            error.requiredScopes || []
          );
          return this.createAuthChallengeResult(challenge);
        }
        return attachTrace(this.createErrorResult(`Authentication error: ${error.message}`, params));
      }

      if (error instanceof BankingAPIError) {
        this.logger.warn(`[BankingToolProvider] Banking API error for ${toolName}: ${error.message}`);
        return attachTrace(this.createErrorResult(`Banking API error: ${error.message}`, params));
      }

      this.logger.error(`[BankingToolProvider] Unexpected error for ${toolName}:`, {}, error instanceof Error ? error : undefined);
      return attachTrace(this.createErrorResult(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`, params));
    }
  }

  /**
   * Get all available tools for MCP protocol (unfiltered).
   */
  getAvailableTools(): BankingToolDefinition[] {
    return BankingToolRegistry.getAllTools();
  }

  /**
   * Get tools permitted for the given token scopes (tools/list filtering).
   * Uses flat scope matching: banking:read / banking:write.
   * No authz server call — pure token introspection.
   */
  getAvailableToolsForToken(tokenScopes: string[]): BankingToolDefinition[] {
    return filterToolsByScope(BankingToolRegistry.getAllTools(), tokenScopes);
  }

  /**
   * Handle authorization code from user
   */
  async handleAuthorizationCode(
    sessionId: string,
    authorizationCode: string,
    state: string
  ): Promise<BankingToolResult> {
    try {
      const result = await this.authChallengeHandler.handleAuthorizationCode({
        sessionId,
        authorizationCode,
        state
      });

      if (result.success) {
        let expiresIn = 0;
        if (result.userTokens) {
          expiresIn = result.userTokens.expiresIn;
        }

        return this.createSuccessResult(
          `Authorization successful! You can now use banking tools.\n` +
          `Token expires in ${Math.floor(expiresIn / 60)} minutes.`
        );
      } else {
        return this.createErrorResult(`Authorization failed: ${result.error}`);
      }
    } catch (error) {
      this.logger.error('Error handling authorization code:', {}, error instanceof Error ? error : undefined);
      return this.createErrorResult(
        `Authorization processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if a session needs re-authorization for specific scopes
   */
  async checkReauthorizationNeeded(
    session: Session,
    requiredScopes: string[]
  ): Promise<boolean> {
    return await this.authChallengeHandler.checkReauthorizationNeeded(session, requiredScopes);
  }

  /**
   * Execute specific tool based on handler
   */
  private async executeSpecificTool(
    tool: BankingToolDefinition,
    context: ToolExecutionContext,
    agentToken?: string
  ): Promise<BankingToolResult> {
    // Tools that do not require user auth — dispatch directly without token resolution
    if (!tool.requiresUserAuth) {
      switch (tool.handler) {
        case 'executeSequentialThink':
          return await this.executeSequentialThink(
            context.params as { query: string; context?: string }
          );

        case 'executeQueryUserByEmail':
          // Identity lookup performed by the agent on behalf of the platform.
          // Uses the BFF-issued agent delegated token rather than a user's own token.
          // agentToken is always present in the normal BFF → MCP Gateway → MCP Server flow.
          if (!agentToken) {
            return this.createErrorResult(
              'query_user_by_email requires an agent-delegated token; no agentToken was provided in this request.'
            );
          }
          return await this.executeQueryUserByEmail(agentToken, context.params as { email: string });

        default:
          return this.createErrorResult(`Unknown non-auth tool handler: ${tool.handler}`, context.params);
      }
    }

    // Token selection: prefer the BFF-issued delegated token (RFC 8693 agentToken) when
    // available — it carries the act claim proving the delegation chain and has the correct
    // audience for the BFF's data APIs. Fall back to the raw session user token only when
    // no delegated token was provided (e.g. ff_skip_token_exchange=true or direct MCP call).
    let token: string;
    if (agentToken) {
      // Step 9: Second RFC 8693 exchange — exchange gateway-scoped token for resource-scoped token.
      // Gated on BANKING_API_RESOURCE_URI: when absent, fall back to using gateway token directly
      // for backward compatibility (e.g. local dev without full resource server config).
      if (this.tokenExchangeService && process.env.BANKING_API_RESOURCE_URI) {
        const toolScopes = getScopesForTool(context.toolName);
        const agentCacheKey = `agent:${context.session.sessionId}:${[...toolScopes].sort().join(',')}`;
        const cachedResourceToken = tokenCache.get(agentCacheKey, toolScopes);
        if (cachedResourceToken) {
          token = cachedResourceToken;
          this.logger.debug(`[BankingToolProvider] Step 9 resource cache hit for ${tool.name}`);
        } else {
          this.logger.info(`[BankingToolProvider] Step 9 resource exchange initiated for tool: ${tool.name}, scopes: ${toolScopes.join(',')}`);
          try {
            const exchangeRequest: TokenExchangeRequest = {
              grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
              subject_token: agentToken,
              subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
              scope: toolScopes.join(' '),
              audience: process.env.BANKING_API_RESOURCE_URI,
            };
            const exchangeResponse = await this.tokenExchangeService.exchangeToken(exchangeRequest);
            token = exchangeResponse.access_token;
            const expiresAt = Date.now() + (exchangeResponse.expires_in * 1000);
            tokenCache.set(agentCacheKey, toolScopes, token, expiresAt);
            this.logger.info(`[BankingToolProvider] Step 9 resource exchange succeeded for ${tool.name} (expires_in: ${exchangeResponse.expires_in}s)`);
          } catch (exchangeError) {
            this.logger.error(`[BankingToolProvider] Step 9 resource exchange FAILED for ${tool.name}:`, {}, exchangeError instanceof Error ? exchangeError : undefined);
            throw new Error(
              `Step 9 token exchange failed for tool '${tool.name}': ${exchangeError instanceof Error ? exchangeError.message : 'Unknown error'}`
            );
          }
        }
      } else {
        // Backward compat: no resource URI configured — use gateway token directly
        token = agentToken;
        this.logger.debug(`[BankingToolProvider] Using BFF-exchanged delegated token for ${tool.name} (no Step 9 resource exchange)`);
      }
    } else {
      // Resolve user token from session
      const userToken = this.getUserTokenForScopes(context.session, tool.requiredScopes);
      if (!userToken) {
        throw new AuthenticationError(
          'No valid user tokens found for required scopes',
          AuthErrorCodes.USER_AUTHORIZATION_REQUIRED,
          undefined,
          tool.requiredScopes
        );
      }

      if (this.tokenExchangeService) {
        // D-01: Lazy token exchange with cache — exchange on first call, cache with TTL
        // D-03: Narrowed scopes per tool via getScopesForTool()
        const toolScopes = getScopesForTool(context.toolName);
        const cacheKey = context.session.sessionId;

        // Check cache first
        const cachedToken = tokenCache.get(cacheKey, toolScopes);
        if (cachedToken) {
          token = cachedToken;
          this.logger.debug(`[BankingToolProvider] Cache hit for ${tool.name} (scopes: ${toolScopes.join(',')})`);
        } else {
          // Cache miss — perform RFC 8693 token exchange
          this.logger.info(`[BankingToolProvider] Token exchange initiated for tool: ${tool.name}, scopes: ${toolScopes.join(',')}`);
          try {
            // Item 7 (RFC 8693 §2.1): include audience so PingOne scopes the token to the
            // banking resource server. Only sent when the env var is configured.
            const exchangeRequest: TokenExchangeRequest = {
              grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
              subject_token: userToken.accessToken,
              subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
              scope: toolScopes.join(' '),
              ...(process.env.BANKING_API_RESOURCE_URI && { audience: process.env.BANKING_API_RESOURCE_URI }),
            };
            const exchangeResponse = await this.tokenExchangeService.exchangeToken(exchangeRequest);
            token = exchangeResponse.access_token;

            // Item 6 (D-02): Confirm PingOne issued a valid access token by verifying the
            // TLS-secured exchange response fields — token_type:'Bearer' + positive expires_in
            // establishes the delegation chain without unsafe unsigned JWT payload decoding.
            if (exchangeResponse.token_type !== 'Bearer' || !(exchangeResponse.expires_in > 0)) {
              throw new Error(
                `Token exchange for '${tool.name}' returned unexpected response — ` +
                `token_type: ${exchangeResponse.token_type}, expires_in: ${exchangeResponse.expires_in}`
              );
            }

            // Cache the exchanged token
            const expiresAt = Date.now() + (exchangeResponse.expires_in * 1000);
            tokenCache.set(cacheKey, toolScopes, token, expiresAt);

            this.logger.info(`[BankingToolProvider] Token exchange succeeded for ${tool.name} (expires_in: ${exchangeResponse.expires_in}s)`);
          } catch (exchangeError) {
            // D-04: Hard fail on exchange error — no pass-through fallback
            this.logger.error(`[BankingToolProvider] Token exchange FAILED for ${tool.name}:`, {}, exchangeError instanceof Error ? exchangeError : undefined);
            throw new Error(
              `Token exchange failed for tool '${tool.name}': ${exchangeError instanceof Error ? exchangeError.message : 'Unknown error'}`
            );
          }
        }
      } else {
        // No token exchange service — direct pass-through (backward compat / ff_skip_token_exchange)
        token = userToken.accessToken;
        this.logger.debug(`[BankingToolProvider] Using session user token for ${tool.name} (no token exchange service)`);
      }
    }

    // Item 8: structural exp/iss/aud pre-flight for sensitive operations.
    // Non-network local decode — verifies token has not expired before we hit the banking API.
    const SENSITIVE_HANDLERS = new Set([
      'executeGetSensitiveAccountDetails',
      'executeCreateTransfer',
      'executeCreateWithdrawal',
      'executeCreateDeposit',
    ]);
    if (SENSITIVE_HANDLERS.has(tool.handler)) {
      await this.assertTokenClaims(token, tool.name);
    }

    switch (tool.handler) {
      case 'executeGetMyAccounts':
        return await this.executeGetMyAccounts(token);

      case 'executeGetAccountBalance':
        return await this.executeGetAccountBalance(token, context.params as { account_id: string });

      case 'executeGetMyTransactions':
        return await this.executeGetMyTransactions(token);

      case 'executeCreateDeposit':
        return await this.executeCreateDeposit(token, context.params as { to_account_id: string; amount: number; description?: string });

      case 'executeCreateWithdrawal':
        return await this.executeCreateWithdrawal(token, context.params as { from_account_id: string; amount: number; description?: string });

      case 'executeCreateTransfer':
        return await this.executeCreateTransfer(token, context.params as { from_account_id: string; to_account_id: string; amount: number; description?: string });

      case 'executeQueryUserByEmail':
        return await this.executeQueryUserByEmail(token, context.params as { email: string });

      case 'executeGetSensitiveAccountDetails':
        return await this.executeGetSensitiveAccountDetails(token);

      default:
        return this.createErrorResult(`Unknown tool handler: ${tool.handler}`, context.params);
    }
  }

  /**
   * Execute get_my_accounts tool
   */
  private async executeGetMyAccounts(userToken: string): Promise<BankingToolResult> {
    this.logger.debug(`[BankingToolProvider] Calling Banking API: getMyAccounts`);
    const accounts = await this.apiClient.getMyAccounts(userToken);

    if (accounts && accounts.length !== undefined) {
      this.logger.debug(`[BankingToolProvider] Banking API response: Found ${accounts.length} accounts`);
    }

    const response = {
      success: true,
      count: accounts.length,
      accounts: accounts.map(account => ({
        id: account.id,
        accountType: account.accountType,
        name: account.name || null,
        accountNumber: account.accountNumber,
        balance: account.balance,
        currency: account.currency || 'USD',
        status: account.status || 'active',
        accountHolderName: account.accountHolderName || null,
        swiftCode: account.swiftCode || null,
        iban: account.iban || null,
        branchName: account.branchName || null,
        branchCode: account.branchCode || null,
        openedDate: account.openedDate || null,
        createdAt: account.createdAt,
      }))
    };

    return this.createSuccessResult(JSON.stringify(response, null, 2));
  }

  /**
   * Execute get_account_balance tool
   */
  private async executeGetAccountBalance(
    userToken: string,
    params: { account_id: string }
  ): Promise<BankingToolResult> {
    this.logger.debug(`[BankingToolProvider] Calling Banking API: getAccountBalance for account ${params.account_id}`);
    const balanceResponse = await this.apiClient.getAccountBalance(userToken, params.account_id);
    this.logger.debug(`[BankingToolProvider] Banking API response: Account balance retrieved`);

    const response = {
      success: true,
      accountId: params.account_id,
      balance: balanceResponse.balance
    };

    return this.createSuccessResult(JSON.stringify(response, null, 2));
  }

  /**
   * Execute get_my_transactions tool
   */
  private async executeGetMyTransactions(userToken: string): Promise<BankingToolResult> {
    const transactions = await this.apiClient.getMyTransactions(userToken);

    if (!Array.isArray(transactions)) {
      this.logger.warn(`[BankingToolProvider] Expected transactions array, got: ${typeof transactions}`);

      return this.createErrorResult(`Invalid response format from banking API (received: ${typeof transactions})`);
    }

    const response = {
      success: true,
      count: transactions.length,
      transactions: transactions.map(transaction => ({
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        date: transaction.createdAt,
        fromAccountId: transaction.fromAccountId || null,
        toAccountId: transaction.toAccountId || null,
        description: transaction.description || null
      }))
    };

    return this.createSuccessResult(JSON.stringify(response, null, 2));
  }

  /**
   * Execute create_deposit tool
   */
  private async executeCreateDeposit(
    userToken: string,
    params: { to_account_id: string; amount: number; description?: string }
  ): Promise<BankingToolResult> {
    this.logger.info(`[BankingToolProvider] Calling Banking API: createDeposit - Amount: ${params.amount}, Account: ${params.to_account_id}`);
    try {
      const response = await this.apiClient.createDeposit(
        userToken,
        params.to_account_id,
        params.amount,
        params.description
      );
      this.logger.info(`[BankingToolProvider] Banking API response: Deposit successful`);

      const result = {
        success: true,
        operation: 'deposit',
        message: response.message,
        transaction: response.transaction ? {
          id: response.transaction.id,
          amount: params.amount,
          toAccountId: params.to_account_id,
          description: params.description || null
        } : null,
        amount: params.amount,
        accountId: params.to_account_id
      };

      return this.createSuccessResult(JSON.stringify(result, null, 2));
    } catch (error) {
      const handled = this.handleTransactionBankingError(error, 'deposit', params.amount);
      if (handled) return handled;
      throw error;
    }
  }

  /**
   * Execute create_withdrawal tool
   */
  private async executeCreateWithdrawal(
    userToken: string,
    params: { from_account_id: string; amount: number; description?: string }
  ): Promise<BankingToolResult> {
    try {
      const response = await this.apiClient.createWithdrawal(
        userToken,
        params.from_account_id,
        params.amount,
        params.description
      );

      const result = {
        success: true,
        operation: 'withdrawal',
        message: response.message,
        transaction: response.transaction ? {
          id: response.transaction.id,
          amount: params.amount,
          fromAccountId: params.from_account_id,
          description: params.description || null
        } : null,
        amount: params.amount,
        accountId: params.from_account_id
      };

      return this.createSuccessResult(JSON.stringify(result, null, 2));
    } catch (error) {
      const handled = this.handleTransactionBankingError(error, 'withdrawal', params.amount);
      if (handled) return handled;
      throw error;
    }
  }

  /**
   * Execute create_transfer tool
   */
  private async executeCreateTransfer(
    userToken: string,
    params: { from_account_id: string; to_account_id: string; amount: number; description?: string }
  ): Promise<BankingToolResult> {
    try {
      const response = await this.apiClient.createTransfer(
        userToken,
        params.from_account_id,
        params.to_account_id,
        params.amount,
        params.description
      );

      const result = {
        success: true,
        operation: 'transfer',
        message: response.message,
        withdrawalTransaction: response.withdrawalTransaction ? {
          id: response.withdrawalTransaction.id,
          amount: params.amount,
          fromAccountId: params.from_account_id
        } : null,
        depositTransaction: response.depositTransaction ? {
          id: response.depositTransaction.id,
          amount: params.amount,
          toAccountId: params.to_account_id
        } : null,
        amount: params.amount,
        fromAccountId: params.from_account_id,
        toAccountId: params.to_account_id,
        description: params.description || null
      };

      return this.createSuccessResult(JSON.stringify(result, null, 2));
    } catch (error) {
      const handled = this.handleTransactionBankingError(error, 'transfer', params.amount);
      if (handled) return handled;
      throw error;
    }
  }

  /**
   * Execute query_user_by_email tool
   */
  private async executeQueryUserByEmail(
    userToken: string,
    params: { email: string }
  ): Promise<BankingToolResult> {
    try {
      this.logger.debug(`[BankingToolProvider] Calling Banking API: queryUserByEmail`);
      const response = await this.apiClient.queryUserByEmail(userToken, params.email);
      this.logger.debug(`[BankingToolProvider] Banking API response: queryUserByEmail completed`);

      // Return the complete API response as JSON
      return this.createSuccessResult(JSON.stringify(response, null, 2));
    } catch (error) {
      // Handle 404 as a normal "not found" response rather than an error
      if (error instanceof BankingAPIError && error.statusCode === 404) {
        const notFoundResponse = {
          exists: false,
          email: params.email,
          error: "User not found"
        };
        return this.createSuccessResult(JSON.stringify(notFoundResponse, null, 2));
      }
      throw error; // Re-throw other errors to be handled by main executeTool method
    }
  }


  /**
   * Execute get_sensitive_account_details tool.
   * Calls GET /accounts/sensitive-details on the BFF.
   * Returns consent_required:true in the result text if the BFF gate is not satisfied.
   */
  private async executeGetSensitiveAccountDetails(userToken: string): Promise<BankingToolResult> {
    this.logger.debug(`[BankingToolProvider] Calling Banking API: getSensitiveAccountDetails`);
    try {
      const response = await this.apiClient.getSensitiveAccountDetails(userToken);

      // Step-up required (428 from BFF — ACR not elevated)
      if (response && (response as any).ok === false && (response as any).step_up_required === true) {
        const stepUpPayload = {
          ok: false,
          step_up_required: true,
          error: 'step_up_required',
          step_up_method: (response as any).step_up_method || 'email',
        };
        return this.createSuccessResult(JSON.stringify(stepUpPayload, null, 2));
      }

      // BFF gate returned consent_required — surface as structured result
      if (response && (response as any).ok === false && (response as any).consent_required) {
        const consentPayload = {
          ok: false,
          consent_required: true,
          reason: (response as any).reason || 'sensitive_data_access',
        };
        return this.createSuccessResult(JSON.stringify(consentPayload, null, 2));
      }

      if (!response || (response as any).ok === false) {
        return this.createErrorResult(`Access denied: ${(response as any)?.reason || 'paz_denied'}`);
      }

      return this.createSuccessResult(JSON.stringify({
        success: true,
        accounts: (response as any).accounts || [],
      }, null, 2));
    } catch (error) {
      this.logger.error('[BankingToolProvider] getSensitiveAccountDetails error:', {}, error instanceof Error ? error : undefined);
      return this.createErrorResult(
        `Failed to retrieve sensitive account details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Central error handler for transactional banking operations (deposit / withdrawal / transfer).
   * Returns a structured BankingToolResult for known recoverable error codes, or null when the
   * error is not one of the recognised codes (caller should re-throw in that case).
   *
   * @param error         The caught error value
   * @param operationLabel Human-readable operation name used in user-facing messages
   * @param amount        The requested transaction amount
   */
  private handleTransactionBankingError(
    error: unknown,
    operationLabel: string,
    amount: number,
  ): BankingToolResult | null {
    if (!(error instanceof BankingAPIError)) return null;
    const axiosData = (error.originalError?.response?.data ?? {}) as Record<string, unknown>;

    if (error.errorCode === 'amount_exceeds_hard_limit') {
      const limit = typeof axiosData['limit'] === 'number' ? axiosData['limit'] : 1000;
      return this.createSuccessResult(
        JSON.stringify(
          {
            error: 'amount_exceeds_hard_limit',
            message: `I can help you with that, but the maximum transaction amount is $${limit}. You entered $${amount}. Would you like me to help you with a smaller ${operationLabel} instead?`,
            limit,
            amount,
          },
          null,
          2
        )
      );
    }

    if (error.errorCode === 'step_up_required') {
      const stepUpMethod: string = typeof axiosData['step_up_method'] === 'string'
        ? (axiosData['step_up_method'] as string) : 'email';
      return this.createSuccessResult(
        JSON.stringify(
          {
            error: 'step_up_required',
            step_up_required: true,
            step_up_method: stepUpMethod,
            message: `This transaction requires additional authentication (${stepUpMethod.toUpperCase()}). Please complete the step-up verification to proceed.`,
            amount_threshold: typeof axiosData['amount_threshold'] === 'number' ? axiosData['amount_threshold'] : null,
          },
          null,
          2
        )
      );
    }

    if (error.errorCode === 'consent_challenge_required') {
      return this.createSuccessResult(
        JSON.stringify(
          {
            error: 'consent_challenge_required',
            message: error.message,
            consent_challenge_required: true,
            hitl_threshold_usd: HITL_THRESHOLD_USD,
          },
          null,
          2
        )
      );
    }

    return null;
  }

  /**
   * Execute sequential_think tool — structured step-by-step reasoning
   * No user auth required; reasons about banking decisions without accessing live data.
   */
  private async executeSequentialThink(
    params: { query: string; context?: string }
  ): Promise<BankingToolResult> {
    const { query, context: ctx } = params;

    const steps: Array<{ title: string; description: string }> = [
      {
        title: 'Understand the request',
        description: `Parsing: "${query}"${ctx ? `. Additional context: ${ctx}` : ''}.`
      },
      {
        title: 'Identify relevant factors',
        description: 'Considering account balances, transaction history, applicable limits, and user goals.'
      },
      {
        title: 'Evaluate options',
        description: 'Weighing the available actions against constraints: authorization scopes, daily limits, and account eligibility.'
      },
      {
        title: 'Assess risk and impact',
        description: 'Checking for potential issues: insufficient funds, scope requirements, consent gates, or regulatory flags.'
      },
      {
        title: 'Formulate recommendation',
        description: 'Based on analysis, selecting the most appropriate approach that satisfies the request safely.'
      }
    ];

    const conclusion = `Analysis complete for: "${query}". Proceeding with recommended approach.`;
    const result = { steps, conclusion };
    this.logger.debug(`[BankingToolProvider] sequential_think completed: ${steps.length} steps for query: "${query.slice(0, 60)}"`);

    return this.createSuccessResult(JSON.stringify(result, null, 2));
  }

  /**
   * Create a successful tool result
   */
  private createSuccessResult(text: string): BankingToolResult {
    return {
      type: 'text',
      text,
      success: true
    };
  }

  /**
   * Create an error tool result
   */
  private createErrorResult(error: string, _originalRequest?: Record<string, any>): BankingToolResult {
    // Note: originalRequest is intentionally not included in the error payload.
    // Tool params may contain account IDs or amounts that should not be echoed
    // back in error responses. Use httpTrace for debugging instead.
    return {
      type: 'text',
      text: `Error: ${error}`,
      success: false,
      error
    };
  }

  /**
   * Create an authorization challenge result
   */
  private createAuthChallengeResult(challenge: AuthorizationChallenge): BankingToolResult {
    const mcpChallenge = this.authChallengeHandler.formatMCPAuthorizationChallenge(challenge);

    return {
      type: 'text',
      text: mcpChallenge.text,
      success: false,
      error: 'User authorization required',
      authChallenge: mcpChallenge.authChallenge
    };
  }

  /**
   * Decode the payload of a JWT without verifying the signature.
   *
   * SECURITY NOTE: This is intentionally unsigned decode. The token was issued
   * by PingOne during RFC 8693 token exchange — PingOne verified the subject
   * and actor tokens before issuing. We only inspect claims (act, sub, scopes)
   * here; the BFF/MCP server validated the token signature at the transport
   * boundary before it reached this point. Do NOT use this for authorization
   * decisions outside of claim inspection on already-authenticated tokens.
   */
  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Attempt JWKS signature verification first (RFC 7515); fall back to structural local check.
   * Fail-open: JWKS failures are logged but never block the tool call.
   */
  private async assertTokenClaims(token: string, toolName: string): Promise<void> {
    // ── Structural local check (exp/iss/aud) ───────────────────────────────────
    const payload = this.decodeJwtPayload(token);
    if (!payload) return; // opaque token — skip all checks

    const now = Math.floor(Date.now() / 1000);
    const exp = typeof payload.exp === 'number' ? payload.exp : null;
    const iss = typeof payload.iss === 'string' ? payload.iss : null;
    const aud = payload.aud;

    if (exp !== null && exp < now) {
      throw new AuthenticationError(
        `Token for '${toolName}' has expired (exp: ${new Date(exp * 1000).toISOString()})`,
        AuthErrorCodes.TOKEN_EXPIRED
      );
    }

    if (!iss) {
      this.logger.warn(`[BankingToolProvider] Token for sensitive tool '${toolName}' has no iss claim`);
    }

    const expectedAud = process.env.BANKING_API_RESOURCE_URI;
    if (expectedAud && aud) {
      const audArray: string[] = Array.isArray(aud) ? (aud as string[]) : [aud as string];
      if (!audArray.includes(expectedAud)) {
        this.logger.warn(
          `[BankingToolProvider] Token aud [${audArray.join(', ')}] does not include ` +
          `expected audience '${expectedAud}' for '${toolName}'`
        );
      }
    }

    // ── JWKS Cryptographic Signature Verification (RFC 7515) ──────────────────
    // Verify the MCP token's RS256/ES256 signature using PingOne's published JWKS.
    // Fail-open: JWKS failures are logged but never block the tool call — the BFF
    // already performed JWKS verification before issuing this token to the MCP server.
    const jwks = getJwksKeySet();
    if (jwks) {
      try {
        const verifyOpts: Parameters<typeof jwtVerify>[2] = {};
        if (expectedAud) verifyOpts.audience = expectedAud;
        if (iss) verifyOpts.issuer = iss;
        await jwtVerify(token, jwks, verifyOpts);
        this.logger.info(`[BankingToolProvider] JWKS sig ✅ verified for sensitive tool '${toolName}'`);
      } catch (jwksErr) {
        const msg = jwksErr instanceof Error ? jwksErr.message : String(jwksErr);
        // JWTExpired is already caught above — ignore it here to avoid double-log
        if (!msg.includes('expired')) {
          // STRICT_TOKEN_VERIFICATION=true promotes JWKS failures to hard errors.
          // Leave unset (default fail-open) when the BFF already verified the signature upstream.
          if (process.env.STRICT_TOKEN_VERIFICATION === 'true') {
            throw new Error(`Token signature verification failed for '${toolName}': ${msg}`);
          }
          this.logger.warn(`[BankingToolProvider] JWKS sig ⚠ warning for '${toolName}': ${msg} (fail-open)`);
        }
      }
    } else {
      this.logger.debug(`[BankingToolProvider] JWKS not configured — skipping sig verification for '${toolName}'`);
    }
  }

  /**
   * Get user token that has the required scopes
   */
  private getUserTokenForScopes(session: Session, requiredScopes: string[]): import('../interfaces/auth').UserTokens | null {
    if (!session.userTokens) {
      return null;
    }

    // Handle both single token and token array
    const tokens = Array.isArray(session.userTokens) ? session.userTokens : [session.userTokens];

    // Find tokens that have all required scopes and are not expired
    for (const userToken of tokens) {
      if (this.authManager.isTokenExpired(userToken)) {
        continue;
      }

      const tokenScopes = userToken.scope.split(' ');
      const hasAllScopes = requiredScopes.every(scope => tokenScopes.includes(scope));

      if (hasAllScopes) {
        return userToken;
      }
    }

    return null;
  }
}