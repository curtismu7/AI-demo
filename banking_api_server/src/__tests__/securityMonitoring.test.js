/**
 * Security Monitoring Service Tests
 * Comprehensive test suite for security monitoring and audit trail
 * 
 * Phase 57-05: Security Monitoring and Audit Trail
 * Extensive testing to ensure security monitoring accuracy and reliability
 */

const {
  monitorTokenUsage,
  monitorAuthentication,
  monitorCredentialRotation,
  getSecurityDashboard,
  getClientSecurityReport,
  resolveAlert,
  generateSecurityAlert,
  detectAnomalies,
  cleanupSecurityData,
  SECURITY_CONFIG,
  securityMetrics
} = require('../../services/securityMonitoringService');

// Mock dependencies
jest.mock('../../services/exchangeAuditStore');

describe('Security Monitoring Service', () => {
  beforeEach(() => {
    // Reset security metrics
    securityMetrics.total_events = 0;
    securityMetrics.anomalies_detected = 0;
    securityMetrics.alerts_generated = 0;
    securityMetrics.clients_monitored = 0;
    
    // Clear mocks
    jest.clearAllMocks();
  });

  describe('Token Usage Monitoring', () => {
    test('should monitor normal token usage', () => {
      const clientId = 'test-client';
      const tokenData = {
        scopes: ['banking:read'],
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer'
      };
      const requestInfo = {
        ip: '192.168.1.100',
        userAgent: 'Test-Agent/1.0',
        endpoint: '/api/accounts/my'
      };

      const result = monitorTokenUsage(clientId, tokenData, requestInfo);

      expect(result).toHaveProperty('monitored', true);
      expect(result).toHaveProperty('anomalies');
      expect(result).toHaveProperty('alerts');
      expect(result).toHaveProperty('security_score');
      expect(result.security_score).toBeGreaterThan(0);
      expect(result.anomalies.length).toBe(0); // Normal usage should not generate anomalies
    });

    test('should detect high-risk token usage', () => {
      const clientId = 'test-client';
      const tokenData = {
        scopes: ['admin:delete', 'banking:write'], // High-risk scopes
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer'
      };
      const requestInfo = {
        ip: '192.168.1.100',
        userAgent: 'Test-Agent/1.0',
        endpoint: '/api/admin/delete'
      };

      const result = monitorTokenUsage(clientId, tokenData, requestInfo);

      expect(result.monitored).toBe(true);
      expect(result.security_score).toBeLessThan(50); // High-risk usage should lower score
      expect(result.anomalies.length).toBeGreaterThan(0);
    });

    test('should detect unusual IP patterns', () => {
      const clientId = 'test-client';
      const tokenData = {
        scopes: ['banking:read'],
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer'
      };

      // Simulate requests from multiple IPs
      const ips = ['192.168.1.100', '192.168.1.101', '192.168.1.102', '192.168.1.103', '192.168.1.104'];
      
      ips.forEach(ip => {
        monitorTokenUsage(clientId, tokenData, { ip, userAgent: 'Test-Agent/1.0', endpoint: '/api/accounts/my' });
      });

      const result = monitorTokenUsage(clientId, tokenData, { 
        ip: '192.168.1.105', // 6th different IP
        userAgent: 'Test-Agent/1.0', 
        endpoint: '/api/accounts/my' 
      });

      expect(result.anomalies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'unusual_ip_pattern',
            severity: 'warning'
          })
        ])
      );
    });

    test('should detect rapid token usage', () => {
      const clientId = 'test-client';
      const tokenData = {
        scopes: ['banking:read'],
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer'
      };
      const requestInfo = {
        ip: '192.168.1.100',
        userAgent: 'Test-Agent/1.0',
        endpoint: '/api/accounts/my'
      };

      // Simulate rapid token usage
      for (let i = 0; i < 101; i++) { // Above threshold
        monitorTokenUsage(clientId, tokenData, requestInfo);
      }

      const result = monitorTokenUsage(clientId, tokenData, requestInfo);

      expect(result.anomalies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'rapid_token_usage',
            severity: 'warning'
          })
        ])
      );
    });
  });

  describe('Authentication Monitoring', () => {
    test('should monitor successful authentication', () => {
      const authResult = {
        success: true,
        clientId: 'test-client',
        authType: 'oauth',
        scopes: ['banking:read']
      };
      const requestInfo = {
        ip: '192.168.1.100',
        userAgent: 'Test-Agent/1.0'
      };

      const result = monitorAuthentication(authResult, requestInfo);

      expect(result.monitored).toBe(true);
      expect(result.security_score).toBeGreaterThan(0);
      expect(result.anomalies.length).toBe(0);
    });

    test('should monitor failed authentication attempts', () => {
      const clientId = 'test-client';
      const authResult = {
        success: false,
        clientId,
        authType: 'oauth',
        error: 'invalid_credentials'
      };
      const requestInfo = {
        ip: '192.168.1.100',
        userAgent: 'Test-Agent/1.0'
      };

      // Simulate multiple failed attempts
      for (let i = 0; i < 6; i++) { // Above threshold
        monitorAuthentication(authResult, requestInfo);
      }

      const result = monitorAuthentication(authResult, requestInfo);

      expect(result.anomalies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'failed_authentication_attempts',
            severity: 'critical'
          })
        ])
      );
    });

    test('should detect authentication from unusual locations', () => {
      const authResult = {
        success: true,
        clientId: 'test-client',
        authType: 'oauth',
        scopes: ['banking:read']
      };

      // Normal location
      monitorAuthentication(authResult, { ip: '192.168.1.100', userAgent: 'Test-Agent/1.0' });
      
      // Unusual location (different country)
      const result = monitorAuthentication(authResult, { 
        ip: '203.0.113.100', 
        userAgent: 'Test-Agent/1.0' 
      });

      expect(result.anomalies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'unusual_location',
            severity: 'warning'
          })
        ])
      );
    });
  });

  describe('Credential Rotation Monitoring', () => {
    test('should monitor normal credential rotation', () => {
      const clientId = 'test-client';
      const rotationEvent = {
        type: 'client_secret_rotation',
        timestamp: new Date().toISOString(),
        previous_rotation: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        initiated_by: 'system'
      };

      const result = monitorCredentialRotation(clientId, rotationEvent);

      expect(result.monitored).toBe(true);
      expect(result.rotation_score).toBeGreaterThan(0);
      expect(result.recommendations).toBeDefined();
    });

    test('should detect overdue credential rotation', () => {
      const clientId = 'test-client';
      const rotationEvent = {
        type: 'client_secret_rotation',
        timestamp: new Date().toISOString(),
        previous_rotation: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
        initiated_by: 'system'
      };

      const result = monitorCredentialRotation(clientId, rotationEvent);

      expect(result.rotation_score).toBeLessThan(50);
      expect(result.recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            priority: 'high',
            action: expect.stringContaining('rotation')
          })
        ])
      );
    });

    test('should detect frequent credential rotation', () => {
      const clientId = 'test-client';
      
      // Multiple rotations in short period
      for (let i = 0; i < 5; i++) {
        const rotationEvent = {
          type: 'client_secret_rotation',
          timestamp: new Date().toISOString(),
          previous_rotation: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
          initiated_by: 'system'
        };
        monitorCredentialRotation(clientId, rotationEvent);
      }

      const result = monitorCredentialRotation(clientId, {
        type: 'client_secret_rotation',
        timestamp: new Date().toISOString(),
        previous_rotation: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        initiated_by: 'system'
      });

      expect(result.rotation_score).toBeLessThan(70);
      expect(result.recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            priority: 'medium',
            action: expect.stringContaining('frequent')
          })
        ])
      );
    });
  });

  describe('Security Dashboard', () => {
    test('should generate comprehensive security dashboard', () => {
      // Add some test data
      monitorTokenUsage('client1', { scopes: ['banking:read'] }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });
      generateSecurityAlert({
        title: 'Test Alert',
        description: 'Test alert for dashboard',
        severity: 'warning',
        client_id: 'client1'
      });

      const dashboard = getSecurityDashboard();

      expect(dashboard).toHaveProperty('summary');
      expect(dashboard).toHaveProperty('alerts');
      expect(dashboard).toHaveProperty('anomalies');
      expect(dashboard).toHaveProperty('metrics');
      expect(dashboard).toHaveProperty('recommendations');

      expect(dashboard.summary).toHaveProperty('total_alerts');
      expect(dashboard.summary).toHaveProperty('critical_alerts');
      expect(dashboard.summary).toHaveProperty('active_clients');
      expect(dashboard.summary).toHaveProperty('security_score');
    });

    test('should calculate security score accurately', () => {
      // Add good security data
      for (let i = 0; i < 10; i++) {
        monitorTokenUsage(`client${i}`, { scopes: ['banking:read'] }, { ip: '192.168.1.100' });
        monitorAuthentication({ success: true, clientId: `client${i}` }, { ip: '192.168.1.100' });
      }

      const dashboard = getSecurityDashboard();
      expect(dashboard.summary.security_score).toBeGreaterThan(70);
    });

    test('should generate appropriate recommendations', () => {
      // Add security issues
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });

      generateSecurityAlert({
        title: 'Critical Alert',
        description: 'Critical security issue',
        severity: 'critical',
        client_id: 'client1'
      });

      const dashboard = getSecurityDashboard();
      
      expect(dashboard.recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            priority: 'high'
          })
        ])
      );
    });
  });

  describe('Client Security Reports', () => {
    test('should generate client-specific security report', () => {
      const clientId = 'test-client';
      
      // Add client activity
      monitorTokenUsage(clientId, { scopes: ['banking:read'] }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: true, clientId }, { ip: '192.168.1.100' });
      monitorCredentialRotation(clientId, {
        type: 'client_secret_rotation',
        timestamp: new Date().toISOString(),
        previous_rotation: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      });

      const report = getClientSecurityReport(clientId, '7d');

      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('token_usage');
      expect(report).toHaveProperty('authentication');
      expect(report).toHaveProperty('credential_rotation');
      expect(report).toHaveProperty('anomalies');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('period');

      expect(report.summary.client_id).toBe(clientId);
      expect(report.summary.security_score).toBeGreaterThan(0);
    });

    test('should include client behavior analysis', () => {
      const clientId = 'test-client';
      
      // Add diverse activity
      monitorTokenUsage(clientId, { scopes: ['banking:read'] }, { ip: '192.168.1.100' });
      monitorTokenUsage(clientId, { scopes: ['banking:write'] }, { ip: '192.168.1.101' });
      monitorAuthentication({ success: true, clientId }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId }, { ip: '192.168.1.102' });

      const report = getClientSecurityReport(clientId, '7d');

      expect(report.token_usage).toHaveProperty('scopes_used');
      expect(report.token_usage).toHaveProperty('endpoints_accessed');
      expect(report.authentication).toHaveProperty('success_rate');
      expect(report.authentication).toHaveProperty('failed_attempts');
      expect(report.anomalies).toBeInstanceOf(Array);
    });
  });

  describe('Alert Management', () => {
    test('should generate security alerts', () => {
      const alertData = {
        title: 'Test Alert',
        description: 'Test alert description',
        severity: 'warning',
        client_id: 'test-client',
        evidence: { ip: '192.168.1.100', timestamp: new Date().toISOString() }
      };

      const alert = generateSecurityAlert(alertData);

      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('title', alertData.title);
      expect(alert).toHaveProperty('description', alertData.description);
      expect(alert).toHaveProperty('severity', alertData.severity);
      expect(alert).toHaveProperty('client_id', alertData.client_id);
      expect(alert).toHaveProperty('status', 'active');
      expect(alert).toHaveProperty('timestamp');
      expect(alert).toHaveProperty('evidence');
    });

    test('should resolve security alerts', () => {
      // Create an alert
      const alert = generateSecurityAlert({
        title: 'Test Alert',
        description: 'Test alert to resolve',
        severity: 'warning',
        client_id: 'test-client'
      });

      const resolutionData = {
        resolved_by: 'admin-user',
        resolved_at: new Date().toISOString(),
        resolution_note: 'Issue resolved successfully',
        action_taken: 'Contacted client and verified activity'
      };

      const resolvedAlert = resolveAlert(alert.id, resolutionData);

      expect(resolvedAlert).toBeDefined();
      expect(resolvedAlert.status).toBe('resolved');
      expect(resolvedAlert.resolved_by).toBe(resolutionData.resolved_by);
      expect(resolvedAlert.resolution_note).toBe(resolutionData.resolution_note);
      expect(resolvedAlert.action_taken).toBe(resolutionData.action_taken);
    });

    test('should return null for non-existent alert', () => {
      const result = resolveAlert('non-existent-id', {
        resolved_by: 'admin-user',
        resolved_at: new Date().toISOString(),
        resolution_note: 'Test'
      });

      expect(result).toBeNull();
    });
  });

  describe('Anomaly Detection', () => {
    test('should detect various types of anomalies', () => {
      // Add activities that should trigger anomalies
      monitorTokenUsage('client1', { scopes: ['admin:delete'] }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: false, clientId: 'client1' }, { ip: '192.168.1.100' });

      const anomalies = detectAnomalies('24h');

      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: expect.any(String),
            severity: expect.any(String),
            description: expect.any(String),
            evidence: expect.any(Object)
          })
        ])
      );
    });

    test('should filter anomalies by client', () => {
      // Add anomalies for different clients
      monitorTokenUsage('client1', { scopes: ['admin:delete'] }, { ip: '192.168.1.100' });
      monitorTokenUsage('client2', { scopes: ['banking:read'] }, { ip: '192.168.1.101' });

      const client1Anomalies = detectAnomalies('24h', 'client1');
      const client2Anomalies = detectAnomalies('24h', 'client2');

      expect(client1Anomalies.length).toBeGreaterThan(0);
      expect(client2Anomalies.length).toBe(0);
    });

    test('should filter anomalies by type', () => {
      // Add specific type of anomaly
      monitorTokenUsage('client1', { scopes: ['admin:delete'] }, { ip: '192.168.1.100' });

      const scopeAnomalies = detectAnomalies('24h', null, 'scope_usage');
      const authAnomalies = detectAnomalies('24h', null, 'authentication');

      expect(scopeAnomalies.length).toBeGreaterThan(0);
      expect(authAnomalies.length).toBe(0);
    });
  });

  describe('Data Cleanup', () => {
    test('should clean up old security data', () => {
      // Add some test data
      monitorTokenUsage('client1', { scopes: ['banking:read'] }, { ip: '192.168.1.100' });
      generateSecurityAlert({
        title: 'Test Alert',
        description: 'Test alert',
        severity: 'info',
        client_id: 'client1'
      });

      const cleanedCount = cleanupSecurityData('1d');

      expect(cleanedCount).toBeGreaterThanOrEqual(0);
      expect(typeof cleanedCount).toBe('number');
    });

    test('should handle cleanup gracefully with no data', () => {
      const cleanedCount = cleanupSecurityData('1d');
      expect(cleanedCount).toBe(0);
    });
  });

  describe('Security Configuration', () => {
    test('should have proper security configuration', () => {
      expect(SECURITY_CONFIG).toHaveProperty('anomaly_thresholds');
      expect(SECURITY_CONFIG).toHaveProperty('alert_levels');
      expect(SECURITY_CONFIG).toHaveProperty('windows');

      expect(SECURITY_CONFIG.anomaly_thresholds).toHaveProperty('high_risk_token_usage');
      expect(SECURITY_CONFIG.anomaly_thresholds).toHaveProperty('unusual_ip_patterns');
      expect(SECURITY_CONFIG.anomaly_thresholds).toHaveProperty('failed_auth_attempts');

      expect(SECURITY_CONFIG.alert_levels).toHaveProperty('info');
      expect(SECURITY_CONFIG.alert_levels).toHaveProperty('warning');
      expect(SECURITY_CONFIG.alert_levels).toHaveProperty('critical');
      expect(SECURITY_CONFIG.alert_levels).toHaveProperty('emergency');

      expect(SECURITY_CONFIG.windows).toHaveProperty('minute');
      expect(SECURITY_CONFIG.windows).toHaveProperty('hour');
      expect(SECURITY_CONFIG.windows).toHaveProperty('day');
      expect(SECURITY_CONFIG.windows).toHaveProperty('week');
    });

    test('should have reasonable threshold values', () => {
      expect(SECURITY_CONFIG.anomaly_thresholds.failed_auth_attempts).toBeGreaterThan(0);
      expect(SECURITY_CONFIG.anomaly_thresholds.rapid_token_requests).toBeGreaterThan(0);
      expect(SECURITY_CONFIG.anomaly_thresholds.unusual_ip_patterns).toBeGreaterThan(0);

      expect(SECURITY_CONFIG.windows.minute).toBe(60 * 1000);
      expect(SECURITY_CONFIG.windows.hour).toBe(60 * 60 * 1000);
      expect(SECURITY_CONFIG.windows.day).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('Security Metrics', () => {
    test('should track security metrics properly', () => {
      const initialEvents = securityMetrics.total_events;

      // Add activities
      monitorTokenUsage('client1', { scopes: ['banking:read'] }, { ip: '192.168.1.100' });
      monitorAuthentication({ success: true, clientId: 'client1' }, { ip: '192.168.1.100' });
      generateSecurityAlert({
        title: 'Test Alert',
        description: 'Test alert',
        severity: 'warning',
        client_id: 'client1'
      });

      expect(securityMetrics.total_events).toBeGreaterThan(initialEvents);
      expect(securityMetrics.clients_monitored).toBeGreaterThan(0);
    });

    test('should have all required metric fields', () => {
      expect(securityMetrics).toHaveProperty('total_events');
      expect(securityMetrics).toHaveProperty('anomalies_detected');
      expect(securityMetrics).toHaveProperty('alerts_generated');
      expect(securityMetrics).toHaveProperty('clients_monitored');
      expect(securityMetrics).toHaveProperty('last_updated');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing input gracefully', () => {
      expect(() => {
        monitorTokenUsage();
      }).toThrow();

      expect(() => {
        monitorAuthentication();
      }).toThrow();

      expect(() => {
        monitorCredentialRotation();
      }).toThrow();
    });

    test('should handle invalid input types', () => {
      expect(() => {
        monitorTokenUsage('client', 'invalid-token-data', {});
      }).toThrow();

      expect(() => {
        monitorAuthentication('invalid-auth-result', {});
      }).toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle high volume monitoring', () => {
      const startTime = Date.now();
      
      // Simulate high volume
      for (let i = 0; i < 1000; i++) {
        monitorTokenUsage(`client${i % 10}`, { scopes: ['banking:read'] }, { 
          ip: `192.168.1.${i % 255}`, 
          userAgent: 'Test-Agent/1.0' 
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second
      expect(securityMetrics.total_events).toBeGreaterThan(1000);
    });

    test('should maintain performance with many alerts', () => {
      // Generate many alerts
      for (let i = 0; i < 100; i++) {
        generateSecurityAlert({
          title: `Alert ${i}`,
          description: `Test alert ${i}`,
          severity: 'info',
          client_id: `client${i % 10}`
        });
      }

      const startTime = Date.now();
      const dashboard = getSecurityDashboard();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(500); // 0.5 seconds
      expect(dashboard.alerts.length).toBe(100);
    });
  });
});
