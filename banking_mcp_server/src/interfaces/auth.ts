/**
 * Authentication Interfaces
 * Core interfaces for PingOne authentication and token management
 */

export interface AgentTokenInfo {
  tokenHash: string;
  clientId: string;
  scopes: string[];
  expiresAt: Date;
  isValid: boolean;
  /** Populated when the token carries an RFC 8693 `act` claim — identifies the
   *  actor (e.g. Backend-for-Frontend (BFF) or AI agent client_id) that performed token exchange. */
  actorClientId?: string;
}

export interface UserTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  scope: string;
  issuedAt: Date;
}

export interface TokenInfo {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  aud?: string;
  iss?: string;
  /** RFC 8693 §4.1 — present on delegated tokens issued via token exchange.
   *  Identifies the actor (client) that performed the exchange on behalf of `sub`.
   *  Nested `act` may appear for multi-hop delegation (e.g. MCP layer then agent). */
  act?: {
    client_id?: string;
    sub?: string;
    iss?: string;
    act?: { client_id?: string; sub?: string; iss?: string };
  };
}

export interface PingOneConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  tokenIntrospectionEndpoint: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

export interface Session {
  sessionId: string;
  agentTokenHash: string;
  userTokens?: UserTokens | UserTokens[];
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
}

export interface AuthorizationCodeExchangeRequest {
  grant_type: 'authorization_code';
  code: string;
  redirect_uri?: string;
  client_id: string;
  client_secret: string;
}

export interface TokenRefreshRequest {
  grant_type: 'refresh_token';
  refresh_token: string;
  client_id: string;
  client_secret: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface AuthorizationRequest {
  authorizationUrl: string;
  state: string;
  scope: string;
  sessionId: string;
  expiresAt: Date;
  codeVerifier?: string; // For PKCE flow
}

export enum AuthErrorCodes {
  INVALID_AGENT_TOKEN = 'INVALID_AGENT_TOKEN',
  USER_AUTHORIZATION_REQUIRED = 'USER_AUTHORIZATION_REQUIRED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INSUFFICIENT_SCOPE = 'INSUFFICIENT_SCOPE',
  INVALID_AUTHORIZATION_CODE = 'INVALID_AUTHORIZATION_CODE',
  TOKEN_REFRESH_FAILED = 'TOKEN_REFRESH_FAILED'
}

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public code: AuthErrorCodes,
    public authorizationUrl?: string,
    public requiredScopes?: string[]
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}