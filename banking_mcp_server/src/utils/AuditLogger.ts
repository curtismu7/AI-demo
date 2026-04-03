/**
 * Audit logging system for banking operations
 * Maintains detailed audit trails with user context preservation
 */

import { Logger } from './Logger.js';
import { Redis } from '@upstash/redis';

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  eventType: 'banking_operation' | 'authentication' | 'authorization' | 'session_management';
  operation: string;
  userId?: string;
  agentId?: string;
  sessionId?: string;
  resourceId?: string;
  resourceType?: 'account' | 'transaction' | 'session' | 'token';
  outcome: 'success' | 'failure' | 'partial';
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  duration?: number;
  errorCode?: string;
  errorMessage?: string;
  /** OAuth scopes on the token used for this operation. */
  scope?: string[];
  /** Token type that authorized this operation. 'exchanged' for RFC 8693 derived tokens. */
  tokenType?: 'agent' | 'user' | 'exchanged';
  /** Sanitized summary of tool input params (no raw secrets). */
  requestSummary?: string;
  /** Outcome summary (not raw response data). */
  responseSummary?: string;
}

export interface BankingOperationAudit {
  operation: 'get_accounts' | 'get_balance' | 'get_transactions' | 'create_deposit' | 'create_withdrawal' | 'create_transfer';
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  amount?: number;
  transactionId?: string;
  balanceBefore?: number;
  balanceAfter?: number;
}

export interface AuthenticationAudit {
  operation: 'agent_token_validation' | 'user_authorization' | 'token_refresh' | 'token_revocation';
  tokenType?: 'agent' | 'user' | 'refresh' | 'exchanged';
  scopes?: string[];
  grantType?: string;
  clientId?: string;
}

export interface SessionAudit {
  operation: 'session_create' | 'session_update' | 'session_expire' | 'session_cleanup';
  sessionDuration?: number;
  tokensAssociated?: boolean;
  cleanupReason?: string;
}

/**
 * Audit logger for comprehensive banking operation tracking
 */
export class AuditLogger {
  private logger: Logger;
  private static instance: AuditLogger;

