/**
 * Enhanced RFC 9728 Content Component
 * Updated educational content with improved technical accuracy and current implementation details
 * 
 * Phase 59-02: Educational Content Review
 * Enhanced RFC 9728 educational component with accurate, comprehensive content
 */

import React from 'react';

// ── Enhanced RFC9728Content ─────────────────────────────────────────────────────────────
export function RFC9728Content() {
  const [metadata, setMetadata]     = React.useState(null);
  const [fetchError, setFetchError] = React.useState(null);
  const [complianceScore, setComplianceScore] = React.useState(null);

  React.useEffect(() => {
    // Fetch live metadata
    fetch('/api/rfc9728/metadata')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(setMetadata)
      .catch((e) => setFetchError(e.message));

    // Fetch compliance score
    fetch('/api/rfc9728/audit/summary')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => setComplianceScore(data.summary.overall_score))
      .catch(() => {
        // Compliance endpoint might not be available, ignore error
      });
  }, []);

  return (
    <>
      <h3>What is RFC 9728?</h3>
      <p>
        <strong>RFC 9728 — OAuth 2.0 Protected Resource Metadata</strong> (published April 2025,
        IETF Standards Track) defines a discovery document that a resource server publishes at a
        well-known URL so OAuth clients and authorization servers can find out:
      </p>
      <ul>
        <li>Which <strong>authorization server(s)</strong> the RS accepts tokens from</li>
        <li>Which <strong>scopes</strong> the RS is willing to disclose</li>
        <li>Which <strong>bearer token methods</strong> the RS supports (header, body, query)</li>
        <li>
          Human-readable metadata such as <code>resource_name</code> and{' '}
          <code>resource_documentation</code>
        </li>
      </ul>

      <h3>Well-known URL Structure</h3>
      <p>
        RFC 9728 defines a deterministic URL pattern for discovering protected resource metadata.
        The endpoint is constructed by inserting <code>/.well-known/oauth-protected-resource</code>{' '}
        between the host and path of the resource identifier.
      </p>
      <pre className="edu-code">{`Resource URL: https://api.bank.com/v1/accounts
Discovery URL: https://api.bank.com/.well-known/oauth-protected-resource

HTTP/1.1 GET /.well-known/oauth-protected-resource
Host: api.bank.com
Accept: application/json`}</pre>

      <h3>Why it matters for AI agents and MCP</h3>
      <p>
        The MCP specification references RFC 9728 for resource server discovery. An AI agent or
        MCP client that encounters a{' '}
        <code>{'401 WWW-Authenticate: Bearer resource_metadata=\u2026'}</code>{' '}
        response can fetch the metadata URL, discover which authorization server to use, and
        bootstrap the OAuth flow without hard-coded configuration. This is critical for
        agentic workflows where the agent may encounter resource servers it has never seen before.
      </p>

      <div
        style={{
          marginBottom: 14,
          padding: '12px 14px',
          background: '#f0fdf4',
          borderRadius: 8,
          border: '1px solid #86efac',
        }}
      >
        <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>Implementation in this monorepo</h4>
        <p style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>
          The metadata endpoint is implemented in{' '}
          <code>banking_api_server/routes/protectedResourceMetadata.js</code> and mounted at both:
        </p>
        <ul style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>
          <li><code>/.well-known/oauth-protected-resource</code> (RFC 9728 compliant)</li>
          <li><code>/api/rfc9728/metadata</code> (same-origin proxy for UI access)</li>
        </ul>
      </div>

      <h3>Response shape (RFC 9728 §3.2)</h3>
      <pre className="edu-code">{`{
  "resource":                 REQUIRED  -- This RS's canonical URL
  "authorization_servers":    OPTIONAL  -- [PingOne issuer URI, ...]
  "scopes_supported":         RECOMMENDED -- ["banking:read", ...]
  "bearer_methods_supported": OPTIONAL  -- ["header"]
  "resource_name":            OPTIONAL  -- Human-readable display name
  "resource_documentation":   OPTIONAL  -- Documentation URL
}`}</pre>

      <h3>Field Requirements and Validation</h3>
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Required Fields</h4>
        <ul style={{ margin: '0 0 12px', fontSize: '0.85rem' }}>
          <li><strong>resource</strong>: The resource identifier being described (must be a valid URI)</li>
        </ul>
        
        <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Recommended Fields</h4>
        <ul style={{ margin: '0 0 12px', fontSize: '0.85rem' }}>
          <li><strong>scopes_supported</strong>: Array of scope strings the RS supports</li>
          <li><strong>authorization_servers</strong>: Array of AS issuer identifiers</li>
        </ul>
        
        <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Optional Fields</h4>
        <ul style={{ margin: '0 0 12px', fontSize: '0.85rem' }}>
          <li><strong>bearer_methods_supported</strong>: Array of methods (header, body, query)</li>
          <li><strong>resource_name</strong>: Human-readable name</li>
          <li><strong>resource_documentation</strong>: URL to documentation</li>
        </ul>
      </div>

      <h3>Security: resource identifier validation (RFC 9728 §3.3)</h3>
      <p>
        Clients <strong>MUST</strong> check that the <code>resource</code> value in the response exactly matches the
        URL they queried. This prevents impersonation attacks where an attacker might publish a fraudulent
        metadata document for a legitimate resource server.
      </p>
      <pre className="edu-code">{`Client validation pseudocode:

if (metadata.resource !== requested_resource_url) {
  throw new Error('Resource identifier mismatch - possible impersonation');
}`}</pre>

      <h3>Live metadata from this BFF</h3>
      {metadata ? (
        <>
          <p>Fetched from <code>/api/rfc9728/metadata</code>:</p>
          <pre className="edu-code">{JSON.stringify(metadata, null, 2)}</pre>
          {complianceScore !== null && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                background: complianceScore >= 90 ? '#f0fdf4' : 
                           complianceScore >= 75 ? '#fffbeb' : '#fef2f2',
                borderRadius: 6,
                border: `1px solid ${
                  complianceScore >= 90 ? '#86efac' : 
                  complianceScore >= 75 ? '#fbbf24' : '#ef4444'
                }`,
              }}
            >
              <strong>RFC 9728 Compliance Score: {complianceScore}%</strong>
              <span style={{ marginLeft: 8, fontSize: '0.85rem' }}>
                ({complianceScore >= 90 ? 'Excellent' : 
                  complianceScore >= 75 ? 'Good' : 
                  complianceScore >= 60 ? 'Fair' : 'Needs Improvement'})
              </span>
            </div>
          )}
        </>
      ) : fetchError ? (
        <p style={{ color: '#b91c1c', fontSize: '0.875rem' }}>
          Could not load live metadata: {fetchError}. Is the BFF running?
        </p>
      ) : (
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Loading live metadata\u2026</p>
      )}

      <h3>Integration with OAuth flows</h3>
      <p>
        RFC 9728 metadata is typically used in these scenarios:
      </p>
      <ul style={{ fontSize: '0.85rem' }}>
        <li><strong>Resource indicator discovery</strong>: Clients discover which AS to use for a resource</li>
        <li><strong>Scope validation</strong>: Clients verify requested scopes are supported</li>
        <li><strong>Dynamic client registration</strong>: Clients configure themselves for new resources</li>
        <li><strong>Multi-resource scenarios</strong>: Clients handle multiple resource servers</li>
      </ul>

      <h3>MCP and AI Agent Integration</h3>
      <p>
        In the Model Context Protocol (MCP) ecosystem, RFC 9728 enables:
      </p>
      <ul style={{ fontSize: '0.85rem' }}>
        <li><strong>Automatic resource discovery</strong>: MCP servers can discover OAuth requirements</li>
        <li><strong>Dynamic token audience</strong>: Agents can determine correct audience for token exchange</li>
        <li><strong>Scope negotiation</strong>: Clients can request appropriate scopes for MCP tools</li>
        <li><strong>Federated authorization</strong>: Support for multi-AS environments</li>
      </ul>

      <h3>Implementation Best Practices</h3>
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Security Considerations</h4>
        <ul style={{ margin: '0 0 12px', fontSize: '0.85rem' }}>
          <li>Always validate <code>resource</code> field matches requested URL</li>
          <li>Use HTTPS in production environments</li>
          <li>Set appropriate caching headers (metadata changes infrequently)</li>
          <li>Never include sensitive data in metadata</li>
        </ul>
        
        <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Performance Optimization</h4>
        <ul style={{ margin: '0 0 12px', fontSize: '0.85rem' }}>
          <li>Cache responses with appropriate <code>Cache-Control</code> headers</li>
          <li>Consider CDN distribution for high-traffic endpoints</li>
          <li>Minimize metadata size while maintaining completeness</li>
          <li>Monitor for abuse and implement rate limiting if needed</li>
        </ul>
      </div>

      <h3>Testing and Validation</h3>
      <p>
        This implementation includes comprehensive testing and validation:
      </p>
      <ul style={{ fontSize: '0.85rem' }}>
        <li>Automated compliance audit via <code>/api/rfc9728/audit/compliance</code></li>
        <li>Field validation against RFC 9728 specification requirements</li>
        <li>Security testing for resource identifier validation</li>
        <li>Performance monitoring and caching validation</li>
      </ul>

      <div
        style={{
          marginTop: 16,
          padding: '12px 14px',
          background: '#eff6ff',
          borderRadius: 8,
          border: '1px solid var(--chase-navy)',
        }}
      >
        <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>Current Implementation Status</h4>
        <p style={{ margin: '0', fontSize: '0.85rem' }}>
          This BFF implements RFC 9728 with full compliance including all required fields,
          recommended fields, and optional fields. The endpoint is accessible at both the
          standard well-known URL and a same-origin proxy for UI integration.
        </p>
      </div>
    </>
  );
}
