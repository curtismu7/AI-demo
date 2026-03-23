/**
 * Token Introspector for PingOne AI IAM Core
 * Handles token validation and introspection with PingOne endpoints
 */

import { createHash } from 'crypto';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { PingOneConfig, TokenInfo, AgentTokenInfo, AuthenticationError, AuthErrorCodes } from '../interfaces/auth';

export class TokenIntrospector {
  private httpClient: AxiosInstance;
  private config: PingOneConfig;

  constructor(config: PingOneConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    });
  }

  /**
   * Introspect a token using PingOne AI IAM Core introspection endpoint
   */
  async introspectToken(token: string): Promise<TokenInfo> {
    try {
      console.log(`[TokenIntrospector] Calling introspection endpoint: ${this.config.tokenIntrospectionEndpoint}`);
      console.log(`[TokenIntrospector] Using client_id: ${this.config.clientId}`);
      
      const response = await this.httpClient.post(
        this.config.tokenIntrospectionEndpoint,
        new URLSearchParams({
          token: token,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret
        }).toString()
      );

      console.log(`[TokenIntrospector] Introspection response status: ${response.status}`);
      console.log(`[TokenIntrospector] Introspection response data:`, response.data);

      return response.data as TokenInfo;
    } catch (error) {
      if (error && typeof error === 'object' && 'isAxiosError' in error) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 401) {
          throw new AuthenticationError(
            'Invalid client credentials for token introspection',
            AuthErrorCodes.INVALID_AGENT_TOKEN
          );
        }
        if (axiosError.response?.status === 400) {
          throw new AuthenticationError(
            'Invalid token format',
            AuthErrorCodes.INVALID_AGENT_TOKEN
          );
        }
      }
      throw new Error(`Token introspection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate agent token and extract token information
   */
  async validateAgentToken(token: string): Promise<AgentTokenInfo> {
    console.log(`[TokenIntrospector] Validating agent token...`);
    const tokenInfo = await this.introspectToken(token);
    
    console.log(`[TokenIntrospector] Token introspection result:`, {
      active: tokenInfo.active,
      client_id: tokenInfo.client_id,
      scope: tokenInfo.scope,
      exp: tokenInfo.exp,
      token_type: tokenInfo.token_type
    });

    if (!tokenInfo.active) {
      throw new AuthenticationError(
        'Agent token is not active',
        AuthErrorCodes.INVALID_AGENT_TOKEN
      );
    }

    // Zero-trust: validate token audience matches this MCP server's resource URI
    const resourceUri = process.env.MCP_SERVER_RESOURCE_URI;
    if (resourceUri && tokenInfo.aud) {
      const audStr = String(tokenInfo.aud);
      // aud may be a space-separated list or a single value
      const audList = audStr.includes(' ') ? audStr.split(' ') : [audStr];
      if (!audList.includes(resourceUri)) {
        console.error(`[TokenIntrospector] Audience mismatch: token aud=${audStr}, expected ${resourceUri}`);
        throw new AuthenticationError(
          'Token audience does not match MCP server resource URI',
          AuthErrorCodes.INVALID_AGENT_TOKEN
        );
      }
      console.log(`[TokenIntrospector] Token audience validated against resource URI: ${resourceUri}`);
    } else if (resourceUri && !tokenInfo.aud) {
      console.warn(`[TokenIntrospector] MCP_SERVER_RESOURCE_URI is set but token has no aud claim — skipping aud check`);
    }

    // Check if token is expired
    if (tokenInfo.exp && tokenInfo.exp < Math.floor(Date.now() / 1000)) {
      throw new AuthenticationError(
        'Agent token has expired',
        AuthErrorCodes.TOKEN_EXPIRED
      );
    }

    // Extract scopes from token
    const scopes = tokenInfo.scope ? tokenInfo.scope.split(' ') : [];

    // RFC 8693 §4.1 — log act claim for audit trail.
    // `act` is present on tokens issued via token exchange and identifies the
    // actor (BFF or AI agent) that performed the exchange on behalf of `sub`.
    const actorClientId = tokenInfo.act?.client_id;
    if (actorClientId) {
      console.log(`[TokenIntrospector] Delegated token — actor: ${actorClientId}, subject: ${tokenInfo.sub}`);
    } else {
      console.log(`[TokenIntrospector] Direct token — subject: ${tokenInfo.sub} (no act claim)`);
    }

    return {
      tokenHash: this.hashToken(token),
      clientId: tokenInfo.client_id || 'unknown',
      scopes,
      expiresAt: tokenInfo.exp ? new Date(tokenInfo.exp * 1000) : new Date(Date.now() + 3600000),
      isValid: true,
      actorClientId,
    };
  }

  /**
   * Validate that a token has the required scopes
   */
  async validateTokenScopes(token: string, requiredScopes: string[]): Promise<boolean> {
    try {
      const agentTokenInfo = await this.validateAgentToken(token);
      
      // Check if all required scopes are present
      return requiredScopes.every(scope => agentTokenInfo.scopes.includes(scope));
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Hash token for secure storage (using first 8 chars of SHA-256)
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  /**
   * Check if token introspection endpoint is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to introspect with an invalid token to test endpoint availability
      await this.httpClient.post(
        this.config.tokenIntrospectionEndpoint,
        new URLSearchParams({
          token: 'invalid_token_for_health_check',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret
        }).toString()
      );
      return true;
    } catch (error) {
      if (error && typeof error === 'object' && 'isAxiosError' in error) {
        const axiosError = error as AxiosError;
        // If we get a 400 or 401, the endpoint is reachable
        return axiosError.response?.status === 400 || axiosError.response?.status === 401;
      }
      return false;
    }
  }
}