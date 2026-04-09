// banking_api_ui/src/components/education/RFC8707Content.js
import React from 'react';

export function RFC8707Content() {
  return (
    <>
      <h3 style={{ marginTop: 0 }}>RFC 8707: OAuth 2.0 Resource Indicators</h3>
      
      <p>
        <strong>RFC 8707</strong> defines OAuth 2.0 Resource Indicators (RI), which allow clients to request 
        access tokens scoped to specific resource servers. This enhances security by ensuring tokens can 
        only be used with their intended audience and prevents token replay attacks across different services.
      </p>

      <h4>What are Resource Indicators?</h4>
      <p>
        Resource Indicators are URIs that identify the specific resource server a token is intended for. 
        They are sent in the authorization request as the <code>resource</code> parameter.
      </p>

      <h4>Key Benefits</h4>
      <ul>
        <li><strong>Audience Restriction</strong> - Tokens are scoped to specific resource servers</li>
        <li><strong>Security</strong> - Prevents token replay across different services</li>
        <li><strong>Compliance</strong> - Required for enterprise OAuth implementations</li>
        <li><strong>Granular Control</strong> - Fine-grained access control per resource</li>
      </ul>

      <h4>RFC 8707 in Super Banking</h4>
      <p>
        The Super Banking demo implements RFC 8707 across multiple resource servers:
      </p>

      <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <pre style={{ margin: 0, fontSize: '14px', fontFamily: 'monospace' }}>
{`Resource Servers (Audiences):
- https://ai-agent.pingdemo.com     - AI Agent Service
- https://mcp-server.pingdemo.com  - MCP Server  
- https://agent-gateway.pingdemo.com - Agent Gateway
- https://resource-server.pingdemo.com - Banking API Resources
- https://api.pingone.com           - PingOne Management API`}
        </pre>
      </div>

      <h4>Authorization Request with Resource Indicator</h4>
      <pre className="edu-code">
{`GET /{envId}/as/authorize?
  response_type=code&
  client_id={client_id}&
  redirect_uri={redirect_uri}&
  scope=profile%20email%20banking:agent:invoke&
  resource=https://ai-agent.pingdemo.com&
  state={state}&
  code_challenge={code_challenge}&
  code_challenge_method=S256`}
      </pre>

      <h4>Token Response with Audience</h4>
      <pre className="edu-code">
{`{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "profile email banking:agent:invoke",
  "aud": ["https://ai-agent.pingdemo.com"]
}`}
      </pre>

      <h4>Resource Indicator Flow</h4>
      <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <pre style={{ margin: 0, fontSize: '14px', fontFamily: 'monospace' }}>
{`    User/Client
        |
        | 1. Authorization Request
        |    resource=https://ai-agent.pingdemo.com
        v
    PingOne Authorization Server
        |
        | 2. Validate Resource Indicator
        |    - Check resource exists
        |    - Verify client has permission
        |    - Determine allowed scopes
        v
    PingOne Authorization Server
        |
        | 3. Issue Access Token
        |    aud: ["https://ai-agent.pingdemo.com"]
        |    scope: "profile email banking:agent:invoke"
        v
    Client Receives Token
        |
        | 4. Token Validation
        |    AI Agent Service validates aud
        v
    Resource Server (AI Agent)
        |
        | 5. Accept/Reject Token
        |    aud matches? -> Accept
        |    aud mismatch? -> Reject
        v
    API Access Granted/Denied`}
        </pre>
      </div>

      <h4>Security Benefits</h4>

      <h5>1. Audience Enforcement</h5>
      <p>Tokens can only be used by their intended resource server:</p>
      <pre className="edu-code">
{`// AI Agent Service Validation
function validateToken(token) {
  const decoded = jwt.decode(token);
  
  // Verify audience matches this service
  if (!decoded.aud.includes('https://ai-agent.pingdemo.com')) {
    throw new Error('Token audience mismatch');
  }
  
  // Token is valid for this service
  return true;
}`}
      </pre>

      <h5>2. Cross-Service Protection</h5>
      <p>A token intended for the AI Agent cannot be used with the MCP Server:</p>
      <pre className="edu-code">
{`// This will fail - wrong audience
fetch('https://mcp-server.pingdemo.com/tools', {
  headers: {
    'Authorization': 'Bearer ' + aiAgentToken // aud: ai-agent.pingdemo.com
  }
}); // Returns 401 Unauthorized`}
      </pre>

      <h5>3. Token Replay Prevention</h5>
      <p>Resource indicators prevent token replay attacks across different services:</p>
      <pre className="edu-code">
{`// Attacker cannot replay token to different service
const stolenToken = getStolenToken(); // aud: ai-agent.pingdemo.com

// Cannot use with MCP Server
const response = fetch('https://mcp-server.pingdemo.com/api', {
  headers: { 'Authorization': \`Bearer \${stolenToken}\` }
}); // Rejected - audience mismatch`}
      </pre>

      <h4>Best Practices</h4>

      <h5>1. Unique Audiences</h5>
      <p>Each resource server should have a unique audience URI:</p>
      <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <pre style={{ margin: 0, fontSize: '14px', fontFamily: 'monospace' }}>
{`Good:
- https://ai-agent.pingdemo.com
- https://mcp-server.pingdemo.com
- https://api.pingone.com

Bad:
- https://api.pingdemo.com (too generic)
- https://pingdemo.com (too broad)`}
        </pre>
      </div>

      <h5>2. Scope Separation</h5>
      <p>Different resource servers should have distinct scopes:</p>
      <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <pre style={{ margin: 0, fontSize: '14px', fontFamily: 'monospace' }}>
{`AI Agent Service: banking:agent:invoke
MCP Server: banking:accounts:read, banking:transactions:read/write
PingOne API: p1:read:user, p1:update:user`}
        </pre>
      </div>

      <h5>3. Resource Validation</h5>
      <p>Always validate the <code>aud</code> claim in resource servers:</p>
      <pre className="edu-code">
{`// Middleware example
app.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = jwt.decode(token);
  
  if (!decoded.aud.includes(process.env.RESOURCE_AUDIENCE)) {
    return res.status(401).json({ error: 'Invalid token audience' });
  }
  
  next();
});`}
      </pre>

      <h4>Integration with Token Exchange</h4>
      <p>
        RFC 8707 works seamlessly with RFC 8693 Token Exchange:
      </p>

      <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <pre style={{ margin: 0, fontSize: '14px', fontFamily: 'monospace' }}>
{`Subject Token (aud: ai-agent.pingdemo.com)
    |
    | Token Exchange
    v
MCP Token (aud: mcp-server.pingdemo.com)
    |
    | Token Exchange  
    v
API Token (aud: api.pingone.com)`}
        </pre>
      </div>

      <p>Each exchange produces a token with a new audience specific to the target resource server.</p>

      <h4>Implementation in Super Banking</h4>

      <h5>Resource Server Configuration</h5>
      <p>Key resource servers in the Super Banking demo:</p>

      <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <pre style={{ margin: 0, fontSize: '14px', fontFamily: 'monospace' }}>
{`AI Agent Service:
- Audience: https://ai-agent.pingdemo.com
- Scopes: banking:agent:invoke
- Purpose: AI Agent service validation

MCP Server:
- Audience: https://mcp-server.pingdemo.com  
- Scopes: banking:accounts:read, banking:transactions:read/write
- Purpose: MCP tool access validation

Agent Gateway:
- Audience: https://agent-gateway.pingdemo.com
- Scopes: agent:invoke
- Purpose: Banking app actor token validation`}
        </pre>
      </div>

      <h5>Client Configuration</h5>
      <p>Applications must be granted permission to request scopes from specific resources:</p>

      <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <pre style={{ margin: 0, fontSize: '14px', fontFamily: 'monospace' }}>
{`Super Banking User App:
- Allowed Resources: Super Banking AI Agent Service
- Allowed Scopes: profile, email, banking:agent:invoke

Super Banking Admin App:
- Allowed Resources: Super Banking MCP Server
- Allowed Scopes: banking:accounts:read, banking:transactions:read/write`}
        </pre>
      </div>

      <h4>Common Issues and Solutions</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
        <thead>
          <tr style={{ backgroundColor: '#e2e8f0' }}>
            <th style={{ padding: '12px', border: '1px solid #cbd5e0', textAlign: 'left' }}>Issue</th>
            <th style={{ padding: '12px', border: '1px solid #cbd5e0', textAlign: 'left' }}>Cause</th>
            <th style={{ padding: '12px', border: '1px solid #cbd5e0', textAlign: 'left' }}>Solution</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>invalid_request</td>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>Invalid resource URI</td>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>Verify resource exists and URI is correct</td>
          </tr>
          <tr>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>invalid_scope</td>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>Scope not allowed for resource</td>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>Check application resource permissions</td>
          </tr>
          <tr>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>access_denied</td>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>Client not allowed for resource</td>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>Grant resource access to application</td>
          </tr>
          <tr>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>Token rejected</td>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>Audience mismatch</td>
            <td style={{ padding: '12px', border: '1px solid #cbd5e0' }}>Verify resource server audience configuration</td>
          </tr>
        </tbody>
      </table>

      <h4>References</h4>
      <ul>
        <li><a href="https://datatracker.ietf.org/doc/html/rfc8707" target="_blank" rel="noopener noreferrer">RFC 8707 - OAuth 2.0 Resource Indicators</a></li>
        <li><a href="https://datatracker.ietf.org/doc/html/rfc6819" target="_blank" rel="noopener noreferrer">OAuth 2.0 Security Best Current Practice</a></li>
        <li><a href="PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md" target="_blank" rel="noopener noreferrer">Super Banking Token Exchange Guide</a></li>
        <li><a href="PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md" target="_blank" rel="noopener noreferrer">Super Banking 2-Exchange Pattern</a></li>
      </ul>

      <div style={{ 
        marginTop: '24px', 
        padding: '16px', 
        backgroundColor: '#dbeafe', 
        border: '1px solid #93c5fd', 
        borderRadius: '8px' 
      }}>
        <h4 style={{ margin: '0 0 8px 0', color: 'var(--chase-navy)' }}>Implementation Status</h4>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li style={{ color: 'var(--chase-navy)' }}>Resource servers created in PingOne</li>
          <li style={{ color: 'var(--chase-navy)' }}>Applications configured with resource permissions</li>
          <li style={{ color: 'var(--chase-navy)' }}>Client code updated with resource parameters</li>
          <li style={{ color: 'var(--chase-navy)' }}>Resource server validation implemented</li>
          <li style={{ color: 'var(--chase-navy)' }}>Testing and monitoring in place</li>
        </ul>
      </div>
    </>
  );
}