  private redis: Redis | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  private getRedis(): Redis | null {
    if (this.redis) return this.redis;
    const url = process.env['UPSTASH_REDIS_REST_URL'];
    const token = process.env['UPSTASH_REDIS_REST_TOKEN'];
    if (!url || !token) return null;
    this.redis = new Redis({ url, token });
    return this.redis;
  }

  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const SENSITIVE = /password|secret|token|key|credential|authorization/i;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      result[k] = SENSITIVE.test(k) ? '[REDACTED]' : v;
    }
    return result;
  }

  private async writeToRedis(event: AuditEvent): Promise<void> {
    const client = this.getRedis();
    if (!client) return;
    try {
      const key = 'mcp:audit:events';
      const entry = JSON.stringify(event);
      await client.lpush(key, entry);
      await client.ltrim(key, 0, 499);
      await client.expire(key, 604800);
    } catch (err) {
      process.stderr.write('[AuditLogger] Redis write failed: ' + (err instanceof Error ? err.message : String(err)) + '\n');
    }
  }

  static getInstance(logger?: Logger): AuditLogger {
    if (!AuditLogger.instance) {
      if (!logger) {
        throw new Error('Logger instance required for first initialization');
      }
      AuditLogger.instance = new AuditLogger(logger);
    }
    return AuditLogger.instance;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create base audit event
   */
  private createBaseAuditEvent(
    eventType: AuditEvent['eventType'],
    operation: string,
    outcome: AuditEvent['outcome'],
    context: {
      userId?: string;
      agentId?: string;
      sessionId?: string;
      resourceId?: string;
      resourceType?: AuditEvent['resourceType'];
      ipAddress?: string;
      userAgent?: string;
      duration?: number;
      errorCode?: string;
      errorMessage?: string;
    }
  ): Omit<AuditEvent, 'details'> {
    return {
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
      eventType,
      operation,
      outcome,
      ...context
    };
  }

  /**
   * Log banking operation audit event
   */
  async logBankingOperation(
    operation: BankingOperationAudit['operation'],
    outcome: AuditEvent['outcome'],
    context: {
      userId: string;
      agentId?: string;
      sessionId: string;
      ipAddress?: string;
      userAgent?: string;
      duration?: number;
      errorCode?: string;
      errorMessage?: string;
    },
    operationDetails: Partial<BankingOperationAudit>
  ): Promise<void> {
    const baseEvent = this.createBaseAuditEvent(
      'banking_operation',
      operation,
      outcome,
      {
        ...context,
        resourceType: operationDetails.accountId ? 'account' : 'transaction',
        resourceId: operationDetails.accountId || operationDetails.transactionId
      }
    );

    const auditEvent: AuditEvent = {
      ...baseEvent,
      details: {
        operation,
        ...operationDetails,
        // Ensure sensitive data is not logged
        amount: operationDetails.amount ? `$${operationDetails.amount.toFixed(2)}` : undefined
      }
    };

    await this.logger.info('Banking operation audit', {
      auditEvent,
      operation: 'audit_banking'
    });
    await this.writeToRedis(auditEvent);
  }

  /**
   * Log authentication audit event
   */
  async logAuthentication(
    operation: AuthenticationAudit['operation'],
    outcome: AuditEvent['outcome'],
    context: {
      userId?: string;
      agentId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      duration?: number;
      errorCode?: string;
      errorMessage?: string;
    },
    authDetails: Partial<AuthenticationAudit>
  ): Promise<void> {
    const baseEvent = this.createBaseAuditEvent(
      'authentication',
      operation,
      outcome,
      {
        ...context,
        resourceType: 'token'
      }
    );

    const auditEvent: AuditEvent = {
      ...baseEvent,
      details: {
        operation,
        ...authDetails
      }
    };

    await this.logger.info('Authentication audit', {
      auditEvent,
      operation: 'audit_authentication'
    });
    await this.writeToRedis(auditEvent);
  }

  /**
   * Log authorization audit event
   */
  async logAuthorization(
    operation: string,
    outcome: AuditEvent['outcome'],
    context: {
      userId?: string;
      agentId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      duration?: number;
      errorCode?: string;
      errorMessage?: string;
    },
    authzDetails: {
      requiredScopes?: string[];
      grantedScopes?: string[];
      resourceRequested?: string;
      decision?: 'allow' | 'deny';
      reason?: string;
    }
  ): Promise<void> {
    const baseEvent = this.createBaseAuditEvent(
      'authorization',
      operation,
      outcome,
      context
    );

    const auditEvent: AuditEvent = {
      ...baseEvent,
      details: {
        operation,
        ...authzDetails
      }
    };

    await this.logger.info('Authorization audit', {
      auditEvent,
      operation: 'audit_authorization'
    });
    await this.writeToRedis(auditEvent);
  }

  /**
   * Log session management audit event
   */
  async logSessionManagement(
    operation: SessionAudit['operation'],
    outcome: AuditEvent['outcome'],
    context: {
      userId?: string;
      agentId?: string;
      sessionId: string;
      ipAddress?: string;
      userAgent?: string;
      duration?: number;
      errorCode?: string;
      errorMessage?: string;
    },
    sessionDetails: Partial<SessionAudit>
  ): Promise<void> {
    const baseEvent = this.createBaseAuditEvent(
      'session_management',
      operation,
      outcome,
      {
        ...context,
        resourceType: 'session',
        resourceId: context.sessionId
      }
    );

    const auditEvent: AuditEvent = {
      ...baseEvent,
      details: {
        operation,
        ...sessionDetails
      }
    };

    await this.logger.info('Session management audit', {
      auditEvent,
      operation: 'audit_session'
    });
    await this.writeToRedis(auditEvent);
  }

  /**
   * Log security incident
   */
  async logSecurityIncident(
    incident: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    context: {
      userId?: string;
      agentId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      resourceId?: string;
      resourceType?: AuditEvent['resourceType'];
    },
    incidentDetails: Record<string, any>
  ): Promise<void> {
    const baseEvent = this.createBaseAuditEvent(
      'authentication', // Security incidents are often auth-related
      `security_incident_${incident}`,
      'failure',
      context
    );

    const auditEvent: AuditEvent = {
      ...baseEvent,
      details: {
        incident,
        severity,
        ...incidentDetails
      }
    };

    await this.logger.warn('Security incident', {
      auditEvent,
      operation: 'audit_security',
      severity
    });
    await this.writeToRedis(auditEvent);
  }

  /**
   * Query audit logs (simplified interface for monitoring)
   */
  async queryAuditLogs(filters: {
    eventType?: AuditEvent['eventType'];
    operation?: string;
    userId?: string;
    agentId?: string;
    sessionId?: string;
    outcome?: AuditEvent['outcome'];
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<AuditEvent[]> {
    const client = this.getRedis();
    if (!client) {
      await this.logger.debug('Audit log query: Redis not configured, returning empty', { filters, operation: 'audit_query' });
      return [];
    }

    try {
      const raw = await client.lrange('mcp:audit:events', 0, 499);
      let events: AuditEvent[] = raw
        .map((entry: unknown) => {
          try { return JSON.parse(typeof entry === 'string' ? entry : JSON.stringify(entry)) as AuditEvent; }
          catch { return null; }
        })
        .filter((e: AuditEvent | null): e is AuditEvent => e !== null);

      if (filters.eventType) events = events.filter(e => e.eventType === filters.eventType);
      if (filters.operation) events = events.filter(e => e.operation === filters.operation);
      if (filters.userId) events = events.filter(e => e.userId === filters.userId);
      if (filters.agentId) events = events.filter(e => e.agentId === filters.agentId);
      if (filters.sessionId) events = events.filter(e => e.sessionId === filters.sessionId);
      if (filters.outcome) events = events.filter(e => e.outcome === filters.outcome);
      if (filters.startTime) events = events.filter(e => new Date(e.timestamp) >= filters.startTime!);
      if (filters.endTime) events = events.filter(e => new Date(e.timestamp) <= filters.endTime!);

      const limit = filters.limit ?? 100;
      return events.slice(0, limit);
    } catch (err) {
      await this.logger.warn('Audit query failed', { err: err instanceof Error ? err.message : String(err), operation: 'audit_query' });
      return [];
    }
  }

  /**
   * Generate audit summary report
   */
  async generateAuditSummary(
    startTime: Date,
    endTime: Date,
    filters?: {
      userId?: string;
      agentId?: string;
      eventType?: AuditEvent['eventType'];
    }
  ): Promise<{
    totalEvents: number;
    successfulOperations: number;
    failedOperations: number;
    eventsByType: Record<string, number>;
    topUsers: Array<{ userId: string; eventCount: number }>;
    topOperations: Array<{ operation: string; eventCount: number }>;
  }> {
    await this.logger.info('Generating audit summary', { startTime: startTime.toISOString(), endTime: endTime.toISOString(), filters, operation: 'audit_summary' });

    const events = await this.queryAuditLogs({ startTime, endTime, ...filters, limit: 500 });

    const eventsByType: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    const opCounts: Record<string, number> = {};
    let successCount = 0;
    let failureCount = 0;

    for (const ev of events) {
      eventsByType[ev.eventType] = (eventsByType[ev.eventType] ?? 0) + 1;
      if (ev.userId) userCounts[ev.userId] = (userCounts[ev.userId] ?? 0) + 1;
      opCounts[ev.operation] = (opCounts[ev.operation] ?? 0) + 1;
      if (ev.outcome === 'success') successCount++;
      else if (ev.outcome === 'failure') failureCount++;
    }

    const topUsers = Object.entries(userCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([userId, eventCount]) => ({ userId, eventCount }));

    const topOperations = Object.entries(opCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([operation, eventCount]) => ({ operation, eventCount }));

    return {
      totalEvents: events.length,
      successfulOperations: successCount,
      failedOperations: failureCount,
      eventsByType,
      topUsers,
      topOperations,
    };
  }
}