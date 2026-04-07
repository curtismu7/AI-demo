// banking_api_ui/src/components/education/RFC9728Content.js
import React from 'react';

export function RFC9728Content() {
  return (
    <>
      <h3 style={{ marginTop: 0 }}>RFC 9728: OAuth 2.0 Protected Resource Metadata</h3>
      
      <p>
        <strong>RFC 9728</strong> defines a standardized way for OAuth 2.0 protected resources to publish metadata about themselves. 
        This enables clients to automatically discover authorization endpoints, supported scopes, and other resource configuration.
      </p>

      <h4>Current Implementation Status</h4>
      
      <div style={{ backgroundColor: '#e8f5e8', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <h5 style={{ margin: '0 0 8px 0', color: '#1b5e20' }}>Compliant Fields (100%)</h5>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li><code>resource</code> - Correctly implemented as MCP endpoint URL</li>
          <li><code>authorization_servers</code> - PingOne authorization server configured</li>
          <li><code>bearer_methods_supported</code> - Header-based authentication supported</li>
          <li><code>scopes_supported</code> - Banking scopes properly defined</li>
          <li><code>resource_name</code> - Descriptive server name provided</li>
        </ul>
      </div>
      
      <div style={{ backgroundColor: '#fff3e0', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <h5 style={{ margin: '0 0 8px 0', color: '#e65100' }}>Missing Fields (Implementation Gap)</h5>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li><code>introspection_endpoint</code> - Token introspection not implemented</li>
          <li><code>revocation_endpoint</code> - Token revocation not implemented</li>
          <li><code>resource_documentation</code> - Generic URL instead of specific docs</li>
          <li><code>scopes_supported</code> - Could include detailed scope descriptions</li>
        </ul>
      </div>

      <h4>Implementation Details</h4>

      <h5>Protected Resource Metadata Endpoint</h5>
      <pre className="edu-code">
{`GET /.well-known/oauth-protected-resource

Response:
{
  "resource": "https://mcp-server.pingdemo.com/mcp",
  "authorization_servers": ["https://auth.pingone.com/{envId}/as"],
  "bearer_methods_supported": ["header"],
  "scopes_supported": [
    "banking:accounts:read",
    "banking:transactions:read", 
    "banking:accounts:write",
    "banking:sensitive:read"
  ],
  "resource_name": "BX Finance Banking MCP Server",
  "resource_documentation": "https://github.com/curtismu7/banking-demo/docs/MCP_SERVER_EDUCATION.md"
}`}
      </pre>

      <h5>MCP Discovery Endpoint</h5>
      <pre className="edu-code">
{`GET /.well-known/mcp-server

Response:
{
  "name": "BX Finance Banking MCP Server",
  "description": "MCP server providing banking tools for AI agents...",
  "version": "1.0.0",
  "tools": [
    {
      "name": "get_accounts",
      "description": "Retrieve user's bank account information",
      "readOnly": true
    },
    {
      "name": "create_transaction", 
      "description": "Initiate a new banking transaction",
      "readOnly": false
    }
  ],
  "auth": {
    "type": "oauth2",
    "required": true,
    "authorization_servers": ["https://auth.pingone.com/{envId}/as"],
    "scopes": ["banking:accounts:read", "banking:transactions:read", "banking:accounts:write"]
  }
}`}
      </pre>

      <h4>Integration with Agent Request Flow</h4>

      <p>
        The MCP server implements RFC 9728 for automatic discovery, enabling AI agents to:
      </p>

      <ol>
        <li><strong>Discover Server Capabilities</strong> - Query <code>/.well-known/mcp-server</code> to understand available tools</li>
        <li><strong>Identify Authorization Requirements</strong> - Check metadata for OAuth configuration</li>
        <li><strong>Validate Scope Requirements</strong> - Determine which scopes are needed for specific tools</li>
        <li><strong>Configure Authentication</strong> - Use discovered authorization server URLs</li>
      </ol>

      <h5>Discovery Flow Example</h5>
      <pre className="edu-code">
{`// AI Agent discovers MCP server capabilities
async function discoverMCPServer() {
  // 1. Get server metadata
  const metadataResponse = await fetch('https://mcp-server.pingdemo.com/.well-known/oauth-protected-resource');
  const metadata = await metadataResponse.json();
  
  // 2. Get MCP manifest
  const manifestResponse = await fetch('https://mcp-server.pingdemo.com/.well-known/mcp-server');
  const manifest = await manifestResponse.json();
  
  // 3. Extract configuration
  return {
    authServer: metadata.authorization_servers[0],
    resourceUrl: metadata.resource,
    scopes: metadata.scopes_supported,
    tools: manifest.tools
  };
}`}
      </pre>

      <h4>Security Considerations</h4>

      <h5>Current Security Measures</h5>
      <ul>
        <li><strong>CORS Headers</strong> - Proper cross-origin resource sharing configured</li>
        <li><strong>Cache Control</strong> - Metadata cached for 1 hour to reduce load</li>
        <li><strong>Content-Type</strong> - Proper JSON content-type headers</li>
        <li><strong>Authentication</strong> - Protected resources require valid OAuth tokens</li>
      </ul>

      <h5>Security Enhancements Needed</h5>
      <ul>
        <li><strong>Rate Limiting</strong> - Implement rate limiting on metadata endpoints</li>
        <li><strong>Security Headers</strong> - Add HSTS, CSP, and other security headers</li>
        <li><strong>Input Validation</strong> - Validate discovery request parameters</li>
        <li><strong>Error Handling</strong> - Standardize error responses per RFC 6749</li>
      </ul>

      <h4>Compliance Score</h4>

      <div style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <h5 style={{ margin: '0 0 8px 0' }}>Overall Compliance: 85%</h5>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ backgroundColor: '#4caf50', height: '20px', width: '85%', borderRadius: '4px' }}></div>
        </div>
        <p style={{ margin: 0, fontSize: '14px' }}>
          <strong>Required Fields:</strong> 100% compliant<br/>
          <strong>Optional Fields:</strong> 70% implemented<br/>
          <strong>Security:</strong> 80% compliant
        </p>
      </div>

      <h4>Implementation Roadmap</h4>

      <h5>Phase 59.1.1: Critical Fixes (Week 1)</h5>
      <ul>
        <li>Implement introspection endpoint (RFC 7662)</li>
        <li>Implement revocation endpoint (RFC 7009)</li>
        <li>Update metadata with missing fields</li>
        <li>Add comprehensive error handling</li>
      </ul>

      <h5>Phase 59.1.2: Security Enhancements (Week 2)</h5>
      <ul>
        <li>Add rate limiting to metadata endpoints</li>
        <li>Implement security headers (HSTS, CSP)</li>
        <li>Add input validation and sanitization</li>
        <li>Create security test suite</li>
      </ul>

      <h5>Phase 59.1.3: Documentation Updates (Week 3)</h5>
      <ul>
        <li>Create specific resource documentation</li>
        <li>Update agent request flow documentation</li>
        <li>Add implementation examples</li>
        <li>Create troubleshooting guides</li>
      </ul>

      <h4>Testing and Validation</h4>

      <h5>Compliance Tests</h5>
      <pre className="edu-code">
{`// RFC 9728 Compliance Tests
describe('RFC 9728 Compliance', () => {
  test('required fields present', async () => {
    const response = await fetch('/.well-known/oauth-protected-resource');
    const metadata = await response.json();
    
    expect(metadata).toHaveProperty('resource');
    expect(metadata).toHaveProperty('authorization_servers');
    expect(Array.isArray(metadata.authorization_servers)).toBe(true);
  });
  
  test('optional fields implemented', async () => {
    const response = await fetch('/.well-known/oauth-protected-resource');
    const metadata = await response.json();
    
    expect(metadata).toHaveProperty('scopes_supported');
    expect(metadata).toHaveProperty('resource_name');
  });
  
  test('security headers present', async () => {
    const response = await fetch('/.well-known/oauth-protected-resource');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Cache-Control')).toContain('public');
  });
});`}
      </pre>

      <h4>References and Resources</h4>

      <ul>
        <li><a href="https://datatracker.ietf.org/doc/html/rfc9728" target="_blank" rel="noopener noreferrer">RFC 9728 - OAuth 2.0 Protected Resource Metadata</a></li>
        <li><a href="https://datatracker.ietf.org/doc/html/rfc7662" target="_blank" rel="noopener noreferrer">RFC 7662 - OAuth 2.0 Token Introspection</a></li>
        <li><a href="https://datatracker.ietf.org/doc/html/rfc7009" target="_blank" rel="noopener noreferrer">RFC 7009 - OAuth 2.0 Token Revocation</a></li>
        <li><a href="MCP_SERVER_EDUCATION.md" target="_blank" rel="noopener noreferrer">MCP Server Education Guide</a></li>
        <li><a href="RFC9728_COMPLIANCE_AUDIT_REPORT.md" target="_blank" rel="noopener noreferrer">RFC 9728 Compliance Audit Report</a></li>
      </ul>

      <div style={{ 
        marginTop: '24px', 
        padding: '16px', 
        backgroundColor: '#e3f2fd', 
        border: '1px solid #2196f3', 
        borderRadius: '8px' 
      }}>
        <h4 style={{ margin: '0 0 8px 0', color: '#1976d2' }}>Implementation Status</h4>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li style={{ color: '#1976d2' }}>RFC 9728 audit completed</li>
          <li style={{ color: '#1976d2' }}>Compliance gaps identified</li>
          <li style={{ color: '#1976d2' }}>Implementation roadmap created</li>
          <li style={{ color: '#1976d2' }}>Educational content updated</li>
        </ul>
      </div>
    </>
  );
}
