/**
 * Server Configuration Interfaces
 * Core interfaces for server configuration and environment setup
 */

import { PingOneConfig, BankingAPIConfig } from './index';

export interface SecurityConfig {
  encryptionKey: string;
  tokenStoragePath: string;
  sessionCleanupInterval: number;
  maxSessionDuration: number;
}

export interface ServerConfig {
  host: string;
  port: number;
  maxConnections: number;
  sessionTimeout: number;
}

export interface LoggingConfig {
  level: string;
  auditLogPath: string;
  securityLogPath: string;
}

export interface BankingMCPServerConfig {
  server: ServerConfig;
  pingone: PingOneConfig;
  bankingApi: BankingAPIConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
}

export interface EnvironmentVariables {
  // Server configuration
  MCP_SERVER_HOST?: string;
  MCP_SERVER_PORT?: string;
  MAX_CONNECTIONS?: string;
  SESSION_TIMEOUT?: string;

  // HTTP MCP transport (spec 2025-11-25 — Phase D)
  /** Set to 'false' to disable the HTTP Streamable MCP transport (default: enabled). */
  HTTP_MCP_TRANSPORT_ENABLED?: string;
  /** Public base URL of this server used in RFC 9728 metadata and WWW-Authenticate, e.g. https://mcp.example.com */
  MCP_RESOURCE_URL?: string;
  /** Comma-separated allowed HTTP Origin headers. Empty = allow all (suitable for demo/server-to-server). */
  MCP_ALLOWED_ORIGINS?: string;
  /**
   * Resource URI used for RFC 8707 audience validation on inbound agent tokens.
   * When set, TokenIntrospector rejects tokens whose `aud` claim does not include this value.
   * Recommended: set to the same value as MCP_RESOURCE_URL.
   */
  MCP_SERVER_RESOURCE_URI?: string;

  // PingOne configuration
  PINGONE_BASE_URL?: string;
  PINGONE_CLIENT_ID?: string;
  PINGONE_CLIENT_SECRET?: string;
  PINGONE_INTROSPECTION_ENDPOINT?: string;
  PINGONE_AUTHORIZATION_ENDPOINT?: string;
  PINGONE_TOKEN_ENDPOINT?: string;

  // Banking API configuration
  BANKING_API_BASE_URL?: string;
  BANKING_API_TIMEOUT?: string;
  BANKING_API_MAX_RETRIES?: string;
  CIRCUIT_BREAKER_THRESHOLD?: string;

  // Security configuration
  ENCRYPTION_KEY?: string;
  TOKEN_STORAGE_PATH?: string;
  SESSION_CLEANUP_INTERVAL?: string;
  MAX_SESSION_DURATION?: string;

  // Per-request timeouts (spec SHOULD — MCP 2025-11-25 §lifecycle/timeouts)
  /** Tool call execution timeout in ms (default: 30000). Applies to the executeTool call only; CIBA waits are excluded. */
  TOOL_CALL_TIMEOUT_MS?: string;

  // Logging configuration
  LOG_LEVEL?: string;
  AUDIT_LOG_PATH?: string;
  SECURITY_LOG_PATH?: string;
  /** Upstash Redis REST URL — required for AuditLogger persistence. */
  UPSTASH_REDIS_REST_URL?: string;
  /** Upstash Redis REST token — required for AuditLogger persistence. */
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export const DEFAULT_CONFIG: Omit<BankingMCPServerConfig, 'pingone'> = {
  server: {
    host: '0.0.0.0',
    port: 8080,
    maxConnections: 100,
    sessionTimeout: 3600
  },
  bankingApi: {
    baseUrl: 'http://localhost:3001',
    timeout: 30000,
    maxRetries: 3,
    circuitBreakerThreshold: 5
  },
  security: {
    encryptionKey: '', // Must be provided via environment
    tokenStoragePath: './data/tokens',
    sessionCleanupInterval: 300,
    maxSessionDuration: 86400
  },
  logging: {
    level: 'INFO',
    auditLogPath: './logs/audit.log',
    securityLogPath: './logs/security.log'
  }
};