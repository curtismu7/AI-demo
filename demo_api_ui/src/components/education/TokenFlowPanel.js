// banking_api_ui/src/components/education/TokenFlowPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';
import TokenExchangeDiagram from './TokenExchangeDiagram';

export default function TokenFlowPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'diagram',
      label: 'Diagram',
      content: (
        <>
          <h3 style={{ marginTop: 0 }}>2-Token Exchange Flow — Visual</h3>
          <p style={{ color: '#374151', fontSize: '0.85rem', marginBottom: 12 }}>
            End-to-end token journey from user login through two RFC 8693 exchanges to the final MCP tool call.
          </p>
          <TokenExchangeDiagram />
        </>
      ),
    },
    {
      id: 'overview',
      label: 'Overview',
      content: (
        <>
          <h3>2-Token Exchange Flow</h3>
          <p>
            BX Finance uses a <strong>two-step RFC 8693 token exchange chain</strong> to safely
            delegate a user's banking authority to an AI agent and then to an MCP server tool —
            without ever exposing the user's original access token outside the BFF.
          </p>

          <h4>Why Two Exchanges?</h4>
          <p>
            Each exchange crosses a security boundary and narrows both the audience and the scopes:
          </p>
          <ol>
            <li>
              <strong>Exchange #1 — User → AI Agent:</strong> The BFF proves the AI agent is
              authorised to act for the user. PingOne issues an intermediate token bound to the
              AI Agent audience with an <code>act</code> claim recording the delegation.
            </li>
            <li>
              <strong>Exchange #2 — Agent Token → MCP Tool:</strong> The BFF proves the MCP
              exchanger is authorised to call the specific tool. PingOne issues a final token
              scoped to exactly the one tool's permission, with a nested <code>act</code> chain.
            </li>
          </ol>

          <p style={{ color: "#374151", marginBottom: "1rem" }}>
            In multi-service deployments, this pattern extends naturally — a separate exchange produces a token scoped to each backend service, with its own <code className="edu-code">aud</code> and minimal <code className="edu-code">scope</code>. Each service sees only the token meant for it.
          </p>

          <h4>End-to-end Guarantees</h4>
          <ul>
            <li><strong>Identity preservation:</strong> <code>sub</code> = user's ID throughout all tokens</li>
            <li><strong>Delegation audit:</strong> <code>act</code> chain records every actor in order</li>
            <li><strong>Scope narrowing:</strong> Final token carries only the tool's required scope</li>
            <li><strong>Audience isolation:</strong> Each token is only valid at its intended endpoint</li>
            <li><strong>Token containment:</strong> Raw access tokens stay server-side; only decoded claims reach the UI</li>
          </ul>

          <div style={{ background: '#1e293b', borderRadius: 8, padding: '16px 20px', marginTop: 16 }}>
            <code style={{ color: '#374151', fontSize: 12 }}>
              User AT → [Exchange #1: AI Agent actor] → Intermediate Token<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ [Exchange #2: MCP Exchanger actor] → Final MCP Token → MCP Server
            </code>
          </div>
        </>
      ),
    },
    {
      id: 'token-inventory',
      label: 'Token Inventory',
      content: (
        <>
          <h3>All Tokens in the Flow</h3>
          <p>Six distinct tokens are created. Only the final MCP Token leaves the BFF as a Bearer value.</p>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1e293b', color: '#cbd5e1' }}>
                <th style={{ padding: '10px', border: '1px solid #334155', textAlign: 'left' }}>#</th>
                <th style={{ padding: '10px', border: '1px solid #334155', textAlign: 'left' }}>Token</th>
                <th style={{ padding: '10px', border: '1px solid #334155', textAlign: 'left' }}>aud</th>
                <th style={{ padding: '10px', border: '1px solid #334155', textAlign: 'left' }}>Used for</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['1', 'User Access Token', 'ai-agent.pingdemo.com', 'Subject token for Exchange #1'],
                ['2', 'User ID Token', '(BFF client ID)', 'Identity verification, claims to UI'],
                ['3', 'Refresh Token', 'n/a', 'Silent token renewal'],
                ['4', 'AI Agent CC Token', 'agent-gateway.pingdemo.com', 'Actor token for Exchange #1'],
                ['5', 'Intermediate Agent Token', 'ai-agent.pingdemo.com', 'Subject token for Exchange #2'],
                ['6', 'MCP Exchanger CC Token', 'mcp-gateway.pingdemo.com', 'Actor token for Exchange #2'],
                ['7', 'Final MCP Token', 'resource-server.pingdemo.com', 'Bearer sent to MCP Server'],
              ].map(([n, name, aud, use]) => (
                <tr key={n} style={{ background: n % 2 === 0 ? '#0f172a' : '#1e293b' }}>
                  <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#374151' }}>{n}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#e2e8f0', fontWeight: 500 }}>{name}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#67e8f9', fontFamily: 'inherit', fontSize: 11 }}>{aud}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#374151' }}>{use}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ color: "#374151", marginBottom: "1rem", marginTop: "0.5rem" }}>
            The live demo surfaces the full decoded token set in the Token Chain panel — you can inspect <code className="edu-code">sub</code>, <code className="edu-code">aud</code>, <code className="edu-code">scope</code>, <code className="edu-code">act</code>, and <code className="edu-code">may_act</code> for each token after a tool call.
          </p>

          <h4 style={{ marginTop: 20 }}>Key claim on User AT: <code>may_act</code></h4>
          <p>
            The User AT carries a <code>may_act</code> claim that acts as a pre-approval for
            Exchange #1. PingOne verifies that the presenting <code>actor_token.sub</code> matches
            this value before issuing the intermediate token.
          </p>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 6, fontSize: 12 }}>
{`{
  "sub": "<user-sub>",
  "aud": "https://ai-agent.pingdemo.com",
  "scope": "openid profile email offline_access read write ai:agent",
  "may_act": { "sub": "<ai-agent-client-id>" }
}`}
          </pre>
        </>
      ),
    },
    {
      id: 'exchange-flow',
      label: 'Exchange Flow',
      content: (
        <>
          <h3>RFC 8693 Exchange #1 — User AT → Intermediate Agent Token</h3>
          <p>
            The BFF calls PingOne's token endpoint using the AI Agent's client credentials as the
            actor, presenting the user's AT as the subject.
          </p>

          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 6, fontSize: 12 }}>
{`POST /as/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&subject_token=<user-access-token>
&subject_token_type=urn:ietf:params:oauth:token-type:access_token
&actor_token=<ai-agent-cc-token>
&actor_token_type=urn:ietf:params:oauth:token-type:access_token
&audience=https://ai-agent.pingdemo.com
&client_id=<PINGONE_AI_AGENT_CLIENT_ID>
&client_secret=<PINGONE_AI_AGENT_CLIENT_SECRET>`}
          </pre>

          <p>PingOne validates:</p>
          <ul style={{ fontSize: 13 }}>
            <li>User AT is valid and not expired</li>
            <li><code>actor_token.sub</code> matches <code>subject_token.may_act.sub</code></li>
            <li>Requested audience is allowed</li>
          </ul>

          <p>Issues <strong>Intermediate Agent Token</strong>:</p>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 6, fontSize: 12 }}>
{`{
  "sub": "<user-sub>",              // preserved
  "aud": "https://ai-agent.pingdemo.com",
  "scope": "read write",
  "act": { "sub": "<ai-agent-client-id>" }
}`}
          </pre>

          <hr style={{ borderColor: '#334155', margin: '24px 0' }} />

          <h3>RFC 8693 Exchange #2 — Intermediate Token → Final MCP Token</h3>
          <p>
            The BFF calls PingOne again using the MCP Exchanger's client credentials as actor,
            presenting the intermediate token as subject, and narrowing the scope to the specific
            tool being called.
          </p>

          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 6, fontSize: 12 }}>
{`POST /as/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&subject_token=<intermediate-agent-token>
&subject_token_type=urn:ietf:params:oauth:token-type:access_token
&actor_token=<mcp-exchanger-cc-token>
&actor_token_type=urn:ietf:params:oauth:token-type:access_token
&audience=https://resource-server.pingdemo.com
&scope=read                  ← narrowed to this tool's required scope
&client_id=<MCP_TOKEN_EXCHANGER_CLIENT_ID>
&client_secret=<MCP_TOKEN_EXCHANGER_CLIENT_SECRET>`}
          </pre>

          <p>Issues <strong>Final MCP Token</strong> with nested <code>act</code>:</p>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 6, fontSize: 12 }}>
{`{
  "sub": "<user-sub>",              // preserved end-to-end
  "aud": "https://resource-server.pingdemo.com",
  "scope": "read",          // narrowed
  "act": {
    "sub": "<mcp-exchanger-client-id>",
    "act": { "sub": "<ai-agent-client-id>" }  // nested chain
  }
}`}
          </pre>
        </>
      ),
    },
    {
      id: 'scopes-resources',
      label: 'Scopes & Resources',
      content: (
        <>
          <h3>Resource URIs</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1e293b', color: '#cbd5e1' }}>
                <th style={{ padding: '10px', border: '1px solid #334155', textAlign: 'left' }}>Resource URI</th>
                <th style={{ padding: '10px', border: '1px solid #334155', textAlign: 'left' }}>Used by</th>
                <th style={{ padding: '10px', border: '1px solid #334155', textAlign: 'left' }}>Env Var</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['https://ai-agent.pingdemo.com', 'User AT audience + Exchange #1 intermediate token', 'PINGONE_RESOURCE_URI / MCP_RESOURCE_URI'],
                ['https://agent-gateway.pingdemo.com', 'AI Agent CC Token audience', 'PINGONE_AGENT_GATEWAY_URI'],
                ['https://mcp-gateway.pingdemo.com', 'MCP Exchanger CC Token audience', 'PINGONE_MCP_GATEWAY_URI'],
                ['https://resource-server.pingdemo.com', 'Final MCP Token audience', 'PINGONE_RESOURCE_SERVER_URI / MCP_RESOURCE_SERVER_URI'],
              ].map(([uri, use, env]) => (
                <tr key={uri}>
                  <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#67e8f9', fontFamily: 'inherit', fontSize: 11 }}>{uri}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#374151' }}>{use}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#a3e635', fontFamily: 'inherit', fontSize: 11 }}>{env}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ color: "#374151", marginBottom: "1rem", marginTop: "0.5rem" }}>
            Each route or service enforces its own audience and scope independently. A token valid for the MCP server resource is not valid at the banking API resource, even if both are in the same PingOne environment. The gateway enforces this boundary at each route.
          </p>

          <h3 style={{ marginTop: 20 }}>Scope Definitions</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1e293b', color: '#cbd5e1' }}>
                <th style={{ padding: '10px', border: '1px solid #334155', textAlign: 'left' }}>Scope</th>
                <th style={{ padding: '10px', border: '1px solid #334155', textAlign: 'left' }}>Tools</th>
                <th style={{ padding: '10px', border: '1px solid #334155', textAlign: 'left' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['read', 'get_account_balance, get_transaction_history, get_investments, search_transactions', 'Read-only banking data'],
                ['write', 'transfer_funds, make_payment', 'Mutations — requires HITL consent'],
                ['ai:agent', 'query_ai (natural language)', 'AI query tool'],
                ['openid profile email', 'n/a', 'OIDC identity — on User AT only'],
                ['offline_access', 'n/a', 'Refresh token — User AT only'],
                ['admin:read admin:write users:read users:manage', 'admin tools', 'Worker app scopes — separate flow'],
              ].map(([scope, tools, notes]) => (
                <tr key={scope}>
                  <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#a3e635', fontFamily: 'inherit', fontSize: 11 }}>{scope}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#374151', fontSize: 12 }}>{tools}</td>
                  <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#374151', fontSize: 12 }}>{notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    },
    {
      id: 'act-chain',
      label: 'act Claim Chain',
      content: (
        <>
          <h3>RFC 8693 § 4.2 — The <code>act</code> Claim Delegation Chain</h3>
          <p>
            After both exchanges, the final MCP Token contains a nested <code>act</code> structure
            that encodes the full delegation chain. Each actor wraps the previous one.
          </p>
          <p>
            Reading from outside in: <em>mcp-exchanger acted on behalf of ai-agent, which acted
            on behalf of the user.</em>
          </p>

          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 6, fontSize: 12 }}>
{`// Final MCP Token — decoded payload
{
  "sub": "b8e9302a-user-id",           // ← always the original user
  "aud": "https://resource-server.pingdemo.com",
  "scope": "read",

  "act": {
    "sub": "mcp-exchanger-client-id",  // ← outermost actor (Exchange #2 actor)
    "act": {
      "sub": "ai-agent-client-id"      // ← inner actor (Exchange #1 actor)
    }
  }
}`}
          </pre>

          <h4>How the MCP Server validates this</h4>
          <ol style={{ fontSize: 13, lineHeight: 1.8 }}>
            <li>Verify JWT signature using PingOne JWKS</li>
            <li>Verify <code>aud</code> = <code>resource-server.pingdemo.com</code></li>
            <li>Verify <code>scope</code> contains the required tool scope</li>
            <li>Check <code>act.sub</code> is a known MCP exchanger client ID</li>
            <li>Optionally check <code>act.act.sub</code> is a known AI agent client ID</li>
            <li><code>sub</code> is the user — used for audit logging and data isolation</li>
          </ol>

          <h4 style={{ marginTop: 20 }}>How this differs from <code>may_act</code></h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1e293b', color: '#cbd5e1' }}>
                <th style={{ padding: '10px', border: '1px solid #334155' }}>Claim</th>
                <th style={{ padding: '10px', border: '1px solid #334155' }}>RFC</th>
                <th style={{ padding: '10px', border: '1px solid #334155' }}>Direction</th>
                <th style={{ padding: '10px', border: '1px solid #334155' }}>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#67e8f9', fontFamily: 'inherit' }}>may_act</td>
                <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#374151' }}>§ 4.3</td>
                <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#374151' }}>Forward-looking</td>
                <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#374151' }}>User pre-approves who may exchange this token</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#67e8f9', fontFamily: 'inherit' }}>act</td>
                <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#374151' }}>§ 4.2</td>
                <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#374151' }}>Retrospective</td>
                <td style={{ padding: '8px 10px', border: '1px solid #334155', color: '#374151' }}>Records who actually exercised delegation (audit trail)</td>
              </tr>
            </tbody>
          </table>

          <h4 style={{ marginTop: 20 }}>Source file</h4>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 6, fontSize: 12 }}>
{`// banking_api_server/services/tokenExchangeService.js
// exchangeForMcpToken() — performs both exchanges in sequence
// buildExchangeParams() — constructs RFC 8693 request params for each step`}
          </pre>
        </>
      ),
    },
    {
      id: 'what-changed',
      label: 'What Changed',
      content: (
        <>
          <h3 style={{ marginTop: 0 }}>Token-by-Token: What Changed at Each Step</h3>
          <p style={{ color: '#374151', fontSize: '0.85rem', marginBottom: 16 }}>
            Each row is one token or exchange. The right column shows what was added, removed, or narrowed versus the previous token.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#1e293b' }}>
                  <th style={{ padding: '10px 12px', border: '1px solid #334155', textAlign: 'left', color: '#cbd5e1', width: '30%' }}>Token / Step</th>
                  <th style={{ padding: '10px 12px', border: '1px solid #334155', textAlign: 'left', color: '#cbd5e1' }}>What changed</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    step: '① User Login',
                    token: 'User Access Token',
                    color: '#d97706',
                    bg: '#1c1a0d',
                    rows: [
                      ['aud set →', 'https://ai-agent.pingdemo.com  (broad user-facing resource)'],
                      ['scope set →', 'openid profile email offline_access read write ai:agent'],
                      ['may_act added →', '{ "sub": "<ai-agent-client-id>" }  — pre-approval for Exchange #1'],
                      ['act', '(absent — no delegation yet)'],
                      ['where it lives', 'BFF server session only — never sent to browser or LLM'],
                    ],
                  },
                  {
                    step: '② Exchange #1',
                    token: 'RFC 8693 request to PingOne',
                    color: '#7c3aed',
                    bg: '#150d26',
                    rows: [
                      ['subject_token', 'User AT (proves user identity)'],
                      ['actor_token', 'AI Agent CC Token (proves agent identity)'],
                      ['PingOne checks →', 'actor_token.sub === subject_token.may_act.sub'],
                      ['result', 'Intermediate Agent Token (below)'],
                    ],
                  },
                  {
                    step: '③ Intermediate Agent Token',
                    token: 'After Exchange #1',
                    color: '#8b5cf6',
                    bg: '#1a1033',
                    rows: [
                      ['sub', 'UNCHANGED — still <user-id>'],
                      ['aud', 'UNCHANGED — still https://ai-agent.pingdemo.com'],
                      ['scope', 'NARROWED → read  write  (OIDC claims removed)'],
                      ['may_act', 'REMOVED — no further prospective delegation'],
                      ['act added →', '{ "sub": "<ai-agent-client-id>" }  — delegation fact recorded'],
                    ],
                  },
                  {
                    step: '④ Exchange #2',
                    token: 'RFC 8693 request to PingOne',
                    color: '#7c3aed',
                    bg: '#150d26',
                    rows: [
                      ['subject_token', 'Intermediate Agent Token'],
                      ['actor_token', 'MCP Exchanger CC Token (proves MCP exchanger identity)'],
                      ['scope requested →', 'read  (narrowed to this specific tool)'],
                      ['audience requested →', 'https://resource-server.pingdemo.com'],
                      ['result', 'Final MCP Token (below)'],
                    ],
                  },
                  {
                    step: '⑤ Final MCP Token',
                    token: 'After Exchange #2',
                    color: '#16a34a',
                    bg: '#0d1a0d',
                    rows: [
                      ['sub', 'UNCHANGED — still <user-id> end-to-end ✓'],
                      ['aud', 'CHANGED → https://resource-server.pingdemo.com  (MCP server audience)'],
                      ['scope', 'NARROWED → read  (single tool permission only) ✓'],
                      ['act', 'NESTED → { "sub": "mcp-exchanger-id", "act": { "sub": "ai-agent-id" } }'],
                      ['where it goes', 'Bearer header sent to MCP Server — the only token that leaves BFF'],
                    ],
                  },
                  {
                    step: '⑥ Browser / UI',
                    token: 'What reaches the client',
                    color: '#3b82f6',
                    bg: '#0f1f35',
                    rows: [
                      ['raw tokens', 'NEVER sent to browser'],
                      ['decoded claims', 'Served via /api/tokens/session-preview and /api/token-chain'],
                      ['visible fields', 'sub, aud, scope, act, may_act, iat, exp — read-only display'],
                    ],
                  },
                ].map(({ step, token, color, bg, rows }) => (
                  <React.Fragment key={step}>
                    {/* Section header row */}
                    <tr style={{ background: bg }}>
                      <td
                        colSpan={2}
                        style={{
                          padding: '8px 12px',
                          border: `1px solid ${color}`,
                          borderLeft: `4px solid ${color}`,
                          color,
                          fontWeight: 700,
                          fontSize: '0.76rem',
                        }}
                      >
                        {step} — <span style={{ fontWeight: 400, color: '#374151' }}>{token}</span>
                      </td>
                    </tr>
                    {/* Detail rows */}
                    {rows.map(([field, value], i) => (
                      <tr key={field} style={{ background: i % 2 === 0 ? '#0f172a' : '#111827' }}>
                        <td style={{
                          padding: '6px 12px 6px 24px',
                          border: '1px solid #1e293b',
                          borderLeft: `4px solid ${color}`,
                          color: '#374151',
                          fontFamily: 'inherit',
                          whiteSpace: 'nowrap',
                          verticalAlign: 'top',
                        }}>
                          {field}
                        </td>
                        <td style={{
                          padding: '6px 12px',
                          border: '1px solid #1e293b',
                          color: '#e2e8f0',
                          fontFamily: value.startsWith('{') || value.includes('→') ? 'inherit' : 'inherit',
                          fontSize: value.startsWith('{') ? '0.72rem' : 'inherit',
                          lineHeight: 1.5,
                        }}>
                          {value.includes('UNCHANGED') && (
                            <span style={{ color: '#22c55e', fontWeight: 600 }}>{value}</span>
                          )}
                          {value.includes('NARROWED') && (
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>{value}</span>
                          )}
                          {value.includes('CHANGED') && !value.includes('UNCHANGED') && (
                            <span style={{ color: '#60a5fa', fontWeight: 600 }}>{value}</span>
                          )}
                          {value.includes('REMOVED') && (
                            <span style={{ color: '#f87171', fontWeight: 600 }}>{value}</span>
                          )}
                          {value.includes('NEVER') && (
                            <span style={{ color: '#f87171', fontWeight: 600 }}>{value}</span>
                          )}
                          {!value.includes('UNCHANGED') && !value.includes('NARROWED') &&
                           !value.includes('REMOVED') && !value.includes('NEVER') &&
                           !(value.includes('CHANGED') && !value.includes('UNCHANGED')) && (
                            <span>{value}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Colour legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', fontSize: '0.7rem' }}>
            {[
              ['#22c55e', 'UNCHANGED'],
              ['#f59e0b', 'NARROWED'],
              ['#60a5fa', 'CHANGED'],
              ['#f87171', 'REMOVED / NEVER'],
            ].map(([color, label]) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#374151' }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color }} />
                {label}
              </span>
            ))}
          </div>
        </>
      ),
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="2-Token Exchange Flow"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
