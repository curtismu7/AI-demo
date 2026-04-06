// banking_api_ui/src/components/education/TokenChainEducationPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';

function OverviewTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>What is a token chain?</h3>
      <p>
        A <strong>token chain</strong> tracks the lineage of OAuth tokens as they flow through
        the system — from initial login through delegation exchanges to final MCP tool calls.
        Each step in the chain records who the token belongs to, who is acting on their behalf,
        and what scopes were granted.
      </p>

      <h4>Why it matters</h4>
      <ul>
        <li><strong>Auditability</strong> — trace every action back to the original user and the delegated agent</li>
        <li><strong>Least privilege</strong> — each exchange can narrow scopes (never widen)</li>
        <li><strong>Delegation transparency</strong> — the <code>act</code> claim shows exactly who acted on behalf of whom</li>
        <li><strong>Debugging</strong> — see where in the chain a token was rejected or expired</li>
      </ul>

      <h4>Token chain lifecycle</h4>
      <pre className="edu-code">{`1. User Login (Authorization Code + PKCE)
   → access_token (sub=user, scopes=banking:read,write,transfer)
   → refresh_token
   → id_token (nonce verified)

2. Token Exchange — RFC 8693
   → exchanged_token (sub=user, act={client_id: bff}, audience=mcp_server)
   → Scopes narrowed to what MCP server needs

3. MCP Tool Call
   → MCP server introspects exchanged_token
   → Validates scopes match requested tool
   → Executes tool on behalf of user`}</pre>

      <h4>Key components tracked</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '6px' }}>Field</th>
            <th style={{ padding: '6px' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['tokenType', 'user_token, agent_token, or exchanged_token'],
            ['sub', 'Subject — the user the token represents'],
            ['act.client_id', 'Actor — the client acting on behalf of the user'],
            ['aud', 'Audience — the intended recipient of the token'],
            ['scopes', 'Granted permissions, narrowed at each exchange'],
            ['iss', 'Issuer — PingOne authorization server'],
            ['exp', 'Expiration timestamp'],
          ].map(([field, desc], i) => (
            <tr key={field} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#f9fafb' : 'white' }}>
              <td style={{ padding: '6px', fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>{field}</td>
              <td style={{ padding: '6px' }}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JwtClaimsTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>JWT claims in token exchange</h3>

      <h4>The <code>sub</code> claim — Subject</h4>
      <p>
        Always identifies the <strong>end user</strong>. In a delegated token, <code>sub</code> stays
        the same through every exchange — it's always the human who originally authenticated.
      </p>
      <pre className="edu-code">{`// User's original token
{
  "sub": "a1b2c3d4-user-uuid",
  "name": "Jane Smith",
  "email": "jane@example.com"
}

// After token exchange — sub unchanged
{
  "sub": "a1b2c3d4-user-uuid",  // same user
  "act": { "client_id": "bff-admin-app" }
}`}</pre>

      <h4>The <code>act</code> claim — Actor</h4>
      <p>
        Added by token exchange (RFC 8693). Identifies <strong>who is acting on behalf of</strong> the
        subject. In this demo, the BFF or AI agent acts on behalf of the user.
      </p>
      <pre className="edu-code">{`// 1-exchange: BFF acts directly
{
  "sub": "user-uuid",
  "act": {
    "client_id": "admin-oidc-app-id"
  }
}

// 2-exchange: Agent acts, then BFF acts on agent's behalf
{
  "sub": "user-uuid",
  "act": {
    "client_id": "bff-admin-app-id",
    "act": {
      "client_id": "ai-agent-app-id"
    }
  }
}`}</pre>

      <h4>The <code>may_act</code> claim — Permission to delegate</h4>
      <p>
        Present in the <strong>subject token</strong> (the user's original token). It tells the
        authorization server which clients are allowed to exchange this token.
      </p>
      <pre className="edu-code">{`// User's token with may_act
{
  "sub": "user-uuid",
  "may_act": {
    "client_id": "admin-oidc-app-id"
  }
}
// Only admin-oidc-app-id can exchange this token
// Any other client_id attempting exchange → "invalid_request"`}</pre>

      <h4>The <code>aud</code> claim — Audience</h4>
      <p>
        Specifies who the token is <strong>intended for</strong>. Each exchange can target a different
        audience (e.g., from the BFF's audience to the MCP server's audience).
      </p>
      <pre className="edu-code">{`// Step 1: User token audience = BFF
{ "aud": "banking_api_enduser" }

// Step 2: Exchanged token audience = MCP server
{ "aud": "https://mcp.pingdemo.com" }`}</pre>
    </div>
  );
}

function ExchangePathsTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Exchange paths</h3>

      <h4>Path 1: Direct exchange (1-exchange)</h4>
      <p>The BFF exchanges the user's token directly for an MCP-scoped token.</p>
      <pre className="edu-code">{`User Login
    │
    ▼
┌──────────────────┐
│ T1: User Token    │  sub=user, aud=bff
│ may_act: {        │
│   client_id: bff  │
│ }                 │
└────────┬─────────┘
         │ POST /as/token
         │ grant_type=token-exchange
         │ subject_token=T1
         │ audience=mcp_server
         ▼
┌──────────────────┐
│ T2: Delegated     │  sub=user, act={client_id:bff}
│ Token             │  aud=mcp_server
│                   │  scopes=banking:read
└────────┬─────────┘
         │
         ▼
    MCP tools/call`}</pre>

      <h4>Path 2: Two-token exchange (2-exchange)</h4>
      <p>
        The AI agent first gets its own token (client_credentials), then the BFF
        exchanges both the user token and agent token for a delegated token.
      </p>
      <pre className="edu-code">{`User Login              Agent Bootstrap
    │                        │
    ▼                        ▼
┌──────────────┐    ┌──────────────┐
│ T1: User     │    │ T0: Agent    │
│ Token        │    │ Token        │
│ sub=user     │    │ sub=agent    │
│ may_act:     │    │ (client_cred)│
│  {client_id: │    └──────┬───────┘
│   agent}     │           │
└──────┬───────┘           │
       │                   │
       └───────┬───────────┘
               │ POST /as/token
               │ subject_token=T1
               │ actor_token=T0
               ▼
      ┌──────────────────┐
      │ T2: Delegated     │  sub=user
      │ Token             │  act={client_id:bff,
      │                   │       act:{client_id:agent}}
      └────────┬─────────┘
               │
               ▼
         MCP tools/call`}</pre>

      <h4>Scope narrowing</h4>
      <p>
        Each exchange can request fewer scopes than the original token. The authorization
        server will never grant more scopes than the subject token has.
      </p>
      <pre className="edu-code">{`T1 scopes: banking:read banking:write banking:transfer banking:admin
                    ↓ exchange requests only banking:read
T2 scopes: banking:read
// T2 can only read — even though T1 could write and transfer`}</pre>
    </div>
  );
}

function ExamplesTab() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Real token chain examples</h3>

      <h4>Example 1: Check balance via AI agent</h4>
      <pre className="edu-code">{`Step 1: User logs in as "bankuser"
  Event: user_login
  Token: access_token (sub=abc123, scopes=openid banking:read banking:write)

Step 2: User asks agent "What's my balance?"
  Event: agent_request
  Tool: get_balance

Step 3: BFF exchanges user token for MCP token
  Event: token_exchange
  Input:  T1 (sub=abc123, may_act={client_id:bff})
  Output: T2 (sub=abc123, act={client_id:bff}, aud=mcp_server)
  Scopes: banking:read (narrowed from banking:read,write)

Step 4: MCP server validates and executes
  Event: tool_call
  Tool: get_balance
  Result: { checking: $5,230.00, savings: $12,500.00 }`}</pre>

      <h4>Example 2: Transfer with step-up MFA</h4>
      <pre className="edu-code">{`Step 1: User requests "Transfer $500 to savings"
  Event: agent_request
  Tool: transfer_funds
  Amount: $500 (exceeds step-up threshold of $250)

Step 2: Step-up MFA triggered
  Event: mfa_challenge
  Method: email OTP
  ACR: urn:pingone:mfa

Step 3: User completes MFA
  Event: mfa_complete
  Result: success

Step 4: BFF exchanges with elevated token
  Event: token_exchange
  Scopes: banking:transfer (requires step-up)

Step 5: Transfer executed
  Event: tool_call
  Tool: transfer_funds
  Result: { success: true, newBalance: $4,730.00 }`}</pre>

      <h4>Token chain visualization</h4>
      <p>
        The <strong>Token Chain Display</strong> in the Agent Flow Diagram panel shows these events
        in real time as they happen. Each event is color-coded by type:
      </p>
      <ul>
        <li><span style={{ color: '#2563eb', fontWeight: 600 }}>●</span> <strong>user_token</strong> — initial login token</li>
        <li><span style={{ color: '#7c3aed', fontWeight: 600 }}>●</span> <strong>agent_token</strong> — agent's client_credentials token (2-exchange only)</li>
        <li><span style={{ color: '#059669', fontWeight: 600 }}>●</span> <strong>exchanged_token</strong> — delegated token after RFC 8693 exchange</li>
        <li><span style={{ color: '#dc2626', fontWeight: 600 }}>●</span> <strong>error</strong> — exchange failure (invalid scope, expired token, etc.)</li>
      </ul>
    </div>
  );
}

export default function TokenChainEducationPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    { id: 'overview', label: 'Overview', content: <OverviewTab /> },
    { id: 'jwt-claims', label: 'JWT Claims', content: <JwtClaimsTab /> },
    { id: 'exchange-paths', label: 'Exchange Paths', content: <ExchangePathsTab /> },
    { id: 'examples', label: 'Examples', content: <ExamplesTab /> },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Token Chain — Delegation Tracking"
      tabs={tabs}
      initialTabId={initialTabId}
      width="min(680px, 100vw)"
    />
  );
}
